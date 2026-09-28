import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AttachmentPicker from "@/app/(main)/payments/_components/AttachmentPicker";
import type { AttachmentStub } from "@/app/(main)/payments/_lib/types";
import { appAlert } from "@/src/components/common/AppDialog";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/constants/theme";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { setHeaderEditHandler } from "@/src/utils/headerEdit";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentError,
  advancePaymentProblems,
  advancePaymentService,
  type AdvancePaymentCompany,
  type ApiRequest,
  type PaymentProofQuery,
  type PaymentProofResult,
  type ProofCheck,
  type StageAction,
} from "@/src/services/advancePayment.service";

import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";

import AttachmentViewerModal, {
  type AttachmentSource,
} from "../components/AttachmentViewerModal";
import { DecisionDone, DecisionPrompt } from "../components/DecisionDialogs";
import PayoutEditor, { type PayoutStatus } from "../components/PayoutEditor";
import {
  paymentAgainstLabel,
  requestAmount,
  returnMethodLabel,
  typeLabel,
} from "../logic/approvalData";
import type { AdvanceRequestEntry } from "../logic/approvalData";
import { PAYOUT_METHODS, isTransfer, type PayoutLine } from "../logic/payout";
import { formatSize, type FileAttachment } from "../logic/attachments";
import { fromApiRequest } from "../logic/requestApi";
import { STATUS_LABEL, formatDateTime, priorityLabel } from "../logic/requestLabels";
import {
  REFERENCE_KINDS,
  allocationRows,
  allocationTotals,
  formatDate,
  resolveCase,
} from "../logic/rules";

/**
 * One advance payment request, read the way a bank deposit is read.
 *
 * THE DEPOSIT DETAIL PAGE, part for part and in its order: the flush gradient
 * header stating the MOVEMENT (the company the money leaves, an arrow, who
 * receives it) with the status pill; General Information as a two-column icon
 * grid with a badge on its own header line; the summary card of two figures
 * split by a rule; the SAP card with its outcome badge and SAP's own words; then
 * the lists, each row an icon circle with a rule only BETWEEN rows.
 *
 * The metrics are `payments/DepositDetailsScreen` and `SapInfoCard` to the
 * pixel, copied rather than imported because the data behind them is a
 * different shape and sharing the components would mean bending `BankDeposit`
 * around an advance request.
 *
 * The approval ROUTE and the history are NOT here: they are the Progress
 * screen, which the card's "View Progress" button opens. This page answers
 * "what is this request?" — and, for whoever holds it, offers the decision.
 *
 * WHICH BUTTONS APPEAR IS THE SERVER'S ANSWER, not this screen's guess. The
 * `can` block says what the caller may do — holding the approval permission is
 * not enough, since the server also requires the caller to be the current
 * stage's effective user. Every action sends the flow `version` it was read at,
 * so an action taken on a stale screen is refused rather than applied to a
 * request somebody else has already moved on.
 */

/** Pill colour follows the outcome, not one flat accent. */
const STATUS_COLOR: Record<string, string> = {
  PENDING: COLORS.warning,
  RETURNED: COLORS.primary,
  APPROVED: COLORS.success,
  REJECTED: COLORS.error,
  CANCELLED: COLORS.textSecondary,
};

/**
 * The log actions that mean "this entry was changed" — as the server names them
 * (`advance_payment/models.py`, `LogAction`).
 *
 * An edit, a resubmission after one, and the paying desk saving the payment
 * details. A decision is not an update: it moves the request on without
 * changing what it says, and it belongs to the history on the Progress page.
 */
const UPDATE_ACTIONS = new Set(["EDITED", "RESUBMITTED", "PAYOUT_UPDATED"]);

/**
 * The stages that come AFTER the payment details are filled.
 *
 * `flow.current_role` is the server's own name for where the request sits, so
 * "has it passed Payment?" is answered by the route itself rather than guessed
 * from whether a payout row happens to exist.
 */
const PAST_PAYMENT_ROLES = new Set(["AUDIT", "FINAL"]);

const money = (value: number) =>
  `₹${(Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function AdvanceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);
  // Only for the name a recorded UTR is stamped with — who read the proof.
  const { user } = useAuth();

  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  /** The decision being confirmed, if any — the prompt dialog's subject. */
  const [asking, setAsking] = useState<StageAction | null>(null);
  const [acting, setActing] = useState<StageAction | null>(null);
  /** The payout editor's own state — see `PayoutStatus`. */
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null);
  /**
   * Remarks written on the page, optional, carried into whichever decision
   * dialog opens next. The dialog is where they are confirmed and where a
   * rejection insists on them; this is somewhere to write them while reading.
   */
  const [remarks, setRemarks] = useState("");
  /** What was just done, for the closing dialog. */
  const [done, setDone] = useState<{
    action: StageAction;
    requestNo: string;
    status: string;
    /** The approval that COMPLETED the request — it went to SAP, not onward. */
    final: boolean;
  } | null>(null);
  /** Which document rows are open. Collapsed by default: the list is the point. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** The read-only Remarks &amp; Updates box. Open to start; see its comment. */
  const [notesOpen, setNotesOpen] = useState(false);
  /** The file being looked at, if any — see `AttachmentViewerModal`. */
  const [viewing, setViewing] = useState<AttachmentSource | null>(null);


  const scroller = useRef<ScrollView>(null);
  const remarksCard = useRef<View>(null);

  /** Where the scroll is, kept so a focused row can be measured against it. */
  const scrollY = useRef(0);
  /** The scroll's own box in window coordinates: the page above the keyboard. */
  const frame = useRef<View>(null);
  const frameBox = useRef({ top: 0, bottom: 0 });
  /** The row whose field has the keyboard, until it gives it up. */
  const focusedRow = useRef<View | null>(null);
  /**
   * How much of the screen the keyboard takes.
   *
   * IT IS ALSO PADDING. Under edge-to-edge Android the window does NOT resize
   * for the keyboard, so the page keeps its full height and a field near the
   * bottom has nowhere to scroll TO — the last card is already at the end of
   * the content. Adding the keyboard's height to the content's bottom makes the
   * room that the lift then uses.
   */
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const keyboardHeight = useRef(0);

  /**
   * Lift the focused row clear of the keyboard, by exactly as much as it is
   * covered and no more.
   *
   * MEASURED IN THE WINDOW, not against the scroll's inner view: the new
   * renderer refuses `measureLayout` against a node handle (which is what
   * `getInnerViewNode` returns) and warns instead of scrolling at all.
   *
   * The visible bottom is whichever is higher — the scroll's own bottom edge
   * (when the window DID resize, it already sits above the keyboard) or the
   * window less the keyboard (when it did not). Taking the smaller of the two
   * is right on both, with no guess about which mode the platform is in.
   *
   * A row taller than the space left over is aligned to the top of that space
   * instead of being pushed out of sight above it.
   */
  const lift = useCallback((height: number) => {
    const node = focusedRow.current;
    if (!node) return;
    node.measureInWindow?.((_x, y, _width, rowHeight) => {
      if (typeof y !== "number" || Number.isNaN(y)) return;
      const box = frameBox.current;
      const windowBottom = Dimensions.get("window").height - height;
      const visibleBottom = Math.min(box.bottom || windowBottom, windowBottom) - sp(16);
      const visibleTop = (box.top || 0) + sp(8);
      const covered = y + (rowHeight || 0) - visibleBottom;
      if (covered <= 0) return;
      const shift = Math.max(0, Math.min(covered, y - visibleTop));
      if (shift <= 0) return;
      scroller.current?.scrollTo({ y: Math.max(0, scrollY.current + shift), animated: true });
    });
  }, []);

  /** A field took focus: remember its row, and lift it if the keyboard is up. */
  const bringIntoView = useCallback(
    (node: View | null) => {
      focusedRow.current = node;
      if (keyboardHeight.current > 0) lift(keyboardHeight.current);
    },
    [lift],
  );

  /**
   * The keyboard's own events do the lifting.
   *
   * FOCUS FIRES BEFORE THE KEYBOARD IS THERE, and a measurement taken then is
   * measured against a screen that has not moved yet. `keyboardDidShow` carries
   * the height and arrives after the layout has settled, on both platforms.
   */
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = event.endCoordinates?.height ?? 0;
      keyboardHeight.current = height;
      setKeyboardSpace(height);
      lift(height);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeight.current = 0;
      setKeyboardSpace(0);
      focusedRow.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [lift]);

  /** Open a file the SERVER holds — a request attachment or a payment proof. */
  const openRequestFile = (name: string, serverId: number | undefined) => {
    if (serverId === undefined) return;
    setViewing({
      name,
      load: () => advancePaymentService.requestFileImage(requestId, serverId),
      save: () => advancePaymentService.saveRequestFile(requestId, serverId, name),
    });
  };

  /** Save a file to the device and hand it to whatever opens that kind. */
  const downloadRequestFile = async (name: string, serverId: number | undefined) => {
    if (serverId === undefined) return;
    try {
      const uri = await advancePaymentService.saveRequestFile(requestId, serverId, name);
      const can = await Linking.canOpenURL(uri).catch(() => false);
      if (can) await Linking.openURL(uri);
      else appAlert("Saved to this device", `${name} was downloaded.`);
    } catch (err) {
      appAlert("Could not download", advancePaymentError(err));
    }
  };

  const toggleRow = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * @param quiet re-read without the full-page spinner. The data is already on
   *              screen when returning from an action, and blanking it makes
   *              going back feel broken.
   */
  const load = useCallback(
    async (quiet = false) => {
      if (!Number.isFinite(requestId)) {
        setError("Missing request reference.");
        setLoading(false);
        return;
      }
      if (!quiet) {
        // Clear as well as spin: this screen is reached from a card and stays
        // mounted, so opening a second request would otherwise show the first
        // one's figures under the new one's number until the fetch returned.
        setRequest(null);
        setLoading(true);
      }
      setError("");
      try {
        setRequest(await advancePaymentService.request(requestId));
      } catch (err) {
        setError(advancePaymentError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [requestId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // An edit happens on its own screen, so returning here must re-read — else a
  // corrected request still shows the figures it had before.
  useRefreshOnFocus(() => load(true));

  /**
   * EDIT LIVES IN THE HEADER, beside the title, as it does on every other
   * detail screen here.
   *
   * Published while this screen is focused and the SERVER says the request may
   * be edited, and cleared on blur — the edit form is pushed on top of this
   * screen, and a pencil lingering there would edit the thing being edited.
   */
  const canEdit = request?.can.edit ?? false;
  const openEdit = useCallback(() => {
    if (!request) return;
    router.push({
      pathname: "/(main)/advance-payments/edit-request",
      params: { id: String(request.id) },
    } as never);
  }, [request]);

  const isFocused = useIsFocused();
  const canEditRef = useRef(false);
  const openEditRef = useRef(openEdit);
  useFocusEffect(
    useCallback(() => {
      setHeaderEditHandler(canEditRef.current ? openEditRef.current : null);
      return () => setHeaderEditHandler(null);
    }, []),
  );
  useEffect(() => {
    canEditRef.current = canEdit;
    openEditRef.current = openEdit;
    if (isFocused) setHeaderEditHandler(canEdit ? openEdit : null);
  }, [canEdit, openEdit, isFocused]);

  /**
   * One decision, in three steps: confirm it (with its remarks), watch it go,
   * read what happened.
   *
   * The same three dialogs a receipt's approval uses — they are built from the
   * same pieces — so an approver meets one flow whatever they are deciding.
   */
  const act = async (action: StageAction, remarks: string) => {
    if (!request) return;
    setAsking(null);
    setActing(action);
    try {
      const next = await advancePaymentService.act(
        request.id,
        action,
        remarks,
        request.flow?.version,
      );
      setRequest(next);
      const now = fromApiRequest(next).status;
      setDone({
        action,
        requestNo: next.request_no,
        status: STATUS_LABEL[now],
        // The LAST approval completes the request and posts the payment to SAP.
        // Nothing is passed on, so there is no desk to go back to.
        final: action === "approve" && now === "APPROVED",
      });
    } catch (err) {
      // Every reason the server gave — `errors.problems` names the field or the
      // rule, and "The request could not be saved." alone names neither.
      appAlert(
        "Could not be done",
        [advancePaymentError(err), ...advancePaymentProblems(err)].join("\n"),
      );
      // A REFUSED POSTING IS STILL A FACT ON THE RECORD. SAP throwing out the
      // payment at Final answers 502 and leaves the request at Final, but the
      // server has written the failed voucher and the log — re-read so the SAP
      // card shows what SAP actually said rather than only a vanished alert.
      if (action === "approve") void load(true);
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={44} color={COLORS.error} />
        <Text style={styles.errorText}>{error || "This request could not be read."}</Text>
      </View>
    );
  }

  const entry = fromApiRequest(request);
  const { form } = entry;
  const c = resolveCase(form);
  const amount = requestAmount(form);
  const rows = c.reference ? allocationRows(form) : [];

/**
   * Where the money actually goes — for the stages that are asked about it.
   *
   * OUR G/L on the left, the payee's account on the right: the pair an approver
   * AFTER the Payment stage is being asked to sign off. Several lines can leave
   * from several accounts; two are named and more are counted, rather than
   * picking one and implying it is the only one.
   *
   * NOT BEFORE PAYMENT. An early approver, and the requester, are deciding on
   * the REQUEST — who is being paid and out of whose budget — and the bank
   * details are not theirs to check; the company and the payee stay in the
   * header for them. It appears once the details are filled AND the request has
   * moved past Payment, which is the moment they become the thing under review.
   */
  const route = (() => {
    const payout = entry.payout;
    if (!payout || payout.lines.length === 0) return null;
    const pastPayment =
      PAST_PAYMENT_ROLES.has(request.flow?.current_role ?? "") ||
      entry.status === "APPROVED";
    if (!pastPayment) return null;
    const from = Array.from(
      new Set(payout.lines.map((line) => line.fromAccount).filter(Boolean)),
    );
    if (from.length === 0 || !payout.toAccountNumber) return null;
    return {
      from: from.length <= 2 ? from.join(" + ") : `${from.length} accounts`,
      to: payout.toAccountNumber,
      note: [payout.beneficiaryName, payout.toIfsc].filter(Boolean).join(" · "),
    };
  })();
  const open = rows.length ? allocationTotals(rows).open : 0;
  const can = request.can;
  const updates = (request.logs ?? []).filter((log) => UPDATE_ACTIONS.has(log.action));

  /**
   * What this user may do, in the order the box lays them out.
   *
   * The SERVER decides which of these exist (`can`), so the box is whatever is
   * genuinely available: an approver sees a decision, a creator sees Cancel,
   * and somebody with nothing to do sees no box at all.
   */
  /** Why Approve cannot be pressed yet, if it cannot. */
  const payoutBlock = !can.edit_payout
    ? undefined
    : !payoutStatus?.saved && !payoutStatus?.dirty
      ? "Fill in the payment details and save them first."
      : payoutStatus?.dirty
        ? "Save the payment details first — the approval takes what is saved, not what is on screen."
        : undefined;

  const actions: ActionSpec[] = [
    can.reject && {
      key: "reject" as const,
      label: "Reject",
      icon: "close-circle-outline" as const,
      colour: COLORS.error,
      needsRemarks: true,
      run: () => setAsking("reject"),
    },
    can.approve && {
      key: "approve" as const,
      // FINAL IS WHERE APPROVING POSTS THE PAYMENT TO SAP, so the button says
      // what it does — the web's own wording. Before Final, approving only
      // moves the request on, and "Approve" is still the honest word.
      label: request.flow?.current_role === "FINAL" ? "Post to SAP" : "Approve",
      icon: "checkmark-circle-outline" as const,
      colour: COLORS.success,
      needsRemarks: false,
      // NOT UNTIL THE PAYMENT DETAILS ARE SAVED. Approving at the Payment stage
      // is approving what the SERVER holds; a draft still on screen would be
      // approved as whatever was there before it — or as nothing at all.
      blocked: payoutBlock,
      run: () => setAsking("approve"),
    },
    can.cancel && {
      key: "cancel" as const,
      label: "Cancel Request",
      icon: "ban-outline" as const,
      colour: COLORS.error,
      needsRemarks: false,
      run: () => setAsking("cancel"),
    },
    can.return_to_creator && {
      key: "return" as const,
      label: "Return to creator",
      icon: "arrow-undo-outline" as const,
      colour: COLORS.warning,
      needsRemarks: true,
      run: () => setAsking("return"),
    },
    can.send_back && {
      key: "send-back" as const,
      label: "Send back to Payment",
      icon: "arrow-back-circle-outline" as const,
      colour: COLORS.warning,
      needsRemarks: true,
      run: () => setAsking("send-back"),
    },
  ].filter(Boolean) as ActionSpec[];
  const turned =
    entry.decision &&
    (entry.decision.status === "REJECTED" || entry.decision.status === "RETURNED")
      ? entry.decision
      : undefined;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Android resizes the window itself; iOS does not, and without this the
      // scroll has nowhere to move the field to.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        ref={frame}
        style={styles.screen}
        // Where the page sits on the screen, so "covered by the keyboard" is
        // measured against the scroll itself and not against the whole window.
        onLayout={() =>
          frame.current?.measureInWindow?.((_x, y, _width, height) => {
            if (typeof y === "number" && !Number.isNaN(y)) {
              frameBox.current = { top: y, bottom: y + (height || 0) };
            }
          })
        }
      >
      <ScrollView
      ref={scroller}
      onScroll={(event) => {
        scrollY.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        // Clear of the action box, so the last card is never under it.
        actions.length > 0 && styles.contentWithActions,
        // And clear of the keyboard, which is what gives the lift its room.
        keyboardSpace > 0 && { paddingBottom: keyboardSpace + sp(24) },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* ── Header: flush under the navbar, 24pt bottom corners ────────── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text style={styles.requestNo} numberOfLines={1} adjustsFontSizeToFit>
            {request.request_no}
          </Text>
          <View style={styles.statusPill}>
            <Text
              style={[
                styles.statusText,
                { color: STATUS_COLOR[entry.status] ?? COLORS.warning },
              ]}
            >
              {STATUS_LABEL[entry.status]}
            </Text>
          </View>
        </View>

        {/* THE MOVEMENT, read left to right, as the deposit header reads.
            Once the paying desk has filled the details this is the one thing a
            later approver is signing off — the G/L the money leaves and the
            account it lands in — so it replaces the company and the payee's
            name, which are both in General Information below. Before that, the
            company and the payee are all there is to state. */}
        <View style={styles.partyRow}>
          <Ionicons
            name={route ? "card-outline" : "business-outline"}
            size={ms(14)}
            color="#BFDBFE"
          />
          <Text style={styles.partyGl} numberOfLines={1}>
            {route ? route.from : form.company}
          </Text>
          <Ionicons name="arrow-forward" size={ms(13)} color="#BFDBFE" />
          <Text style={styles.party} numberOfLines={1}>
            {route ? route.to : form.partnerName || form.partner || "—"}
          </Text>
        </View>
        {route ? (
          <Text style={styles.routeNote} numberOfLines={1}>
            {route.note}
          </Text>
        ) : null}
      </LinearGradient>

      {/* Why it came back. Above everything else, because the fix depends
            on it. */}
        {turned ? (
          <View style={styles.rejectBanner}>
            <Ionicons name="alert-circle" size={ms(20)} color={COLORS.error} />
            <View style={styles.rejectText}>
              <Text style={styles.rejectTitle}>
                {STATUS_LABEL[turned.status]} by {turned.by}
              </Text>
              <Text style={styles.rejectReason}>
                {turned.remarks || "No reason was given."}
              </Text>
              {can.edit ? (
                <Text style={styles.rejectHint}>
                  Tap the pencil at the top to correct it and send it on again.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── General Information ──────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <Ionicons name="information-circle" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>General Information</Text>
            {/* The priority, on the card's own line — the same badge the
                deposit page gives the banking delay, and red for High for the
                same reason: past that point it is the point, not a footnote. */}
            <View style={[styles.gapPill, form.priority === "HIGH" && styles.gapPillLate]}>
              <Ionicons
                name="flag-outline"
                size={ms(12)}
                color={form.priority === "HIGH" ? COLORS.error : COLORS.textSecondary}
              />
              <Text
                style={[styles.gapText, form.priority === "HIGH" && styles.gapTextLate]}
              >
                {priorityLabel(entry)}
              </Text>
            </View>
          </View>

          {/* WHO and WHOSE BOOKS. Where the request has got to is not here:
              the list card states it and the Progress page is the whole
              answer, so a third copy only made this card taller. */}
          <View style={styles.grid}>
            <Field
              icon="person-outline"
              label="Raised By"
              value={entry.requestedBy}
              sub={formatDateTime(entry.requestedOn)}
            />
            <Field icon="business-outline" label="Company" value={form.company} />
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            <Field icon="albums-outline" label="Type" value={typeLabel(form)} />
            <Field
              icon="pricetag-outline"
              label="Payment Against"
              value={paymentAgainstLabel(form)}
              tone="badge"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            <Field
              icon="git-branch-outline"
              label="Department"
              value={
                form.subDepartmentName
                  ? `${form.departmentName} · ${form.subDepartmentName}`
                  : form.departmentName
              }
            />
            <Field
              icon="calendar-outline"
              label="Payment Date"
              value={form.paymentDate ? formatDate(form.paymentDate) : "—"}
            />
          </View>

          <View style={styles.divider} />

          {/* FULL WIDTH, both of them: a vendor's name and an owner's
              "Name (CODE)" are long enough to be cut in half a row, and a
              truncated payee is the one field nobody may guess at. */}
          <Field
            icon="person-circle-outline"
            label={c.partnerLabel}
            value={form.partnerName || form.partner}
            sub={form.partner}
            full
          />

          <View style={styles.divider} />

          <Field icon="ribbon-outline" label="Ownership" value={form.ownership} full />

          {c.expectedDate || c.expectedBillDate ? (
            <>
              <View style={styles.divider} />
              <View style={styles.grid}>
                <Field
                  icon="document-outline"
                  label="Expected Bill Date"
                  value={formatDate(form.expectedDate || form.expectedBillDate)}
                />
              </View>
            </>
          ) : null}

          {c.repayment ? (
            <>
              <View style={styles.divider} />
              <View style={styles.grid}>
                <Field
                  icon="repeat-outline"
                  label="Return Method"
                  value={returnMethodLabel(form)}
                />
                {form.installments ? (
                  <Field
                    icon="layers-outline"
                    label="Installments"
                    value={`${form.installments} × ${money(Number(form.emiAmount) || 0)}`}
                  />
                ) : (
                  <Field
                    icon="calendar-outline"
                    label="Returned By"
                    value={form.expectedToDate ? formatDate(form.expectedToDate) : "—"}
                  />
                )}
              </View>
            </>
          ) : null}

        </View>

        {/* ── What it comes to ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <Ionicons name="cash" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>Payment Summary</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>
                {rows.length ? "Open Amount" : "Requested"}
              </Text>
              <Text style={styles.summaryOpen}>{money(rows.length ? open : amount)}</Text>
              {rows.length ? (
                <Text style={styles.summaryNote}>
                  {rows.length} document{rows.length === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
            {rows.length ? (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>To Pay</Text>
                  <Text style={styles.summaryPay}>{money(amount)}</Text>
                  <View
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          amount >= open - 0.005 ? COLORS.successLight : COLORS.warningLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: amount >= open - 0.005 ? COLORS.success : COLORS.warning },
                      ]}
                    >
                      {amount >= open - 0.005 ? "Full amount" : "Part payment"}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* ── SAP Information ──────────────────────────────────────────── */}
        <SapCard request={request} />

        {/* ── The documents it is paid against ─────────────────────────── */}
        {rows.length ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name="documents" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>
                {REFERENCE_KINDS[c.reference!].pluralLabel} ({rows.length})
              </Text>
            </View>
            {rows.map((row, index) => {
              const def = REFERENCE_KINDS[c.reference!];
              const openRow = expanded.has(row.document.id);
              return (
                <View key={row.document.id}>
                  <TouchableOpacity
                    style={[styles.lineRow, index > 0 && styles.lineRowBordered]}
                    activeOpacity={0.7}
                    onPress={() => toggleRow(row.document.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: openRow }}
                    accessibilityLabel={`${def.label} ${row.document.number}. ${
                      openRow ? "Collapse" : "Expand"
                    } details.`}
                  >
                    <View style={styles.lineIcon}>
                      <Ionicons
                        name="document-text-outline"
                        size={ms(16)}
                        color={COLORS.primary}
                      />
                    </View>
                    <View style={styles.lineText}>
                      <Text style={styles.lineNo} numberOfLines={1}>
                        {def.label} {row.document.number}
                      </Text>
                      <Text style={styles.lineParty} numberOfLines={1}>
                        {formatDate(row.document.date)} · open {money(row.document.open)}
                        {row.allocation.mode === "PERCENT"
                          ? ` · ${row.allocation.percentage}%`
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.lineRight}>
                      <Text style={styles.lineAmount}>{money(row.calc.payment ?? 0)}</Text>
                      <Ionicons
                        name={openRow ? "chevron-up" : "chevron-down"}
                        size={ms(16)}
                        color={COLORS.textMuted}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* The document as SAP had it when the request was raised —
                      the snapshot the approvers are deciding on, not a fresh
                      read, so what is shown is what was agreed to. */}
                  {openRow ? (
                    <View style={styles.lineDetail}>
                      <DetailLine label={def.originalLabel} value={money(row.document.original)} />
                      <DetailLine label={def.paidLabel} value={money(row.document.paid)} />
                      <DetailLine label="Open Amount" value={money(row.document.open)} />
                      <DetailLine label={def.dateLabel} value={formatDate(row.document.date)} />
                      {row.document.dueDate ? (
                        <DetailLine label="Due" value={formatDate(row.document.dueDate)} />
                      ) : null}
                      {row.document.reference ? (
                        <DetailLine label="Their Reference" value={row.document.reference} />
                      ) : null}
                      {row.document.docType ? (
                        <DetailLine label="Document Type" value={row.document.docType} />
                      ) : null}
                      <DetailLine
                        label="Paying"
                        value={
                          row.allocation.mode === "PERCENT"
                            ? `${row.allocation.percentage}% of the open amount`
                            : "A fixed amount"
                        }
                      />
                      <DetailLine label="This Payment" value={money(row.calc.payment ?? 0)} />
                      {row.document.attachment ? (
                        <TouchableOpacity
                          style={styles.detailLine}
                          activeOpacity={0.7}
                          onPress={() => {
                            const found = row.document.attachment!;
                            setViewing({
                              name: found.fileName,
                              load: () =>
                                advancePaymentService.documentAttachmentImage(
                                  found.company,
                                  found.kind,
                                  found.docEntry,
                                ),
                              save: () =>
                                advancePaymentService.saveDocumentAttachment(
                                  found.company,
                                  found.kind,
                                  found.docEntry,
                                  found.fileName,
                                ),
                            });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${row.document.attachment.fileName}`}
                        >
                          <Text style={styles.detailLineLabel}>SAP Attachment</Text>
                          <Text style={styles.detailLineLink} numberOfLines={2}>
                            {row.document.attachment.fileName}
                            {row.document.attachment.count > 1
                              ? ` (${row.document.attachment.count})`
                              : ""}
                          </Text>
                          <Ionicons name="open-outline" size={ms(13)} color={COLORS.primary} />
                        </TouchableOpacity>
                      ) : null}
                      {row.document.note ? (
                        <DetailLine label="Note" value={row.document.note} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── Remarks & Updates ───────────────────────────────────────
            WHAT WAS SAID, and what has been CHANGED, in one box: both answer
            "why does this request read the way it does?", and splitting them
            made the reader check two places for one answer.

            UPDATES, NEVER THE HISTORY. Approvals, returns, rejections and the
            SAP posting are the request's history and live on the Progress
            page, in one place, so the two pages cannot tell two stories. */}
        {form.remarks || updates.length ? (
          <View style={styles.card}>
            {/* Closed to start, like the other boxes: on a request that has
                been round the loop a few times this is the longest thing on the
                page, and the request itself is what an approver came to read. */}
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => setNotesOpen((current) => !current)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: notesOpen }}
            >
              <View style={styles.headerIcon}>
                <Ionicons name="chatbox-ellipses" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.cardTitle}>
                Remarks &amp; Updates{updates.length ? ` (${updates.length})` : ""}
              </Text>
              <Ionicons
                name={notesOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>

            {notesOpen && form.remarks ? (
              <Field
                icon="chatbox-ellipses-outline"
                label={`Remarks by ${entry.requestedBy}`}
                value={form.remarks}
                full
              />
            ) : null}

            {(notesOpen ? updates : []).map((log, index) => (
              <View
                key={log.id}
                style={[
                  styles.lineRow,
                  (index > 0 || !!form.remarks) && styles.lineRowBordered,
                ]}
              >
                <View style={styles.lineIcon}>
                  <Ionicons name="create-outline" size={ms(16)} color={COLORS.primary} />
                </View>
                <View style={styles.lineText}>
                  <Text style={styles.lineNo} numberOfLines={1}>
                    {log.label || log.action}
                  </Text>
                  <Text style={styles.lineParty} numberOfLines={1}>
                    {log.actor?.name ?? "System"} · {formatDateTime(log.created_on)}
                  </Text>
                  {log.remarks ? (
                    <Text style={styles.lineParty}>{log.remarks}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Payment Information ──────────────────────────────────────── */}
        {!can.edit_payout && entry.payout ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name="wallet" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>
                Payment Information ({entry.payout.lines.length})
              </Text>
            </View>

            <View style={styles.grid}>
              <Field
                icon="person-outline"
                label="Beneficiary"
                value={entry.payout.beneficiaryName}
              />
              <Field
                icon="card-outline"
                label="To Account"
                value={entry.payout.toAccountNumber}
                sub={entry.payout.toIfsc}
              />
            </View>

            {/* The bank proof the paying desk attached — a cancelled cheque,
                a bank letter. Tappable, because an approver checking the payee's
                account has to SEE it. */}
            {entry.payout.bankAttachments.length ? (
              <View style={styles.proofRow}>
                {entry.payout.bankAttachments.map((file) => (
                  <AttachmentRow
                    key={file.id}
                    file={file}
                    onView={() => openRequestFile(file.name, file.serverId)}
                    onDownload={() => downloadRequestFile(file.name, file.serverId)}
                  />
                ))}
              </View>
            ) : null}

            {/* THE METHOD ON ONE ROW, ITS PROOF ON THE NEXT. An attachment card
                inside the middle column was squeezed between the icon and the
                amount, half the width of the identical card above it; the proof
                belongs across the row, as the bank's does. */}
            {entry.payout.lines.map((line, index) => (
              <View key={line.id} style={index > 0 ? styles.lineRowBordered : undefined}>
                <View style={styles.lineRow}>
                  <View style={styles.lineIcon}>
                    <Ionicons name="wallet-outline" size={ms(16)} color={COLORS.primary} />
                  </View>
                  <View style={styles.lineText}>
                    <Text style={styles.lineNo} numberOfLines={1}>
                      {PAYOUT_METHODS.find((method) => method.value === line.method)?.label ??
                        line.method}
                    </Text>
                    <Text style={styles.lineParty} numberOfLines={1}>
                      From {line.fromAccount || "—"}
                    </Text>
                    {line.method === "CHEQUE" ? (
                      <Text style={styles.lineParty} numberOfLines={1}>
                        Cheque {line.chequeNumber || "—"}
                        {line.chequeBank ? ` · ${line.chequeBank}` : ""}
                        {line.chequeDate ? ` · ${formatDate(line.chequeDate)}` : ""}
                      </Text>
                    ) : null}
                    {line.method === "CASH" && line.noteRows.length ? (
                      <Text style={styles.lineParty} numberOfLines={2}>
                        {line.noteRows
                          .filter((row) => row.denomination && Number(row.quantity) > 0)
                          .map((row) => `${row.quantity} × ₹${row.denomination}`)
                          .join(", ")}
                      </Text>
                    ) : null}
                    {line.utr ? (
                      <Text style={styles.lineUtr} numberOfLines={1}>
                        UTR {line.utr}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineAmount}>{money(Number(line.amount) || 0)}</Text>
                </View>

                {/* What the payer attached against THIS method — full width. */}
                {line.attachments.length ? (
                  <View style={styles.proofRow}>
                    {line.attachments.map((file) => (
                      <AttachmentRow
                        key={file.id}
                        file={file}
                        onView={() => openRequestFile(file.name, file.serverId)}
                        onDownload={() => downloadRequestFile(file.name, file.serverId)}
                      />
                    ))}
                  </View>
                ) : null}

              </View>
            ))}
          </View>
        ) : null}

        {/* ── Record Payment ───────────────────────────
            AFTER SAP, AND ONLY FOR WHOEVER PAYS. Its own card, gated exactly as
            the web's is (`entry.payout && status APPROVED && can.record_utr`):
            the server takes a UTR once the flow is COMPLETED — the outgoing
            payment is in SAP — and only from the Payment or Final stage's
            user. Everyone else, at every earlier stage, sees no such box. */}
        {entry.payout && entry.status === "APPROVED" && can.record_utr ? (
          <RecordPaymentCard
            request={request}
            entry={entry}
            recordedBy={user?.name || user?.username || "Approver"}
            onRecorded={setRequest}
            onFocusRow={bringIntoView}
          />
        ) : null}

        {/* ── Attachments ──────────────────────────────────────────────── */}
        {entry.files.length ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name="attach" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.sectionTitle}>Attachments ({entry.files.length})</Text>
            </View>
            {entry.files.map((file) => (
              <AttachmentRow
                key={file.id}
                file={file}
                onView={() => openRequestFile(file.name, file.serverId)}
                onDownload={() => downloadRequestFile(file.name, file.serverId)}
              />
            ))}
          </View>
        ) : null}

        {/* ── Your remarks, for the decision ──────────────────────────
            OPTIONAL and OPEN: it is one field, and a box that has to be opened
            to be found is a box people do not write in. Whatever is here is
            carried into the confirmation dialog, where a rejection insists on
            it. Same field as the receipt's approval remarks. */}
        {can.approve || can.reject || can.return_to_creator || can.send_back ? (
          <View ref={remarksCard} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerIcon}>
                <Ionicons name="chatbox-ellipses" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.cardTitle}>Remarks (optional)</Text>
              {remarks.trim() ? (
                <Ionicons name="checkmark-circle" size={ms(16)} color={COLORS.success} />
              ) : null}
            </View>
            <TextInput
              style={styles.remarksInput}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Anything the next person should know"
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={500}
              onFocus={() => bringIntoView(remarksCard.current)}
            />
            <Text style={styles.remarksCount}>{remarks.length}/500</Text>
          </View>
        ) : null}

        {/* The Payment stage's own editor — outgoing bank and payment details. */}
        {can.edit_payout ? (
          <PayoutEditor
            request={request}
            amount={amount}
            initial={entry.payout}
            onStatus={setPayoutStatus}
            onSaved={(saved) => {
              setRequest(saved);
              appAlert("Saved", "The payment details are on the request.");
            }}
          />
        ) : null}

      </ScrollView>
      </View>

      {/* ── What this user may do ──────────────────────────────────────
          ONE BOX AT THE FOOT, two buttons to a row, and only the first row
          showing. The rest are one tap away behind the arrow rather than a
          column of five buttons that pushes the request itself off screen —
          and the decision stays reachable without scrolling back down to it.
          EDIT is not here at all: it is the pencil in the header. */}
      {actions.length || (can.edit_payout && payoutStatus) ? (
        <ActionBox
          actions={actions}
          acting={acting}
          save={
            can.edit_payout && payoutStatus
              ? {
                  run: payoutStatus.save,
                  busy: payoutStatus.saving,
                  ready: payoutStatus.ready,
                  dirty: payoutStatus.dirty || !payoutStatus.saved,
                }
              : undefined
          }
          onBlocked={(why) => appAlert("Not yet", why)}
        />
      ) : null}

      <AttachmentViewerModal source={viewing} onClose={() => setViewing(null)} />

      {/* Confirm -> working -> done. The prompt carries the remarks, because a
          decision and its reason are one act. */}
      <DecisionPrompt
        action={asking}
        initialRemarks={remarks}
        onClose={() => setAsking(null)}
        onConfirm={(said) => asking && act(asking, said)}
      />
      <ApprovalLoadingDialog
        visible={acting !== null}
        decision={acting === "approve" ? "approve" : "reject"}
      />
      <DecisionDone
        action={done?.action ?? null}
        requestNo={done?.requestNo ?? ""}
        status={done?.status ?? ""}
        isFinal={done?.final}
        onDone={() => {
          const action = done?.action;
          const final = done?.final;
          setDone(null);

          // THE LAST APPROVAL STAYS HERE. What the approver wants next is what
          // SAP said — the document number, or the refusal — and that is on
          // this page. A quiet re-read brings the posted voucher in without
          // blanking the page they are reading.
          if (final) {
            void load(true);
            return;
          }
          // THE LIST THEY ACTED FROM. A page of buttons they can no longer
          // press invites a second tap on a decision already taken, so the
          // dialog ends on a list — and on the RIGHT one: an approver who has
          // just decided is working through their desk, not reading the
          // requests they raised themselves. Only a creator's own action
          // (cancel, resubmit) belongs on My Requests.
          //
          // Whoever could take a desk action holds the approval key by
          // definition — the server only offers those to the stage's user — so
          // the desk page is always open to them.
          const desk =
            action === "approve" ||
            action === "reject" ||
            action === "return" ||
            action === "send-back";
          router.replace(
            (desk
              ? "/(main)/advance-payments/approval"
              : "/(main)/advance-payments/tracking") as never,
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

/* ── The pieces ──────────────────────────────────────────────────────── */

/**
 * One icon + label + value cell of the information grid.
 *
 * `full` spans both columns; `sub` stacks a second line beneath the value,
 * which is what makes a "who, and when" pair readable as one fact.
 */
function Field({
  icon,
  label,
  value,
  tone = "plain",
  full = false,
  sub,
  muted = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "plain" | "link" | "badge";
  full?: boolean;
  /** Second line — a timestamp, a code, whatever qualifies the value. */
  sub?: string;
  /** Greys the value for a step that has not happened yet. */
  muted?: boolean;
}) {
  return (
    <View style={[styles.field, full ? styles.fieldFull : styles.fieldHalf]}>
      <Ionicons name={icon} size={ms(17)} color={COLORS.textMuted} style={styles.fieldIcon} />
      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        {tone === "badge" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {value || "—"}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.value,
              tone === "link" && styles.valueLink,
              muted && styles.valueMuted,
            ]}
            numberOfLines={full ? 6 : 2}
          >
            {value || "—"}
          </Text>
        )}
        {sub ? (
          <Text style={styles.subValue} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * What SAP did with this request — the outgoing payment's identifiers and SAP's
 * own words.
 *
 * Renders NOTHING before a posting has been attempted: a "Pending" SAP box on a
 * request still in approval would imply something is in flight when nothing has
 * been sent.
 */
function SapCard({ request }: { request: ApiRequest }) {
  /**
   * The POSTED payment if SAP took one; otherwise the LAST ATTEMPT.
   *
   * `voucher` on the API is POSTED-only, so a refusal lives in `vouchers`
   * alone — without this, a Final approver whose posting SAP threw out saw
   * nothing at all and no reason why. The web's SAP Payment card is guarded the
   * same way, and shows a failure that came AFTER a posting as its own line.
   */
  const live = request.voucher;
  const attempts = request.vouchers ?? [];
  const failed = [...attempts]
    .reverse()
    .find((row) => row.status === "FAILED" || row.status === "CANCELLED");
  const voucher = live ?? failed ?? null;
  if (!voucher) return null;
  /** A refused RETRY of an already-posted payment: both facts are true. */
  const laterFailure = live && failed && failed.version > live.version ? failed : null;

  const posted = voucher.status === "POSTED";
  const cancelled = voucher.status === "CANCELLED";
  const palette = posted
    ? { bg: "#ECFDF5", fg: "#047857", icon: "checkmark-circle" as const }
    : cancelled
      ? { bg: "#FFFBEB", fg: "#B45309", icon: "warning" as const }
      : { bg: "#FEF2F2", fg: "#B91C1C", icon: "alert-circle" as const };
  const badge = posted ? "Posted" : cancelled ? "Cancelled in SAP" : "Failed";
  const headline = posted
    ? "Payment created in SAP"
    : cancelled
      ? "Cancelled in SAP"
      : "SAP rejected the payment";

  const rows: { label: string; value: string }[] = [];
  if (voucher.sap_doc_entry != null) {
    rows.push({ label: "SAP DocEntry", value: String(voucher.sap_doc_entry) });
    rows.push({ label: "SAP DocNum", value: String(voucher.sap_doc_num ?? "—") });
  }
  if (voucher.posted_on) {
    rows.push({ label: "Posted At", value: formatDateTime(voucher.posted_on) });
  }
  if (voucher.posted_by?.name) {
    rows.push({ label: "Posted By", value: voucher.posted_by.name });
  }
  if (cancelled && voucher.cancelled_on) {
    rows.push({ label: "Cancelled At", value: formatDateTime(voucher.cancelled_on) });
  }

  return (
    <View style={styles.sapCard}>
      <View style={styles.sapHeader}>
        <View style={[styles.sapIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={palette.icon} size={ms(16)} color={palette.fg} />
        </View>
        <Text style={styles.sapTitle}>SAP Information</Text>
        <View style={[styles.sapBadge, { backgroundColor: palette.bg }]}>
          <Text style={[styles.sapBadgeText, { color: palette.fg }]}>{badge}</Text>
        </View>
      </View>

      <Text style={[styles.sapHeadline, { color: palette.fg }]}>{headline}</Text>

      {rows.map((row) => (
        <View key={row.label} style={styles.sapRow}>
          <Text style={styles.sapLabel}>{row.label}</Text>
          <Text style={styles.sapValue} numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}

      {/* SAP's exact words. On a failure this is the only thing that says WHY,
          so it is shown in full rather than truncated to a tidy line. */}
      {voucher.error ? (
        <View style={[styles.sapResponse, { backgroundColor: palette.bg }]}>
          <Text style={styles.sapResponseLabel}>SAP Response</Text>
          <Text style={styles.sapResponseText}>{voucher.error}</Text>
        </View>
      ) : null}

      {laterFailure?.error ? (
        <View style={[styles.sapResponse, { backgroundColor: "#FEF2F2" }]}>
          <Text style={styles.sapResponseLabel}>Last posting attempt failed</Text>
          <Text style={styles.sapResponseText}>{laterFailure.error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One thing this user may do to the request. */
interface ActionSpec {
  key: StageAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colour: string;
  /** Rejecting, returning and sending back all need a reason. */
  needsRemarks: boolean;
  /** Why it cannot be pressed yet, if it cannot. */
  blocked?: string;
  run: () => void;
}

/**
 * The actions, boxed at the foot of the page.
 *
 * TWO TO A ROW, FIRST ROW ONLY. A decision is the one thing that must always be
 * in reach, but five stacked buttons take half the screen — so the box shows one
 * row and keeps the rest behind an arrow, which opens DOWNWARDS from it so the
 * visible buttons stay where they were.
 *
 * AN ODD COUNT PUTS THE FIRST BUTTON ALONE, FULL WIDTH. With three actions the
 * top row would otherwise be a pair and the leftover one would sit by itself
 * underneath, which reads as an afterthought; full width at the top reads as
 * the main action, which is what it is.
 *
 * The remarks are NOT in here. Each button opens its own confirmation dialog,
 * which is where the reason is asked for — the same dialog a receipt's approval
 * uses, so a decision and its reason are taken in one place.
 */
function ActionBox({
  actions,
  acting,
  save,
  onBlocked,
}: {
  actions: ActionSpec[];
  acting: StageAction | null;
  /** The Payment stage's Save, on its own row above the decision. */
  save?: { run: () => void; busy: boolean; ready: boolean; dirty: boolean };
  onBlocked: (why: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // THE DECISION LEADS, both halves of it on the first row: approve and reject
  // are the pair an approver comes here for, and burying either behind the
  // arrow would make the commonest action the hidden one. Whatever else the
  // server allows pairs up below, and an odd one out takes a row of its own.
  const decision = actions.filter(
    (action) => action.key === "reject" || action.key === "approve",
  );
  const others = actions.filter((action) => !decision.includes(action));
  const rows: ActionSpec[][] = decision.length ? [decision] : [];
  for (let index = 0; index < others.length; index += 2) {
    rows.push(others.slice(index, index + 2));
  }

  const [first, ...hidden] = rows;

  // Every button opens its confirmation, which is where the remarks are asked
  // for; nothing here acts on its own. A blocked one says why instead — a dead
  // button that simply does nothing is the worst of both.
  const press = (action: ActionSpec) =>
    action.blocked ? onBlocked(action.blocked) : action.run();

  const renderRow = (row: ActionSpec[], index: number) => (
    <View key={`row-${index}`} style={styles.actionRow}>
      {row.map((action) => (
        <TouchableOpacity
          key={action.key}
          style={[
            styles.actionBtn,
            { backgroundColor: action.colour },
            action.blocked && styles.actionBtnBlocked,
          ]}
          onPress={() => press(action)}
          disabled={acting !== null}
          activeOpacity={0.85}
        >
          {acting === action.key ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={action.icon} size={ms(16)} color="#fff" />
          )}
          <Text style={styles.actionBtnText} numberOfLines={1}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.actionBox}>
      {hidden.length ? (
        <TouchableOpacity
          style={styles.actionToggle}
          onPress={() => setOpen((current) => !current)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? "Hide the other actions" : "Show the other actions"}
        >
          <View style={styles.actionGrabber} />
          <Ionicons
            name={open ? "chevron-down" : "chevron-up"}
            size={18}
            color={COLORS.textSecondary}
          />
        </TouchableOpacity>
      ) : null}

      {/* SAVE FIRST, above the decision: at the Payment stage the details are
          what is being approved, and the order of the buttons is the order of
          the work. */}
      {save ? (
        <TouchableOpacity
          style={[
            styles.saveBtn,
            (!save.ready || save.busy) && styles.saveBtnOff,
            !save.dirty && styles.saveBtnDone,
          ]}
          onPress={save.run}
          disabled={!save.ready || save.busy}
          activeOpacity={0.85}
        >
          {save.busy ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons
              name={save.dirty ? "save-outline" : "checkmark-done-outline"}
              size={ms(16)}
              color={save.dirty ? COLORS.primary : COLORS.success}
            />
          )}
          <Text
            style={[styles.saveBtnText, !save.dirty && styles.saveBtnTextDone]}
            numberOfLines={1}
          >
            {save.busy
              ? "Saving…"
              : save.dirty
                ? "Save Payment Details"
                : "Payment details saved"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {renderRow(first, 0)}

      {/* UNDER the row above, not over it: the buttons that were already on
          screen must not move when the rest appear, or the tap a thumb was
          lining up lands on something else. */}
      {open ? hidden.map((row, index) => renderRow(row, index + 1)) : null}
    </View>
  );
}

/**
 * One attached file, as the receipt's approval page shows one: the kind's icon
 * on a tinted square, the name and size, then View and Download.
 *
 * THE EYE OPENS IT IN THE APP (an image, zoomable); the arrow hands the file to
 * the device. Both fetch with the bearer token — these endpoints are
 * permission-checked, so a plain URL would come back 401.
 */
function AttachmentRow({
  file,
  onView,
  onDownload,
}: {
  file: FileAttachment;
  onView: () => void;
  onDownload: () => void;
}) {
  const pdf = /\.pdf$/i.test(file.name);
  const meta = pdf
    ? { icon: "document-text-outline" as const, tint: COLORS.error, bg: COLORS.errorLight }
    : { icon: "image-outline" as const, tint: COLORS.primary, bg: COLORS.primaryLight };
  const usable = file.serverId !== undefined;

  return (
    <View style={styles.attachCard}>
      <View style={[styles.attachThumb, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.tint} />
      </View>

      <View style={styles.attachText}>
        <Text style={styles.attachName} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.attachMeta}>
          {pdf ? "PDF" : "IMAGE"} · {formatSize(file.size)}
        </Text>
      </View>

      <View style={styles.attachActions}>
        <TouchableOpacity
          style={styles.attachBtn}
          activeOpacity={0.8}
          onPress={onView}
          disabled={!usable}
          accessibilityLabel={`View ${file.name}`}
        >
          <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.attachBtn}
          activeOpacity={0.8}
          onPress={onDownload}
          disabled={!usable}
          accessibilityLabel={`Download ${file.name}`}
        >
          <Ionicons name="download-outline" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** One line of an opened document: its label, and the figure beside it. */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={styles.detailLineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * WHAT THE SERVER ACCEPTS AS A UTR — the three rules the web's
 * `PaymentProofPanel` works to, and `payout.record_utr` enforces:
 *
 *   * the line must be a TRANSFER (UPI / NEFT / RTGS / IMPS); cash and cheque
 *     have no bank reference to record;
 *   * 8 to 30 letters and digits, uppercase, no spaces — anything else comes
 *     back refused with "A UTR is 8 to 30 letters and digits";
 *   * and only once the request is COMPLETED, from the Payment or Final user
 *     (`can.record_utr`).
 *
 * A UTR already recorded may be CHANGED, and the server logs it against the old
 * value — so a recorded line offers "Change" rather than going read-only.
 */
const UTR_PATTERN = /^[A-Z0-9]{8,30}$/;

/** As the web types it: uppercase, and nothing that is not a letter or digit. */
const cleanUtr = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);

/** How the proof was read, in the server's own words. */
const PROOF_SOURCE: Record<string, string> = {
  "pdf-text": "read from the PDF's text",
  ocr: "read by OCR",
  "pdf-text+ocr": "read from the PDF, part by OCR",
  excel: "read from the Excel file",
  csv: "read from the CSV file",
};

/** One of the proof's three checks, with its own verdict. */
function CheckLine({
  label,
  value,
  pass,
  fail,
  unknown,
}: {
  label: string;
  value: ProofCheck;
  pass: string;
  fail: string;
  unknown: string;
}) {
  const palette =
    value === true
      ? { icon: "checkmark-circle" as const, colour: COLORS.success }
      : value === false
        ? { icon: "close-circle" as const, colour: COLORS.error }
        : { icon: "remove-circle-outline" as const, colour: COLORS.textMuted };
  return (
    <View style={styles.checkLine}>
      <Ionicons name={palette.icon} size={ms(14)} color={palette.colour} />
      <Text style={styles.checkText}>
        <Text style={styles.checkLabel}>{label}: </Text>
        {value === true ? pass : value === false ? fail : unknown}
      </Text>
    </View>
  );
}

/** One transfer line: its proof, the checks, and the UTR that is recorded. */
function UtrLine({
  line,
  index,
  request,
  proofQuery,
  recordedBy,
  onRecorded,
  onFocusRow,
}: {
  line: PayoutLine;
  index: number;
  request: ApiRequest;
  proofQuery: Omit<PaymentProofQuery, "amount">;
  recordedBy: string;
  onRecorded: (request: ApiRequest) => void;
  /** Bring this row clear of the keyboard — it sits at the foot of the page. */
  onFocusRow: (node: View | null) => void;
}) {
  const [utr, setUtr] = useState("");
  const [proof, setProof] = useState<AttachmentStub[]>([]);
  const [result, setResult] = useState<PaymentProofResult | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!line.utr);
  const row = useRef<View>(null);

  const label =
    PAYOUT_METHODS.find((method) => method.value === line.method)?.label ?? line.method;
  const amount = Number(line.amount) || 0;
  const valid = UTR_PATTERN.test(utr);

  /** Send the file and take what the server found — nothing is stored there. */
  const read = async () => {
    const file = proof[0];
    if (!file) return;
    setReading(true);
    try {
      const found = await advancePaymentService.readPaymentProof(
        { uri: file.uri, name: file.name, size: file.size, mimeType: file.mimeType },
        { ...proofQuery, amount: String(line.amount) },
      );
      setResult(found);
      if (found.utr) setUtr(cleanUtr(found.utr));
    } catch (err) {
      appAlert("The proof could not be read", advancePaymentError(err));
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!line.serverId || !valid) return;
    setSaving(true);
    try {
      onRecorded(
        await advancePaymentService.recordUtr(
          request.id,
          line.serverId,
          utr,
          // The proof travels WITH the UTR, so the record says where the number
          // came from and what was checked, exactly as the web sends it.
          result
            ? {
                fileName: result.file_name,
                source: result.source,
                readUtr: result.utr,
                checks: {
                  amount: result.checks.amount,
                  account: result.checks.account,
                  invoice: result.checks.invoice,
                },
                recordedBy,
                recordedOn: new Date().toISOString(),
              }
            : (line.utrProof ?? null),
        ),
      );
      setEditing(false);
      setResult(null);
      setProof([]);
      setUtr("");
    } catch (err) {
      appAlert("Could not record the UTR", advancePaymentError(err));
    } finally {
      setSaving(false);
    }
  };

  const heading = `Method ${index + 1} · ${label} · ${money(amount)}`;

  if (line.utr && !editing) {
    return (
      <View style={styles.utrLine}>
        <Text style={styles.utrHeading} numberOfLines={2}>
          {heading}
        </Text>
        <View style={styles.utrRecorded}>
          <Ionicons name="checkmark-circle" size={ms(14)} color={COLORS.success} />
          <Text style={styles.utrRecordedText} numberOfLines={2}>
            UTR {line.utr}
          </Text>
        </View>
        {line.utrProof ? (
          <Text style={styles.utrProofNote} numberOfLines={2}>
            from {line.utrProof.fileName} · recorded by {line.utrProof.recordedBy}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.utrChange}
          activeOpacity={0.8}
          onPress={() => {
            setUtr(cleanUtr(line.utr ?? ""));
            setEditing(true);
          }}
        >
          <Ionicons name="create-outline" size={ms(13)} color={COLORS.primary} />
          <Text style={styles.utrChangeText}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.utrLine}>
      <Text style={styles.utrHeading} numberOfLines={2}>
        {heading}
      </Text>

      {/* THE PROOF IS OPTIONAL. Attach the bank's advice, a screenshot or the
          statement and the server finds the reference and checks it; or type the
          UTR straight in, which is what a phone at a branch usually needs. */}
      <AttachmentPicker
        label="Payment proof"
        attachments={proof}
        maxFiles={1}
        onAdd={(files) => {
          setResult(null);
          setProof(
            files.slice(0, 1).map((file) => ({
              id: `${file.name}-${file.size}`,
              name: file.name,
              uri: file.uri,
              mimeType: file.mimeType,
              size: file.size,
            })),
          );
        }}
        onRemove={() => {
          setProof([]);
          setResult(null);
        }}
      />

      {proof.length ? (
        <TouchableOpacity
          style={[styles.proofReadBtn, reading && styles.proofReadBtnOff]}
          activeOpacity={0.8}
          onPress={read}
          disabled={reading}
        >
          <Ionicons name="document-text-outline" size={ms(14)} color={COLORS.primary} />
          <Text style={styles.proofReadText}>{reading ? "Reading…" : "Read proof"}</Text>
        </TouchableOpacity>
      ) : null}
      {reading ? (
        <Text style={styles.utrHint}>
          A photo or a scanned statement can take up to a minute.
        </Text>
      ) : null}

      {result ? (
        <View style={styles.proofResult}>
          <Text style={styles.utrHint}>
            {result.file_name}: {result.kind === "statement" ? "a statement" : "a payment advice"},{" "}
            {PROOF_SOURCE[result.source] ?? result.source}. {result.references_found}{" "}
            {result.references_found === 1 ? "reference" : "references"} found.
          </Text>
          {result.utr ? (
            <>
              <CheckLine
                label="Amount"
                value={result.checks.amount}
                pass={`${money(amount)}, as paid`}
                fail={`the proof shows ${
                  result.amount !== null ? money(result.amount) : "another amount"
                }, not ${money(amount)}`}
                unknown="not shown next to this reference"
              />
              <CheckLine
                label="Account"
                value={result.checks.account}
                pass={`paid to ${proofQuery.toAccount}`}
                fail={`the proof shows ${
                  result.checks.account_other ?? "another account"
                }, another account of this payee`}
                unknown={
                  proofQuery.toAccount ? "not shown on the proof" : "no account to check against"
                }
              />
              <CheckLine
                label="Invoice"
                value={result.checks.invoice}
                pass="the invoice number is in the remarks"
                fail="another invoice"
                unknown={
                  proofQuery.invoices.length
                    ? "not in the remarks (banks often leave it out)"
                    : "no invoice on this request"
                }
              />
              {result.row_text ? (
                <Text style={styles.proofRowText} numberOfLines={3}>
                  {result.row_text}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.utrWarn}>
              No UTR-like reference was found in this file. Type it below, or try the bank&apos;s
              own advice instead of a screenshot.
            </Text>
          )}

          {result.candidates.length ? (
            <View style={styles.candidateRow}>
              <Text style={styles.utrHint}>Other references in this file:</Text>
              {result.candidates.map((candidate) => (
                <TouchableOpacity
                  key={candidate.utr}
                  style={styles.candidate}
                  activeOpacity={0.8}
                  onPress={() => setUtr(cleanUtr(candidate.utr))}
                >
                  <Text style={styles.candidateText}>
                    {candidate.utr}
                    {candidate.amount !== null ? ` · ${money(candidate.amount)}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View ref={row} style={styles.utrRow}>
        <TextInput
          style={styles.utrInput}
          value={utr}
          onChangeText={(value) => setUtr(cleanUtr(value))}
          placeholder="e.g. HDFCN52026092312345678"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={30}
          onFocus={() => onFocusRow(row.current)}
        />
        <TouchableOpacity
          style={[styles.utrBtn, (!valid || saving) && styles.utrBtnOff]}
          onPress={save}
          disabled={!valid || saving}
        >
          <Text style={styles.utrBtnText}>{saving ? "…" : "Record"}</Text>
        </TouchableOpacity>
      </View>
      {utr.length > 0 && !valid ? (
        <Text style={styles.utrWarn}>A UTR is 8 to 30 letters and digits.</Text>
      ) : null}
      {line.utr ? (
        <TouchableOpacity
          style={styles.utrChange}
          activeOpacity={0.8}
          onPress={() => setEditing(false)}
        >
          <Text style={styles.utrChangeText}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Record Payment — every transfer's UTR, after the money has gone.
 *
 * The web's card, part for part: one panel per TRANSFER line, an optional proof
 * the server reads, the three checks it made, and the reference recorded only
 * when pressed. Cash and cheque lines are not here: there is nothing to record.
 */
function RecordPaymentCard({
  request,
  entry,
  recordedBy,
  onRecorded,
  onFocusRow,
}: {
  request: ApiRequest;
  entry: AdvanceRequestEntry;
  recordedBy: string;
  onRecorded: (request: ApiRequest) => void;
  onFocusRow: (node: View | null) => void;
}) {
  const payout = entry.payout;
  const transfers = (payout?.lines ?? [])
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isTransfer(line.method));

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="receipt-outline" size={ms(16)} color={COLORS.primary} />
        </View>
        <Text style={styles.sectionTitle}>Record Payment</Text>
        <View style={styles.afterPayingTag}>
          <Text style={styles.afterPayingText}>After paying</Text>
        </View>
      </View>

      {transfers.length === 0 ? (
        <Text style={styles.utrHint}>
          No bank transfers on this request: nothing to record a UTR for.
        </Text>
      ) : (
        transfers.map(({ line, index }) => (
          <UtrLine
            key={line.id}
            line={line}
            index={index}
            request={request}
            recordedBy={recordedBy}
            proofQuery={{
              company: entry.form.company as AdvancePaymentCompany,
              toAccount: payout?.toAccountNumber ?? "",
              // An employee is paid to a G/L account, not a SAP partner, so
              // there are no other accounts of theirs for SAP to recognise.
              cardCode: entry.form.type === "EMPLOYEE_ADVANCE" ? "" : entry.form.partner,
              // The documents this request pays, by number AND by the vendor's
              // own reference: either may be in the transfer's remarks.
              invoices: entry.form.selected.flatMap((doc) =>
                doc.reference ? [doc.number, doc.reference] : [doc.number],
              ),
            }}
            onRecorded={onRecorded}
            onFocusRow={onFocusRow}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: sp(28) },
  contentWithActions: { paddingBottom: sp(96) },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(12),
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: fs(14),
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: sp(32),
  },

  // ── Header ──────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
    marginBottom: sp(14),
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: sp(10) },
  requestNo: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: fs(19),
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusPill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: sp(5),
    paddingHorizontal: sp(12),
  },
  statusText: { fontSize: fs(11), fontWeight: "800" },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(12),
  },
  party: { flexShrink: 1, color: "#fff", fontSize: fs(14), fontWeight: "700" },
  partyGl: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },
  // Who the account belongs to, under the route it takes.
  routeNote: {
    color: "rgba(255,255,255,0.75)",
    fontSize: fs(11),
    marginTop: sp(4),
  },

  // ── Returned / rejected banner ──────────────────────────────────────
  rejectBanner: {
    flexDirection: "row",
    marginHorizontal: sp(14),
    gap: sp(10),
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: sp(14),
    padding: sp(14),
    marginBottom: sp(12),
  },
  rejectText: { flex: 1, minWidth: 0 },
  rejectTitle: { fontSize: fs(13), fontWeight: "800", color: COLORS.error },
  rejectReason: {
    fontSize: fs(12.5),
    color: COLORS.text,
    marginTop: sp(4),
    lineHeight: fs(18),
  },
  rejectHint: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: sp(6) },

  // ── Cards ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginHorizontal: sp(14),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(14),
  },
  headerIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { flex: 1, fontSize: fs(15), fontWeight: "700", color: COLORS.text },
  gapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(4),
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: sp(10),
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    flexShrink: 0,
  },
  gapPillLate: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  gapText: { fontSize: fs(11), fontWeight: "700", color: COLORS.textSecondary },
  gapTextLate: { color: COLORS.error },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(12),
  },
  sectionIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { flex: 1, fontSize: fs(15), fontWeight: "700", color: COLORS.text },
  awaitingPill: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: sp(20),
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
  },
  awaitingText: { fontSize: fs(11), fontWeight: "800", color: COLORS.primary },

  // ── The information grid ────────────────────────────────────────────
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    paddingVertical: sp(6),
  },
  fieldHalf: { width: "50%", paddingRight: sp(8) },
  fieldFull: { width: "100%" },
  fieldIcon: { marginTop: sp(2) },
  fieldText: { flex: 1, minWidth: 0 },
  label: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  value: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: fs(18),
  },
  valueLink: { color: COLORS.primary },
  valueMuted: { color: COLORS.textSecondary, fontWeight: "600" },
  subValue: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginTop: sp(2),
    lineHeight: fs(15),
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryLight,
    borderRadius: sp(8),
    paddingVertical: sp(3),
    paddingHorizontal: sp(8),
    marginTop: sp(1),
  },
  badgeText: { fontSize: fs(11), fontWeight: "700", color: COLORS.primary },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: sp(4),
  },

  // ── Amount summary — the invoice-summary card's geometry ────────────
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(8),
  },
  summaryCol: { flex: 1, minWidth: ms(130) },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(4),
  },
  summaryLabel: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: sp(3),
  },
  summaryOpen: { fontSize: fs(16), fontWeight: "800", color: COLORS.primary },
  summaryPay: { fontSize: fs(16), fontWeight: "800", color: COLORS.success },
  summaryNote: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(2) },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    marginTop: sp(5),
  },
  chipText: { fontSize: fs(10), fontWeight: "700" },

  // ── Line rows ───────────────────────────────────────────────────────
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(10),
  },
  // The border sits BETWEEN rows, never above the first one.
  lineRowBordered: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  lineIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(10),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  lineText: { flex: 1, minWidth: 0 },
  lineNo: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  lineParty: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: sp(2) },
  lineAmount: {
    fontSize: fs(13),
    fontWeight: "800",
    color: COLORS.text,
    flexShrink: 0,
  },
  lineRight: { flexDirection: "row", alignItems: "center", gap: sp(6), flexShrink: 0 },
  lineUtr: { fontSize: fs(11), color: COLORS.success, fontWeight: "700", marginTop: sp(2) },
  proofRow: { marginTop: sp(2), marginBottom: sp(2) },
  // Copied from `approval/components/AttachmentCard` — one attachment card.
  attachCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: sp(10),
    marginBottom: 10,
  },
  attachThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  // `minWidth: 0` so a long name ellipsises inside the row instead of pushing
  // the view and download buttons off the card.
  attachText: { flex: 1, minWidth: 0 },
  attachName: { fontSize: fs(13), fontWeight: "600", color: COLORS.text },
  attachMeta: { fontSize: fs(11), color: COLORS.textMuted, marginTop: 2 },
  attachActions: { flexDirection: "row", gap: sp(6), flexShrink: 0 },
  attachBtn: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(10),
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  // Indented and tinted so an open document reads as belonging to the row
  // above it rather than as another row in the list.
  lineDetail: {
    marginLeft: sp(30),
    marginBottom: sp(8),
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
    borderRadius: sp(8),
    backgroundColor: COLORS.background,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sp(10),
    paddingVertical: sp(3),
  },
  detailLineLabel: { fontSize: fs(11), color: COLORS.textMuted, flexShrink: 0 },
  detailLineValue: {
    flex: 1,
    fontSize: fs(11.5),
    color: COLORS.text,
    fontWeight: "600",
    textAlign: "right",
  },
  detailLineLink: {
    flex: 1,
    fontSize: fs(11.5),
    color: COLORS.primary,
    fontWeight: "700",
    textAlign: "right",
  },

  // ── SAP card ────────────────────────────────────────────────────────
  sapCard: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(12),
    padding: sp(14),
    marginHorizontal: sp(14),
    marginBottom: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sapHeader: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  sapIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(8),
    alignItems: "center",
    justifyContent: "center",
  },
  sapTitle: { flex: 1, fontSize: fs(13.5), fontWeight: "800", color: COLORS.text },
  sapBadge: {
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: sp(6),
  },
  sapBadgeText: { fontSize: fs(10), fontWeight: "800", letterSpacing: 0.3 },
  sapHeadline: {
    fontSize: fs(12),
    fontWeight: "700",
    marginTop: sp(10),
    marginBottom: sp(2),
  },
  sapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sp(10),
    paddingVertical: sp(4),
  },
  sapLabel: { fontSize: fs(11.5), color: COLORS.textMuted, flexShrink: 0 },
  sapValue: {
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    textAlign: "right",
  },
  sapResponse: { marginTop: sp(10), padding: sp(10), borderRadius: sp(8) },
  sapResponseLabel: {
    fontSize: fs(10),
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    marginBottom: sp(3),
  },
  sapResponseText: { fontSize: fs(11.5), lineHeight: fs(17), color: COLORS.text },

  // ── Decision ────────────────────────────────────────────────────────
  actionBox: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: sp(20),
    borderTopRightRadius: sp(20),
    paddingHorizontal: sp(14),
    paddingTop: sp(6),
    paddingBottom: sp(16),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 12,
  },
  actionToggle: { alignItems: "center", paddingVertical: sp(4), gap: sp(2) },
  actionGrabber: {
    width: ms(38),
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  actionRow: { flexDirection: "row", gap: sp(10), marginTop: sp(8) },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    borderRadius: sp(12),
    paddingVertical: sp(12),
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
    marginTop: sp(8),
  },
  saveBtnOff: { borderColor: COLORS.border, backgroundColor: COLORS.inputBackground },
  saveBtnDone: { borderColor: COLORS.success, backgroundColor: COLORS.successLight },
  saveBtnText: { fontSize: fs(13), fontWeight: "800", color: COLORS.primary },
  saveBtnTextDone: { color: COLORS.success },
  remarksInput: {
    minHeight: sp(84),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(12),
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: sp(12),
    paddingVertical: sp(10),
    fontSize: fs(13),
    color: COLORS.text,
  },
  remarksCount: {
    alignSelf: "flex-end",
    fontSize: fs(10),
    color: COLORS.textMuted,
    marginTop: sp(4),
  },
  // Equal halves, or the whole row when a row holds one button.
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    borderRadius: sp(12),
    paddingVertical: sp(13),
    paddingHorizontal: sp(8),
  },
  actionBtnText: { color: "#fff", fontSize: fs(13), fontWeight: "700", flexShrink: 1 },
  // Blocked, not dead: it still presses, and says why.
  actionBtnBlocked: { opacity: 0.55 },

  utrRow: { flexDirection: "row", alignItems: "center", gap: sp(8), marginTop: sp(8) },
  // One transfer line's panel, bordered like the receipt's attachment cards so
  // several lines read as several jobs rather than one long column.
  utrLine: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(12),
    padding: sp(12),
    marginTop: sp(10),
    backgroundColor: COLORS.surface,
  },
  utrHeading: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.text },
  utrRecorded: { flexDirection: "row", alignItems: "center", gap: sp(6), marginTop: sp(8) },
  utrRecordedText: { fontSize: fs(12), fontWeight: "800", color: COLORS.success, flexShrink: 1 },
  utrProofNote: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(4) },
  utrChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(4),
    alignSelf: "flex-start",
    marginTop: sp(8),
  },
  utrChangeText: { fontSize: fs(11.5), fontWeight: "800", color: COLORS.primary },
  utrHint: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(6), lineHeight: fs(16) },
  utrWarn: { fontSize: fs(11), color: COLORS.warning, marginTop: sp(6), lineHeight: fs(16) },
  proofReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    marginTop: sp(8),
    paddingVertical: sp(9),
    borderRadius: sp(10),
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    backgroundColor: COLORS.primaryLighter,
  },
  proofReadBtnOff: { opacity: 0.6 },
  proofReadText: { fontSize: fs(12), fontWeight: "800", color: COLORS.primary },
  proofResult: {
    marginTop: sp(10),
    padding: sp(10),
    borderRadius: sp(10),
    backgroundColor: COLORS.background,
  },
  // The line the UTR was read from, shown as read: a monospace-ish figure is
  // what lets somebody compare it against the bank's own screen.
  proofRowText: {
    marginTop: sp(6),
    padding: sp(6),
    borderRadius: sp(6),
    backgroundColor: COLORS.surface,
    fontSize: fs(10.5),
    color: COLORS.textMuted,
  },
  checkLine: { flexDirection: "row", alignItems: "flex-start", gap: sp(6), marginTop: sp(6) },
  checkText: { flex: 1, fontSize: fs(11.5), color: COLORS.textSecondary, lineHeight: fs(16) },
  checkLabel: { fontWeight: "800", color: COLORS.text },
  candidateRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(6), marginTop: sp(8) },
  candidate: {
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(4),
  },
  candidateText: { fontSize: fs(10.5), fontWeight: "800", color: COLORS.primary },
  afterPayingTag: {
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: 999,
    backgroundColor: COLORS.primaryLighter,
  },
  afterPayingText: { fontSize: fs(10), fontWeight: "800", color: COLORS.primary },
  utrInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(10),
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
    fontSize: fs(12),
    color: COLORS.text,
  },
  utrBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: sp(10),
    paddingHorizontal: sp(14),
    paddingVertical: sp(10),
  },
  utrBtnOff: { backgroundColor: COLORS.borderLight },
  utrBtnText: { fontSize: fs(12), fontWeight: "800", color: "#fff" },
});
