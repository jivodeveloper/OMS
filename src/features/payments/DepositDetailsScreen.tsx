import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import { setHeaderEditHandler } from "@/src/utils/headerEdit";
import ApprovalBottomBar from "@/src/features/approval/components/ApprovalBottomBar";
import SapInfoCard from "@/src/features/payments/components/SapInfoCard";
import AttachmentList from "@/src/features/approval/components/AttachmentList";
import EditHistoryCard from "@/src/features/payments/components/EditHistoryCard";
import AttachmentViewer from "@/src/features/approval/components/AttachmentViewer";
import type { ApprovalAttachment } from "@/src/features/approval/types";
import ApproveDialog from "@/src/features/approval/components/dialogs/ApproveDialog";
import RejectDialog from "@/src/features/approval/components/dialogs/RejectDialog";
import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";
import ApprovalSuccessDialog from "@/src/features/approval/components/dialogs/ApprovalSuccessDialog";
import SapErrorDialog from "@/src/features/approval/components/dialogs/SapErrorDialog";
import { showToast } from "@/src/components/common/Toast";
import approvalsService from "@/src/services/approvals.service";

import { handoverDays } from "@/src/features/payments/handoverSpan";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
  type StatusHistoryRow,
} from "@/src/services/payments.service";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  POSTING_TO_SAP: "Posting",
  POSTED: "Completed",
  PENDING_ERROR: "Failed",
  SAP_UNKNOWN: "Unconfirmed",
  CANCELLED_IN_SAP: "Cancelled in SAP",
  CANCELLED: "Cancelled",
};

/** Pill colour follows the outcome, matching the payment header. */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: COLORS.textSecondary,
  PENDING_APPROVAL: COLORS.warning,
  APPROVED: COLORS.success,
  POSTED: COLORS.success,
  REJECTED: COLORS.error,
  PENDING_ERROR: COLORS.error,
  SAP_UNKNOWN: COLORS.warning,
  CANCELLED_IN_SAP: COLORS.warning,
  POSTING_TO_SAP: COLORS.primary,
  CANCELLED: COLORS.textSecondary,
};

const money = (value: string | number | null | undefined) =>
  `₹${(Number(value) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Read-only detail for one bank deposit.
 *
 * Deliberately the SAME layout as the payment detail screen — gradient header,
 * General Information grid, a summary card, then the lines — because a person
 * reviewing both in one sitting should not have to relearn where things are.
 *
 * What differs is only what a deposit HAS: no party or invoice, but a bank
 * account, a depositor, and a collected-vs-banked comparison that a payment
 * has no equivalent of.
 */
/** "24 Aug 2026" — day-first, matching every other date on this screen. */
const shortDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function DepositDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; refreshAt?: string }>();
  const id = Number(params.id);
  // Bumped by the edit form when it navigates back here. Without it the screen
  // can already be mounted for this same id, so nothing would refetch and the
  // approver would be looking at the figures from BEFORE the correction.
  const refreshAt = params.refreshAt;

  const [deposit, setDeposit] = useState<BankDeposit | null>(null);
  // Receipt rows the reader has opened. Collapsed by default: a deposit can
  // hold many receipts, and expanding them all would bury the summary the
  // approver reads first.
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /**
   * The approve/reject flow, shown ONLY to whoever the deposit is parked with.
   *
   * `permissions.can_decide` comes from the server — it depends on which rung
   * the chain is at, on named approvers narrowing a level, and it forbids
   * self-approval. Deriving that in the app would create a second authority
   * that can disagree with the one enforcing it.
   */
  const [stage, setStage] = useState<
    "none" | "approve" | "reject" | "loading" | "success"
  >("none");
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [remarks, setRemarks] = useState("");
  const [viewing, setViewing] = useState<ApprovalAttachment | null>(null);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  /** True when the approval just taken was the LAST one — it went to SAP. */
  const [isFinal, setIsFinal] = useState(false);
  /** SAP refused the posting after a successful approval. */
  const [sapError, setSapError] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(id)) {
        setError("Missing deposit reference.");
        setLoading(false);
        return;
      }
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        setDeposit(await paymentsService.getDeposit(id));
        setError("");
        // Non-fatal: the page renders without it, so a history outage costs
        // the edit trail rather than the whole screen.
        try {
          setHistory(await paymentsService.getDepositHistory(id));
        } catch {
          setHistory([]);
        }
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        setError(
          status === 404
            ? "This deposit no longer exists."
            : status === 403
              ? "You do not have permission to view this deposit."
              : "Could not load this deposit.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load, refreshAt]);

  /** Post the decision, then leave for the tracking list with fresh data. */
  const act = useCallback(
    async (which: "approve" | "reject", note: string) => {
      const approvalId = deposit?.approval?.id;
      if (!approvalId) return;
      setDecision(which);
      setStage("loading");
      setBusy(true);
      try {
        await approvalsService.act(
          approvalId,
          which === "approve" ? "APPROVE" : "REJECT",
          note,
        );

        // Re-read the deposit. The FINAL approval posts to SAP synchronously,
        // so by the time this returns the outcome is already known — and it
        // may be a failure. Announcing "approved" over a SAP rejection would
        // send the approver away believing the money was banked.
        let sapFailure = "";
        let finished = false;
        try {
          const fresh = await paymentsService.getDeposit(id);
          setDeposit(fresh);
          finished = fresh.status !== "PENDING_APPROVAL";
          if (
            which === "approve" &&
            (fresh.status === "PENDING_ERROR" ||
              fresh.status === "SAP_UNKNOWN")
          ) {
            sapFailure =
              fresh.sap_response ||
              "SAP did not accept this deposit. Open it again to see why.";
          }
        } catch {
          // The re-read failed, not the decision. Fall through to the normal
          // success path rather than inventing an error.
        }

        if (sapFailure) {
          // NOT setError: that renders a full-page failure and would hide the
          // deposit the approver still needs to read. The dialog explains it
          // and leaves the document on screen behind it.
          setStage("none");
          setSapError(sapFailure);
          return;
        }
        setIsFinal(finished);
        setStage("success");
      } catch (err) {
        setStage("none");
        showToast(
          err instanceof Error ? err.message : "Could not record the decision.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [deposit?.approval?.id, id],
  );

  const isFocused = useIsFocused();

  /** Open the Bank Deposit form in edit mode — same screen, prefilled. */
  const handleEdit = useCallback(() => {
    if (!deposit) return;
    router.push({
      pathname: "/(main)/payments/bank-deposit",
      params: {
        depositId: String(deposit.id),
        // Back from the form returns to THIS page, not the drawer's last stop.
        from: "payments/deposit-details",
      },
    } as never);
  }, [deposit]);

  /**
   * Publish Edit into the navbar while THIS screen is focused, and withdraw it
   * the moment it is not — the same contract the payment detail screen uses.
   *
   * Tied to focus rather than mount: pushing the edit form leaves this screen
   * mounted underneath, so an unmount-only cleanup would leave the icon showing
   * on the form itself.
   */
  const canEditRef = useRef(false);
  const handleEditRef = useRef(handleEdit);
  useFocusEffect(
    useCallback(() => {
      setHeaderEditHandler(canEditRef.current ? handleEditRef.current : null);
      return () => setHeaderEditHandler(null);
    }, []),
  );
  useEffect(() => {
    canEditRef.current = !!deposit?.permissions?.can_edit;
    handleEditRef.current = handleEdit;
    if (isFocused) {
      setHeaderEditHandler(
        deposit?.permissions?.can_edit ? handleEdit : null,
      );
    }
  }, [deposit?.permissions?.can_edit, handleEdit, isFocused]);

  const leaveAfterDecision = useCallback(() => {
    // No toast. The dialog the approver just dismissed already stated the
    // outcome — including whether SAP accepted the posting — so a banner
    // repeating it over the tracking list adds nothing and covers the row they
    // came to check.
    setStage("none");
    // Land on the list with a refetch, so the row shows its NEW status rather
    // than the stale one the approver tapped.
    router.replace({
      pathname: "/(main)/payments/deposit-tracking",
      params: { refreshAt: String(Date.now()) },
    } as never);
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !deposit) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={44} color={COLORS.error} />
        <Text style={styles.errorText}>{error || "Deposit not found."}</Text>
      </View>
    );
  }

  const statusLabel =
    STATUS_LABEL[deposit.status] ?? deposit.status_display ?? deposit.status;
  const statusColor = STATUS_COLOR[deposit.status] ?? COLORS.warning;

  const collected = Number(deposit.collected_amount) || 0;
  const banked = Number(deposit.deposit_amount) || 0;
  const shortfall = collected - banked;
  const isShort = shortfall > 0.005;

  // Distinct parties whose money is in this deposit — not the same as the
  // receipt count, and the figure a reviewer is asked about.
  const parties = new Set(
    (deposit.lines ?? []).map((l) => l.card_name).filter(Boolean),
  );

  const canDecide = !!deposit.permissions?.can_decide;

  // What is physically in this deposit, counted from the receipts rather than
  // read off deposit_type. "MIXED" tells an approver nothing about what they
  // are signing for; "2 cash · 1 cheque" tells them what to count.
  const tenderCounts = (deposit.lines ?? []).reduce(
    (acc, line) => {
      for (const entry of line.methods ?? []) {
        if (entry.method === "CASH") acc.cash += 1;
        else if (entry.method === "CHEQUE") acc.cheque += 1;
      }
      return acc;
    },
    { cash: 0, cheque: 0 },
  );
  const tenderParts = [
    tenderCounts.cash ? `${tenderCounts.cash} cash` : null,
    tenderCounts.cheque ? `${tenderCounts.cheque} cheque` : null,
  ].filter(Boolean);
  // Falls back to the stored type when the lines carry no methods — an older
  // deposit, or one whose receipts were removed.
  const depositTypeLabel = tenderParts.length
    ? tenderParts.join(" · ")
    : deposit.deposit_type;

  /**
   * Deposit attachments in the shape the shared card renders.
   *
   * Labelled by TYPE, not filename — `original_name` is whatever the phone
   * called the upload, and in practice that is a camera UUID that tells an
   * approver nothing. "Bank deposit slip" does.
   */
  const depositAttachments: ApprovalAttachment[] = (deposit.attachments || [])
    .map((a) => ({
      id: String(a.id),
      name: a.type_display || "Attachment",
      size: shortDate(a.created_at),
      kind:
        (a.file_type || "").toLowerCase() === "pdf"
          ? ("pdf" as const)
          : ("image" as const),
      downloadUrl: a.download_url,
    }));

  const openAttachment = (attachment: ApprovalAttachment) => {
    if (!attachment.downloadUrl) {
      showToast(`${attachment.name} has no stored file.`, "info");
      return;
    }
    setViewing(attachment);
  };

  /** Save the file and hand it to the OS. See the approval screen's twin. */
  const downloadAttachment = async (attachment: ApprovalAttachment) => {
    if (!attachment.downloadUrl) {
      showToast(`${attachment.name} has no stored file.`, "info");
      return;
    }
    try {
      showToast(`Downloading ${attachment.name}…`, "info");
      const uri = await paymentsService.downloadAttachment(
        attachment.id,
        attachment.name,
      );
      await Linking.openURL(uri);
    } catch (err) {
      showToast(
        (err as Error)?.message || "Could not download the file.",
        "error",
      );
    }
  };

  /**
   * How long the money waited between reaching SAP and reaching the bank.
   *
   * Uses the LATEST posting across the deposit's receipts: the deposit cannot
   * have been banked before its last payment was booked, so measuring from any
   * earlier one would overstate the delay. Null when no receipt has posted yet
   * — there is no gap to report until there is a posting date to measure from.
   */
  const bankingGap = (() => {
    const postedAt = (deposit.lines || [])
      .map((line) => line.receipt_posted_at)
      .filter((value): value is string => !!value)
      .sort()
      .pop();
    if (!postedAt || !deposit.deposit_date) return null;
    // `handoverDays` takes a calendar day first and an instant second, which
    // is exactly this pair the other way round: SAP posts at an instant, the
    // deposit carries a bare date. So the posting is reduced to its day and
    // the deposit date is widened to midnight local.
    const days = handoverDays(
      postedAt.slice(0, 10),
      `${deposit.deposit_date}T00:00:00`,
    );
    if (days == null) return null;
    return {
      days,
      postedLabel: shortDate(postedAt),
      depositedLabel: shortDate(deposit.deposit_date),
    };
  })();

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load("refresh")}
        />
      }
    >
      {/* ── Gradient header ── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text style={styles.docNo} numberOfLines={1} adjustsFontSizeToFit>
            {deposit.deposit_no}
          </Text>
          <View style={styles.statusPill}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* The MOVEMENT, read left to right: the G/L the money left, then
            the bank it landed in.

            Source first because that is the direction the money travels, and
            because `bank_account_name` already ends with the destination G/L
            — putting the bank first made the row state the destination twice
            and the source not at all. */}
        <View style={styles.bankRow}>
          <Ionicons name="business-outline" size={ms(14)} color="#BFDBFE" />
          {!!deposit.source_gl_account && (
            <>
              <Text style={styles.bankGl} numberOfLines={1}>
                {deposit.source_gl_account}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={ms(13)}
                color="#BFDBFE"
              />
            </>
          )}
          <Text style={styles.bankName} numberOfLines={1}>
            {deposit.bank_account_name || "Bank deposit"}
          </Text>
        </View>
      </LinearGradient>

      {/* ── General Information ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="information-circle"
              size={ms(16)}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.cardTitle}>General Information</Text>
          {/* The banking delay as a badge on the header, so the one number a
              reviewer is looking for is on the same line as the card's name
              rather than buried among the fields. */}
          {bankingGap ? (
            <View
              style={[
                styles.gapPill,
                bankingGap.days > 2 ? styles.gapPillLate : null,
              ]}
            >
              <Ionicons
                name="time-outline"
                size={ms(12)}
                color={bankingGap.days > 2 ? COLORS.error : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.gapPillText,
                  bankingGap.days > 2 ? styles.gapPillTextLate : null,
                ]}
              >
                {bankingGap.days === 0
                  ? "Same day"
                  : `${bankingGap.days} ${
                      bankingGap.days === 1 ? "day" : "days"
                    }`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 1 — HOW LONG the money sat: the two dates the gap is measured
            between, side by side, so the span is read directly rather than
            worked out from opposite ends of the card.

            Measured from the LATEST receipt in the deposit, not the
            earliest: the deposit could not have been banked before its
            last payment was booked, so that is the date the gap starts
            from. Anything else would flatter the number. */}
        {bankingGap ? (
          <>
            <View style={styles.grid}>
              <Field
                icon="cash-outline"
                label="Payment Posted"
                value={bankingGap.postedLabel}
              />
              {/* "Banked On", not "Deposited": this is the user-entered
                  `deposit_date` — the day the money actually reached the
                  bank — NOT the day this entry was typed up. The two are
                  separate fields and can differ, so the label has to say
                  which one it is. */}
              <Field
                icon="business-outline"
                label="Banked On"
                value={bankingGap.depositedLabel}
              />
            </View>
            <View style={styles.divider} />
          </>
        ) : null}

        {/* 2 — WHAT this is: which company, and what is physically in the
            bag. */}
        <View style={styles.grid}>
          <Field icon="business-outline" label="Company" value={deposit.company} />
          <Field
            icon="wallet-outline"
            label="Deposit Type"
            // "MIXED" alone tells an approver nothing about what they are
            // signing for. The split says what is physically in the bag.
            value={depositTypeLabel}
            tone="badge"
          />
        </View>

        <View style={styles.divider} />

        {/* 3 — WHO. The two people on either side of the hand-over, paired
            so an approver reads them as a pair rather than hunting for the
            second one further down the card. */}
        <View style={styles.grid}>
          <Field
            icon="person-outline"
            label="Created By"
            value={deposit.created_by_name || "—"}
          />
          <Field
            icon="person-circle-outline"
            label="Deposited By"
            value={deposit.deposited_by_name || "—"}
          />
        </View>

        {deposit.slip_number ? (
          <>
            <View style={styles.divider} />
            <Field
              icon="receipt-outline"
              label="Slip Number"
              value={deposit.slip_number}
              full
            />
          </>
        ) : null}

        {/* Attributed, matching the receipt page. A deposit has no
            verification step, so there is only ever one note here — but naming
            its author still tells an approver whose account of the hand-over
            they are reading. */}
        {deposit.remarks ? (
          <>
            <View style={styles.divider} />
            <Field
              icon="chatbox-ellipses-outline"
              label={
                deposit.created_by_name
                  ? `Remarks by ${deposit.created_by_name}`
                  : "Remarks"
              }
              value={deposit.remarks}
              full
            />
          </>
        ) : null}

        {/* 4 — WHEN this ENTRY was raised.
            Deliberately NOT `deposit_date`, which row 1 already shows as
            "Banked On". These are two different facts: `deposit_date` is
            typed by the user and says when the money reached the bank,
            while `created_at` is stamped by the server and says when the
            record was made. Someone banking on Monday and entering it on
            Wednesday produces two different dates, and showing only one of
            them hides that. */}
        <View style={styles.divider} />

        <Field
          icon="calendar-outline"
          label="Entry Created"
          value={shortDate(deposit.created_at)}
          full
        />
      </View>

      {/* ── Deposit Summary — the deposit's answer to Invoice Summary ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerIcon}>
            <Ionicons name="cash" size={ms(16)} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Deposit Summary</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={styles.summaryCollected}>{money(collected)}</Text>
            <Text style={styles.summaryNote}>
              {deposit.lines?.length ?? 0} receipt
              {(deposit.lines?.length ?? 0) === 1 ? "" : "s"}
              {parties.size > 1 ? ` · ${parties.size} parties` : ""}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Deposited</Text>
            <Text style={styles.summaryBanked}>{money(banked)}</Text>
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: isShort
                    ? COLORS.warningLight
                    : COLORS.successLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isShort ? COLORS.warning : COLORS.success },
                ]}
              >
                {isShort ? "Short" : "Full amount"}
              </Text>
            </View>
          </View>
        </View>

        {/* Only when money is missing — a matched deposit has nothing to
            explain, and printing "₹0.00" under two equal figures is noise. */}
        {isShort ? (
          <View style={styles.shortfallBox}>
            {/* Amount and reason on ONE row: the figure is meaningless
                without its justification, so they are read together rather
                than stacked. Wraps to two lines on a narrow screen. */}
            <View style={styles.shortfallCol}>
              <Text style={styles.summaryLabel}>Shortfall</Text>
              <Text style={styles.shortfallValue}>{money(shortfall)}</Text>
            </View>
            {deposit.shortfall_reason ? (
              <View style={styles.shortfallReasonCol}>
                <Text style={styles.summaryLabel}>Reason</Text>
                <Text style={styles.shortfallReason}>
                  {deposit.shortfall_reason}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── SAP outcome ──
          Only after a posting has been attempted; the card returns null
          otherwise. Placed here, above the receipts, because "did it reach
          SAP?" is the first question after approving — the answer used to
          require opening View Progress. */}
      <SapInfoCard doc={deposit} kind="deposit" style={styles.sapCard} />

      {/* ── Deposit slips and bank receipts ──
          The proof the money reached the bank. The API has always returned
          these; the deposit screens simply never rendered them, so an
          approver signing off a deposit could not see its slip. */}
      {/* What changed since this deposit was raised, and who changed it. */}
      <EditHistoryCard history={history} style={styles.sapCard} />

      {/* ── Receipts banked — the deposit's answer to Payment Information ── */}
      {deposit.lines?.length ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <Ionicons name="documents" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>
              Receipts Banked ({deposit.lines.length})
            </Text>
          </View>

          {deposit.lines.map((line, i) => {
            const open = expandedLines.has(line.id);
            const methods = line.methods ?? [];
            // The tender badge on the collapsed row: an approver scanning the
            // list needs to know which of these is the cheque before opening
            // anything.
            const tenders = Array.from(new Set(methods.map((m) => m.method)));
            return (
              <View key={line.id}>
                <TouchableOpacity
                  style={[styles.lineRow, i > 0 && styles.lineRowBordered]}
                  activeOpacity={0.7}
                  onPress={() =>
                    setExpandedLines((prev) => {
                      const next = new Set(prev);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${line.receipt_no}, ${
                    line.card_name || "unknown party"
                  }, ${money(line.amount)}. ${open ? "Collapse" : "Expand"} details.`}
                >
                  <View style={styles.lineIcon}>
                    <Ionicons
                      name="receipt-outline"
                      size={ms(16)}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.lineText}>
                    <Text style={styles.lineNo} numberOfLines={1}>
                      {line.receipt_no}
                    </Text>
                    <Text style={styles.lineParty} numberOfLines={1}>
                      {line.card_name || "—"}
                    </Text>
                    {tenders.length ? (
                      <View style={styles.tenderRow}>
                        {tenders.map((t) => (
                          <View key={t} style={styles.tenderChip}>
                            <Text style={styles.tenderChipText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.lineRight}>
                    <Text style={styles.lineAmount} numberOfLines={1}>
                      {money(line.amount)}
                    </Text>
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={ms(15)}
                      color={COLORS.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {open ? (
                  <View style={styles.lineDetail}>
                    <DetailRow label="Party code" value={line.card_code} />
                    <DetailRow
                      label="Received on"
                      value={line.payment_date}
                    />
                    <DetailRow
                      label="Collected by"
                      value={line.collected_by}
                    />
                    <DetailRow
                      label="Receipt total"
                      value={
                        line.receipt_total ? money(line.receipt_total) : ""
                      }
                    />
                    <DetailRow
                      label="Receipt status"
                      value={STATUS_LABEL[line.receipt_status] ?? line.receipt_status}
                    />
                    <DetailRow label="Remarks" value={line.receipt_remarks} />

                    {/* One block per tender. A cheque carries the number, the
                        payer's bank and its date — what the approver checks
                        against the paper in front of them. */}
                    {methods.map((m) => (
                      <View key={m.id} style={styles.methodBlock}>
                        <View style={styles.methodHead}>
                          <Ionicons
                            name={
                              m.method === "CASH"
                                ? "cash-outline"
                                : m.method === "CHEQUE"
                                  ? "document-text-outline"
                                  : "phone-portrait-outline"
                            }
                            size={ms(13)}
                            color={COLORS.primary}
                          />
                          <Text style={styles.methodName}>{m.method}</Text>
                          <Text style={styles.methodAmount}>
                            {money(m.amount)}
                          </Text>
                        </View>
                        {m.method === "CHEQUE" ? (
                          <>
                            <DetailRow
                              label="Cheque no."
                              value={m.cheque_number}
                            />
                            <DetailRow
                              label="Cheque bank"
                              value={m.bank_name}
                            />
                            <DetailRow
                              label="Cheque date"
                              value={m.cheque_date ?? ""}
                            />
                          </>
                        ) : null}
                        {m.method === "UPI" ? (
                          <DetailRow
                            label="Reference"
                            value={m.upi_reference}
                          />
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Proof the money reached the bank, LAST — an approver reads the
          figures and the receipts first, then checks them against the slip.
          Above the receipts it sat between the summary and the thing being
          summarised. */}
      <AttachmentList
        attachments={depositAttachments}
        onView={openAttachment}
        onDownload={downloadAttachment}
        style={styles.sapCard}
      />
      </ScrollView>

      {/* Only for whoever the deposit is parked with. A creator, or an
          approver at a different rung, sees the details and nothing else. */}
      {canDecide ? (
        <ApprovalBottomBar
          onReject={() => {
            setRemarks("");
            setStage("reject");
          }}
          onApprove={() => {
            setRemarks("");
            setStage("approve");
          }}
          disabled={busy}
        />
      ) : null}

      <ApproveDialog
        visible={stage === "approve"}
        onClose={() => setStage("none")}
        onConfirm={(note) => void act("approve", note)}
      />
      <RejectDialog
        visible={stage === "reject"}
        onClose={() => setStage("none")}
        onConfirm={(note) => void act("reject", note)}
      />
      <ApprovalLoadingDialog
        visible={stage === "loading"}
        decision={decision}
      />
      <ApprovalSuccessDialog
        visible={stage === "success"}
        decision={decision}
        isFinal={isFinal}
        requestNo={deposit.deposit_no}
        date={new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
        time={new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })}
        onDone={leaveAfterDecision}
      />

      {/* The approval succeeded; SAP refused the posting. Two different
          outcomes, so they get two different dialogs. */}
      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />

      <SapErrorDialog
        visible={!!sapError}
        message={sapError}
        canEdit={false}
        onEdit={() => setSapError("")}
        onClose={() => {
          setSapError("");
          leaveAfterDecision();
        }}
      />
    </View>
  );
}

/** One icon + label + value cell. `full` spans both columns. */
/**
 * One label/value line inside an expanded receipt.
 *
 * Renders nothing when the value is empty rather than showing "—": an expanded
 * receipt already has many rows, and a column of dashes reads as missing data
 * when it usually just means "not applicable to this tender".
 */
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const text = (value ?? "").toString().trim();
  if (!text) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  tone = "plain",
  full = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "plain" | "badge";
  full?: boolean;
}) {
  return (
    <View style={[styles.field, full ? styles.fieldFull : styles.fieldHalf]}>
      <Ionicons
        name={icon}
        size={ms(17)}
        color={COLORS.textMuted}
        style={styles.fieldIcon}
      />
      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        {tone === "badge" ? (
          <View style={styles.badge}>
            {/* Two lines, not one. "3 cash · 2 cheque" does not fit a
                half-width column on a small phone, and a clipped tender
                breakdown is the one thing on this card an approver must
                not misread. */}
            <Text style={styles.badgeText} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ) : (
          <Text style={styles.value} numberOfLines={full ? 4 : 2}>
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

// Mirrors ApprovalHeaderCard + GeneralInformationCard so the two detail pages
// are the same screen with different content.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: sp(28) },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(10),
    backgroundColor: COLORS.background,
    padding: sp(24),
  },
  errorText: {
    fontSize: fs(13),
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  header: {
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
    marginBottom: sp(14),
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: sp(10) },
  docNo: {
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
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(12),
  },
  bankName: {
    flexShrink: 1,
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "700",
  },
  bankGl: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },

  // Same gutter as `card` — SapInfoCard brings no outer margin of its own.
  sapCard: { marginHorizontal: sp(14) },
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
  // `flex: 1` so a header can carry a trailing badge: the title takes the
  // space it needs and pushes anything after it to the right edge. Harmless
  // on the headers that carry nothing else.
  cardTitle: {
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
  // The banking delay, on the General Information header.
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
  },
  // Past two days the delay is the point, not a footnote.
  gapPillLate: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  gapPillText: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  gapPillTextLate: { color: COLORS.error },

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
  badge: {
    alignSelf: "flex-start",
    // Never wider than the column it sits in: without this the badge sizes
    // to its text and pushes the row sideways on a narrow screen.
    maxWidth: "100%",
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

  // Two figures side by side, wrapping rather than clipping a long amount.
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
  summaryCollected: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.primary,
  },
  summaryBanked: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.success,
  },
  summaryNote: {
    fontSize: fs(11),
    color: COLORS.textMuted,
    marginTop: sp(2),
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    marginTop: sp(5),
  },
  chipText: { fontSize: fs(10), fontWeight: "700" },
  shortfallBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(12),
    marginTop: sp(12),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  // The amount keeps only the width it needs; the reason takes the rest.
  shortfallCol: { flexShrink: 0 },
  shortfallReasonCol: { flex: 1, minWidth: ms(140) },
  shortfallValue: {
    fontSize: fs(18),
    fontWeight: "800",
    color: COLORS.warning,
  },
  shortfallReason: {
    fontSize: fs(12),
    lineHeight: fs(17),
    color: COLORS.text,
  },

  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(10),
  },
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
  lineParty: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginTop: sp(2),
  },
  lineAmount: {
    fontSize: fs(13),
    fontWeight: "800",
    color: COLORS.text,
    flexShrink: 0,
  },

  // ── Expandable receipt detail ──────────────────────────────────────────
  lineRight: { flexDirection: "row", alignItems: "center", gap: sp(6), flexShrink: 0 },
  tenderRow: { flexDirection: "row", gap: sp(4), marginTop: sp(4) },
  tenderChip: {
    paddingHorizontal: sp(6),
    paddingVertical: sp(1),
    borderRadius: sp(4),
    backgroundColor: COLORS.primary + "14",
  },
  tenderChipText: {
    fontSize: fs(9),
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  // Indented and tinted so an open receipt reads as belonging to the row above
  // it rather than as another row in the list.
  lineDetail: {
    marginLeft: sp(30),
    marginBottom: sp(8),
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
    borderRadius: sp(8),
    backgroundColor: COLORS.background,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sp(10),
    paddingVertical: sp(3),
  },
  detailLabel: { fontSize: fs(11), color: COLORS.textMuted, flexShrink: 0 },
  detailValue: {
    fontSize: fs(11.5),
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  methodBlock: {
    marginTop: sp(8),
    paddingTop: sp(8),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  methodHead: { flexDirection: "row", alignItems: "center", gap: sp(6) },
  methodName: {
    fontSize: fs(11),
    fontWeight: "800",
    color: COLORS.primary,
    flex: 1,
  },
  methodAmount: { fontSize: fs(11.5), fontWeight: "800", color: COLORS.text },
});
