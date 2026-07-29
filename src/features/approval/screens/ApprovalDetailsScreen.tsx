import React, { useCallback, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Surface } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { COLORS } from "@/src/constants/theme";
import { showToast } from "@/src/components/common/Toast";
import ApprovalHeaderCard from "../components/ApprovalHeaderCard";
import GeneralInformationCard from "../components/GeneralInformationCard";
import PaymentAccordion from "../components/PaymentAccordion";
import AttachmentList from "../components/AttachmentList";
import ApprovalBottomBar from "../components/ApprovalBottomBar";
import ApprovalDetailsSkeleton from "../components/ApprovalDetailsSkeleton";
import EmptyApprovalState from "../components/EmptyApprovalState";
import ApproveDialog from "../components/dialogs/ApproveDialog";
import RejectDialog from "../components/dialogs/RejectDialog";
import ApprovalLoadingDialog from "../components/dialogs/ApprovalLoadingDialog";
import ApprovalSuccessDialog from "../components/dialogs/ApprovalSuccessDialog";
import { useApprovalDetails } from "../hooks/useApprovalDetails";
import type { ApprovalAttachment } from "../types";

// Android needs this opt-in for LayoutAnimation to run at all.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ApprovalDetailsScreen() {
  const params = useLocalSearchParams<{ requestNo?: string }>();
  const {
    detail,
    loading,
    refreshing,
    error,
    stage,
    decision,
    onRefresh,
    retry,
    openApprove,
    openReject,
    closeDialog,
    submitDecision,
  } = useApprovalDetails(params.requestNo);

  // Only one payment open at a time keeps the screen short.
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);

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

  const handleAttachment = useCallback((attachment: ApprovalAttachment) => {
    // UI-only: opening/downloading files arrives with the backend phase.
    showToast(`${attachment.name} is not available in this preview.`, "info");
  }, []);

  const handleInvoicePress = useCallback((invoice: string) => {
    showToast(`Invoice ${invoice} opens in a later phase.`, "info");
  }, []);

  /** Done on the success dialog: close, confirm, and return to the list. */
  const handleDone = useCallback(() => {
    closeDialog();
    showToast(
      decision === "approve"
        ? "Request approved successfully."
        : "Request rejected.",
      decision === "approve" ? "success" : "error",
    );
    router.back();
  }, [closeDialog, decision]);

  if (loading) return <ApprovalDetailsSkeleton />;

  if (error || !detail) {
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
          <GeneralInformationCard
            detail={detail}
            onPressInvoice={handleInvoicePress}
          />

          {/* ── Payment information ── */}
          <Surface style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PAYMENT INFORMATION</Text>
            </View>

            {detail.payments.map((payment) => (
              <PaymentAccordion
                key={payment.id}
                payment={payment}
                expanded={expandedPaymentId === payment.id}
                onToggle={() => togglePayment(payment.id)}
              />
            ))}
          </Surface>

          <AttachmentList
            attachments={detail.attachments}
            onView={handleAttachment}
            onDownload={handleAttachment}
          />
        </View>
      </ScrollView>

      <ApprovalBottomBar onReject={openReject} onApprove={openApprove} />

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
      <ApprovalLoadingDialog visible={stage === "loading"} decision={decision} />
      <ApprovalSuccessDialog
        visible={stage === "success"}
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIndicator: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
});
