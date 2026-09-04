import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { showToast } from "@/src/components/common/Toast";
import { setHeaderEditHandler } from "@/src/utils/headerEdit";
import ApprovalHeaderCard from "../components/ApprovalHeaderCard";
import GeneralInformationCard from "../components/GeneralInformationCard";
import SapInfoCard from "@/src/features/payments/components/SapInfoCard";
import InvoiceSummaryCard from "@/src/features/payments/components/InvoiceSummaryCard";
import PaymentAccordion from "../components/PaymentAccordion";
import AttachmentList from "../components/AttachmentList";
import AttachmentViewer from "../components/AttachmentViewer";
import ApprovalBottomBar from "../components/ApprovalBottomBar";
import VerifyBottomBar from "@/src/features/payments/components/VerifyBottomBar";
import VerifyDialog from "@/src/features/payments/components/VerifyDialog";
import { useAuth } from "@/src/context/AuthContext";
import { can, PERMISSION_KEYS } from "@/src/constants/permissions";
import paymentsService from "@/src/services/payments.service";
import ApprovalDetailsSkeleton from "../components/ApprovalDetailsSkeleton";
import EmptyApprovalState from "../components/EmptyApprovalState";
import ApproveDialog from "../components/dialogs/ApproveDialog";
import RejectDialog from "../components/dialogs/RejectDialog";
import ApprovalLoadingDialog from "../components/dialogs/ApprovalLoadingDialog";
import ApprovalSuccessDialog from "../components/dialogs/ApprovalSuccessDialog";
import SapErrorDialog from "../components/dialogs/SapErrorDialog";
import { useApprovalDetails } from "../hooks/useApprovalDetails";
import type { ApprovalAttachment } from "../types";

// Android needs this opt-in for LayoutAnimation to run at all.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ApprovalDetailsScreen() {
  // `documentId` is the PaymentReceipt id — the payload this screen renders.
  // `id` is the approval request id, kept for callers that still send it.
  const params = useLocalSearchParams<{
    requestNo?: string;
    documentId?: string;
    id?: string;
    /**
     * The screen to return to after acting. Purely navigational — it does NOT
     * decide which actions are offered; see `verifying` below.
     */
    from?: string;
  }>();

  /**
   * Where a decided payment sends the user.
   *
   * Back to the list they came from, with a refetch signal, so the entry
   * appears in its NEW state instead of the stale row they tapped. This
   * screen also serves the generic approval list — `documentId` is sent only
   * by the payments screens, so it discriminates, and everything else backs
   * out the way it came. Defined here because BOTH exits use it: the Done
   * button and the success dialog's own dismiss timer.
   */
  const leaveAfterDecision = useCallback(() => {
    if (params.documentId) {
      // `from` names the actual origin, so a verifier who opened this from
      // the home page returns to the home page rather than being dropped on
      // a queue they never visited.
      const back =
        params.from === "payments/verification"
          ? "/(main)/payments/verification"
          : params.from === "dashboard"
            ? "/(main)/dashboard"
            : "/(main)/payments/payment-tracking";
      router.replace({
        pathname: back,
        params: { refreshAt: String(Date.now()) },
      } as never);
      return;
    }
    router.back();
  }, [params.documentId, params.from]);

  const {
    detail,
    loading,
    refreshing,
    error,
    stage,
    isFinal,
    decision,
    onRefresh,
    retry,
    clearError,
    openApprove,
    openReject,
    closeDialog,
    submitDecision,
  } = useApprovalDetails(params.requestNo, params.documentId);

  /**
   * ── Which action bar this user gets ───────────────────────────────────
   *
   * Decided from WHO THEY ARE and WHAT STATE THE RECEIPT IS IN — never from
   * the screen they arrived by. The same payment opened from the home page,
   * the tracking list or the verification queue must offer the same actions,
   * because the user's rights do not change with the route they took.
   *
   *   holds Payments_Verify + receipt awaiting verification -> Edit / Verify
   *   the approver holding it right now                     -> Reject / Approve
   *   anyone else (a creator, a bystander)                  -> no bar
   *
   * Verification is checked FIRST because it comes first in the lifecycle: a
   * receipt awaiting its handover check is not yet with an approver, so the
   * two can never both be true for the same document.
   */
  const { user } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySubmitting, setVerifySubmitting] = useState(false);

  const awaitingVerification = detail?.verificationStatus === "PENDING";
  const holdsVerifyKey = can(user, PERMISSION_KEYS.PAYMENTS_VERIFY);
  const verifying = awaitingVerification && holdsVerifyKey;

  // The backend forbids verifying a payment you raised. Surfaced here so the
  // button explains itself rather than failing after a tap; the server stays
  // the enforcement point.
  const ownReceipt =
    detail?.createdById != null && detail.createdById === user?.id;

  const handleVerify = useCallback(
    async (remarks: string) => {
      if (!detail) return;
      setVerifyOpen(false);
      setVerifySubmitting(true);
      try {
        await paymentsService.verifyReceipt(detail.documentId, remarks);
        // Only after the server confirms — the verification state is its
        // answer, never a local guess.
        showToast("Payment verified and sent for approval.", "success");
        leaveAfterDecision();
      } catch (err) {
        // Every refusal lands here — no permission, already verified by
        // someone else, own receipt, already in SAP. The server's wording
        // names the actual reason, so it is shown as-is and the page reloads
        // to reflect whatever is now true.
        showToast(
          (err as Error)?.message || "Could not verify this payment.",
          "error",
        );
        onRefresh();
      } finally {
        setVerifySubmitting(false);
      }
    },
    [detail, leaveAfterDecision, onRefresh],
  );
  // The dialog no longer dismisses itself, so there is no auto-leave callback:
  // navigation happens only when the approver taps Done (see handleDone).

  // Only one payment open at a time keeps the screen short.
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ApprovalAttachment | null>(null);
  const isFocused = useIsFocused();

  /**
   * Refetch whenever this screen comes back into view.
   *
   * The edit form returns here after a save, and this screen stays MOUNTED
   * underneath it the whole time — so without this the user came back to the
   * figures they had just changed, showing their old values. Skipped on the
   * first focus, since the hook's own mount fetch has already run.
   */
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      onRefresh();
    }, [onRefresh]),
  );

  const togglePayment = useCallback((id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpandedPaymentId((prev) => (prev === id ? null : id));
  }, []);

  /**
   * Open one attachment.
   *
   * The download endpoint is permission-checked and needs the Authorization
   * header, so it cannot simply be handed to Linking.openURL — that would be a
   * bare request and come back 401. Fetching it with the token and caching it
   * locally is the real fix; until that exists, say so plainly rather than
   * opening something that fails.
   */
  /** Open the Receive Payment screen in edit mode — same form, prefilled. */
  const handleEdit = useCallback(() => {
    if (!detail) return;
    router.push({
      pathname: "/(main)/payments/receive-payment",
      params: {
        receiptId: String(detail.documentId),
        // Back from the edit form returns to THIS detail screen, not to
        // whatever the drawer last had — the same `from` contract the
        // tracking list uses when it opens this page.
        from: "approval/approval-details",
        // ...and the list behind THIS screen, so that when the form sends the
        // user back here, this page's own Back still reaches the queue they
        // started in rather than falling through to the dashboard.
        origin: params.from ?? "",
      },
    } as never);
  }, [detail, params.from]);


  /** Open one attachment in the in-app viewer. */
  const handleAttachment = useCallback((attachment: ApprovalAttachment) => {
    if (!attachment.downloadUrl) {
      showToast(`${attachment.name} has no stored file.`, "info");
      return;
    }
    setViewing(attachment);
  }, []);


  /**
   * Done on the success dialog: close, confirm, and leave.
   *
   * A payment goes to Payment Tracking with a refetch signal, so the approver
   * sees the entry in its NEW status rather than the stale row they left. This
   * screen also serves the generic approval list, though — `documentId` is only
   * ever sent by the payments tracking screen, so it is the discriminator, and
   * anything else keeps the plain back-out to wherever it came from.
   */
  const handleDone = useCallback(() => {
    // No toast. The dialog the approver just read already stated the outcome —
    // including whether SAP accepted the posting — so a banner repeating it
    // over the next screen adds nothing and covers the row they came to see.
    closeDialog();

    // The FINAL approval posts to SAP, so this page now carries something the
    // approver could not see before they acted: the DocEntry, the DocNum and
    // SAP's own words. Leaving would throw that away and make them find the
    // row again to read it, so we stay and refetch instead.
    //
    // Only for an APPROVAL. `isFinal` is also true of a rejection — that ends
    // the chain too — but a rejected document never reaches SAP, so there is
    // no posting result to read and staying would just strand the approver on
    // a document they have finished with.
    //
    // An intermediate approval has no outcome to show either: the document has
    // simply moved to the next rung, which is another queue's business.
    if (isFinal && decision === "approve") {
      onRefresh();
      return;
    }
    leaveAfterDecision();
  }, [closeDialog, isFinal, decision, onRefresh, leaveAfterDecision]);

  /**
   * Publish Edit into the navbar while THIS screen is focused, and withdraw it
   * the moment it is not.
   *
   * Tied to focus rather than mount: pushing the edit form leaves this screen
   * mounted underneath, so an unmount-only cleanup left the icon showing on the
   * next screen — which is how it appeared on pages that have nothing to edit.
   */
  useFocusEffect(
    useCallback(() => {
      setHeaderEditHandler(canEditRef.current ? handleEditRef.current : null);
      return () => setHeaderEditHandler(null);
    }, []),
  );

  // Refs so the focus effect above can stay dependency-free — re-running it on
  // every detail change would re-register during the blur transition and put
  // the icon back after the cleanup had removed it.
  const canEditRef = useRef(false);
  const handleEditRef = useRef(handleEdit);
  useEffect(() => {
    canEditRef.current = !!detail?.canEdit;
    handleEditRef.current = handleEdit;
    // Keep the live registration in step while this screen IS focused.
    if (isFocused) {
      setHeaderEditHandler(detail?.canEdit ? handleEdit : null);
    }
  }, [detail?.canEdit, handleEdit, isFocused]);

  if (loading) return <ApprovalDetailsSkeleton />;

  // Only a LOAD failure blanks the screen. An error raised while the document
  // is on screen — a SAP rejection after approving — belongs beside it as a
  // banner, because the document is exactly what the user needs to see.
  if (!detail) {
    return (
      <View style={styles.container}>
        <EmptyApprovalState
          error={error ?? "This approval request could not be loaded."}
          onRetry={retry}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <ApprovalHeaderCard detail={detail} />

        <View style={styles.body}>

          {/* Why it came back. Shown above everything else because it is the
              first thing the creator needs — the fix depends on it. */}
          {detail.rejectionReason ? (
            <View style={styles.rejectBanner}>
              <Ionicons
                name="alert-circle"
                size={ms(20)}
                color={COLORS.error}
              />
              <View style={styles.rejectText}>
                <Text style={styles.rejectTitle}>
                  Rejected{detail.rejectedBy ? ` by ${detail.rejectedBy}` : ""}
                </Text>
                <Text style={styles.rejectReason}>{detail.rejectionReason}</Text>
                {detail.canEdit ? (
                  <Text style={styles.rejectHint}>
                    Tap Edit at the top to correct it and resubmit.
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <GeneralInformationCard detail={detail} />

          {/* ── SAP outcome ──
              Same card, same position, as the deposit detail screen. Renders
              nothing until a posting has been attempted, so a receipt still in
              approval shows no empty SAP box. Only the outcome — the approval
              ladder stays on View Progress. */}
          <SapInfoCard
            doc={detail.sap}
            kind="payment"
            receiptId={
              detail.documentId != null ? Number(detail.documentId) : undefined
            }
          />

          {/* Same card as the create form, so the figures an approver checks
              are the ones the creator saw. Hidden for an advance, and for older
              receipts that stored no invoice figure. */}
          {detail.invoiceAmount > 0 ? (
            <InvoiceSummaryCard
              invoiceNo={detail.invoice}
              invoiceAmount={detail.invoiceAmount}
              receivedAmount={detail.amount}
            />
          ) : null}

          {/* ── Payment information ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons
                  name="wallet"
                  size={ms(16)}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.sectionTitle}>Payment Information</Text>
            </View>

            {detail.payments.map((payment) => (
              <PaymentAccordion
                key={payment.id}
                payment={payment}
                expanded={expandedPaymentId === payment.id}
                onToggle={() => togglePayment(payment.id)}
                onViewAttachment={handleAttachment}
              />
            ))}
          </View>

          <AttachmentList
            attachments={detail.attachments}
            onView={handleAttachment}
            onDownload={handleAttachment}
          />
        </View>
      </ScrollView>

      {/* Only for someone who can act on it RIGHT NOW. A creator never sees
          it, and nobody sees it once the document is decided — an Approve
          button that cannot approve is worse than no button.

          In verification mode the same slot carries Edit + Verify: same page,
          same layout, the actions of the job the user came to do. */}
      {verifying ? (
        <VerifyBottomBar
          onEdit={handleEdit}
          onVerify={() => setVerifyOpen(true)}
          canVerify={!ownReceipt}
          disabled={verifySubmitting}
        />
      ) : detail.canDecide ? (
        <ApprovalBottomBar onReject={openReject} onApprove={openApprove} />
      ) : null}

      {/* ── Decision flow: confirm → loading → success ── */}
      <ApproveDialog
        visible={stage === "approve"}
        onClose={closeDialog}
        onConfirm={(remarks) => submitDecision("approve", remarks)}
      />
      <RejectDialog
        visible={stage === "reject"}
        onClose={closeDialog}
        onConfirm={(remarks) => submitDecision("reject", remarks)}
      />
      {/* Verification confirmation. Its Done handler returns to the queue,
          so the verified entry is gone from the list rather than lingering. */}
      <VerifyDialog
        visible={verifyOpen}
        receiptNo={detail.requestNo}
        // `ApprovalDetail.amount` is typed `number` but the mapper assigns the
        // already-formatted string from `money()`. Coerced rather than
        // "corrected": the type is wrong repo-wide and every consumer renders
        // it as text, so changing it here would be a wide unrelated edit.
        amount={String(detail.amount)}
        onClose={() => setVerifyOpen(false)}
        onConfirm={handleVerify}
      />

      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />


      {/* SAP refused the posting. A dialog rather than a page: the document is
          still valid and still on screen behind it — only the posting failed. */}
      <SapErrorDialog
        visible={!!error}
        message={error ?? ""}
        canEdit={!!detail.canEdit}
        onEdit={() => {
          clearError();
          handleEdit();
        }}
        // Closing STAYS on this page and refetches, the same as Done on the
        // success dialog. The approval landed and only the posting failed, so
        // this is now the one screen carrying SAP's own words about why —
        // exactly what the approver needs to read before deciding whether to
        // edit and retry. Leaving would make them find the row again to see
        // the reason they were just shown a summary of.
        onClose={() => {
          clearError();
          onRefresh();
        }}
      />

      <ApprovalLoadingDialog visible={stage === "loading"} decision={decision} />
      <ApprovalSuccessDialog
        visible={stage === "success"}
        isFinal={isFinal}
        decision={decision}
        requestNo={detail.requestNo}
        date={detail.createdDate}
        time={detail.createdTime}
        onDone={handleDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  body: {
    padding: 16,
  },
  // Matches GeneralInformationCard exactly — same radius, padding, border and
  // shadow — so the page reads as one stack of cards rather than three styles.
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  rejectBanner: {
    flexDirection: "row",
    gap: sp(10),
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: sp(14),
    padding: sp(14),
    marginBottom: sp(14),
  },
  rejectText: {
    flex: 1,
    minWidth: 0,
  },
  rejectTitle: {
    fontSize: fs(13),
    fontWeight: "800",
    color: COLORS.error,
  },
  rejectReason: {
    fontSize: fs(13),
    lineHeight: fs(19),
    color: COLORS.text,
    marginTop: sp(3),
  },
  rejectHint: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginTop: sp(5),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(14),
  },
  sectionIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIndicatorLegacy: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
});
