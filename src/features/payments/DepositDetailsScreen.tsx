import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import ApprovalBottomBar from "@/src/features/approval/components/ApprovalBottomBar";
import ApproveDialog from "@/src/features/approval/components/dialogs/ApproveDialog";
import RejectDialog from "@/src/features/approval/components/dialogs/RejectDialog";
import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";
import ApprovalSuccessDialog from "@/src/features/approval/components/dialogs/ApprovalSuccessDialog";
import SapErrorDialog from "@/src/features/approval/components/dialogs/SapErrorDialog";
import { showToast } from "@/src/components/common/Toast";
import approvalsService from "@/src/services/approvals.service";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
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
export default function DepositDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);

  const [deposit, setDeposit] = useState<BankDeposit | null>(null);
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
  }, [load]);

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

  const leaveAfterDecision = useCallback(() => {
    setStage("none");
    showToast(
      decision === "approve" ? "Deposit approved." : "Deposit rejected.",
      decision === "approve" ? "success" : "info",
    );
    // Land on the list with a refetch, so the row shows its NEW status rather
    // than the stale one the approver tapped.
    router.replace({
      pathname: "/(main)/payments/deposit-tracking",
      params: { refreshAt: String(Date.now()) },
    } as never);
  }, [decision]);

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

        {/* Bank and account number, mirroring party + party code on a payment. */}
        <View style={styles.bankRow}>
          <Ionicons name="business-outline" size={ms(14)} color="#BFDBFE" />
          <Text style={styles.bankName} numberOfLines={1}>
            {deposit.bank_account_name || "Bank deposit"}
          </Text>
          {!!deposit.bank_gl_account && (
            <>
              <View style={styles.separator} />
              <Text style={styles.bankGl} numberOfLines={1}>
                GL {deposit.bank_gl_account}
              </Text>
            </>
          )}
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
        </View>

        <View style={styles.grid}>
          <Field icon="business-outline" label="Company" value={deposit.company} />
          <Field
            icon="person-outline"
            label="Created By"
            value={deposit.created_by_name || "—"}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.grid}>
          <Field
            icon="calendar-outline"
            label="Deposit Date"
            value={deposit.deposit_date || "—"}
          />
          <Field
            icon="wallet-outline"
            label="Deposit Type"
            value={deposit.deposit_type}
            tone="badge"
          />
        </View>

        <View style={styles.divider} />

        <Field
          icon="person-circle-outline"
          label="Deposited By"
          value={deposit.deposited_by_name || "—"}
          full
        />

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

        {deposit.remarks ? (
          <>
            <View style={styles.divider} />
            <Field
              icon="chatbox-ellipses-outline"
              label="Remarks"
              value={deposit.remarks}
              full
            />
          </>
        ) : null}
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
            <Text style={styles.summaryLabel}>Shortfall</Text>
            <Text style={styles.shortfallValue}>{money(shortfall)}</Text>
            {deposit.shortfall_reason ? (
              <Text style={styles.shortfallReason}>
                {deposit.shortfall_reason}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

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

          {deposit.lines.map((line, i) => (
            <View
              key={line.id}
              style={[styles.lineRow, i > 0 && styles.lineRowBordered]}
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
              </View>
              <Text style={styles.lineAmount} numberOfLines={1}>
                {money(line.amount)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
            <Text style={styles.badgeText} numberOfLines={1}>
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
  separator: {
    width: 1,
    height: ms(12),
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  bankGl: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },

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
  cardTitle: { fontSize: fs(15), fontWeight: "700", color: COLORS.text },

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
    alignItems: "center",
    marginTop: sp(12),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  shortfallValue: {
    fontSize: fs(18),
    fontWeight: "800",
    color: COLORS.warning,
  },
  shortfallReason: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: sp(4),
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
});
