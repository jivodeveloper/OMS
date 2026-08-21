import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
  type PaymentReceipt,
} from "@/src/services/payments.service";
import ReceiptViewerModal from "./components/ReceiptViewerModal";
import type { TrackingKind } from "./PaymentTrackingScreen";

/**
 * Read-only detail for a payment receipt or a bank deposit.
 *
 * Mirrors orders/orderdetails.tsx: gradient hero, info card, line-item card and
 * grand-total banner.
 *
 * Deliberately WITHOUT the approval timeline, the SAP Information card and the
 * SAP posting history — all three live on the Progress screen, which is what
 * the card's "View Progress" button opens. This page answers "what is this
 * entry?"; that one answers "where has it got to?".
 */

const formatMoney = (value: string | number) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_APPROVAL: { bg: "#FFF7E6", fg: "#B45309" },
  APPROVED: { bg: "#EEF2FF", fg: "#4338CA" },
  POSTING_TO_SAP: { bg: "#EEF2FF", fg: "#4338CA" },
  SAP_UNKNOWN: { bg: "#FFF7E6", fg: "#B45309" },
  POSTED: { bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { bg: "#FEF2F2", fg: "#B91C1C" },
  CANCELLED: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_ERROR: { bg: "#FEF2F2", fg: "#B91C1C" },
};

/** Same creator-facing wording as the tracking list — see STATUS_LABEL there. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  APPROVED: "In Progress",
  POSTING_TO_SAP: "Posting to SAP",
  SAP_UNKNOWN: "Awaiting SAP check",
  POSTED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  PENDING_ERROR: "Pending Error",
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function TrackingDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const id = Number(params.id);
  const kind = (params.kind as TrackingKind) || "PAYMENT";
  const isPayment = kind === "PAYMENT";

  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [deposit, setDeposit] = useState<BankDeposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // OMS-generated SAP-style receipt — shown IN-APP as an image via
  // ReceiptViewerModal (with its own Download button). Only for a POSTED payment.
  const [receiptOpen, setReceiptOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) {
      setError("Missing document reference.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (isPayment) {
        // Approval progress and SAP posting history live on the Progress
        // screen, so this page fetches the document only.
        setReceipt(await paymentsService.getReceipt(id));
      } else {
        setDeposit(await paymentsService.getDeposit(id));
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 404
          ? "This entry no longer exists."
          : status === 403
            ? "You do not have permission to view this entry."
            : "Could not load this entry.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, isPayment]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={44} color={COLORS.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const status = isPayment ? receipt?.status : deposit?.status;
  const statusLabel =
    STATUS_LABEL[status ?? ""] ??
    (isPayment ? receipt?.status_display : deposit?.status_display);
  const tone = STATUS_TONE[status ?? ""] ?? { bg: "#F3F4F6", fg: "#6B7280" };
  const docNo = isPayment ? receipt?.receipt_no : deposit?.deposit_no;
  const total = isPayment ? receipt?.total_amount : deposit?.deposit_amount;
  const approval = isPayment ? receipt?.approval : deposit?.approval;



  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <Text style={styles.heroDoc} numberOfLines={1}>
            {docNo}
          </Text>
          <View style={[styles.heroPill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.heroPillText, { color: tone.fg }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.heroSub} numberOfLines={2}>
          {isPayment
            ? receipt?.card_name || receipt?.card_code
            : deposit?.bank_account_name || "Bank deposit"}
        </Text>
      </LinearGradient>

      {/* Info */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
          <Text style={styles.cardTitle}>
            {isPayment ? "Payment Info" : "Deposit Info"}
          </Text>
        </View>

        {isPayment && receipt ? (
          <>
            <InfoRow label="Party" value={receipt.card_name || receipt.card_code} />
            <InfoRow label="Party Code" value={receipt.card_code} />
            <InfoRow label="Company" value={receipt.company} />
            <InfoRow label="Payment Date" value={receipt.payment_date} />
            <InfoRow label="Created By" value={receipt.created_by_name || "—"} />
            <InfoRow label="Created On" value={formatDateTime(receipt.created_at)} />
            {!!receipt.remarks && <InfoRow label="Remarks" value={receipt.remarks} />}
          </>
        ) : deposit ? (
          <>
            <InfoRow label="Bank Account" value={deposit.bank_account_name || "—"} />
            <InfoRow label="Company" value={deposit.company} />
            <InfoRow label="Deposit Date" value={deposit.deposit_date} />
            <InfoRow label="Type" value={deposit.deposit_type} />
            <InfoRow label="Deposited By" value={deposit.deposited_by_name || "—"} />
            <InfoRow label="Created By" value={deposit.created_by_name || "—"} />
            <InfoRow label="Collected" value={formatMoney(deposit.collected_amount)} />
            {Number(deposit.shortfall) > 0 && (
              <>
                <InfoRow label="Shortfall" value={formatMoney(deposit.shortfall)} />
                <InfoRow label="Reason" value={deposit.shortfall_reason || "—"} />
              </>
            )}
            {!!deposit.remarks && <InfoRow label="Remarks" value={deposit.remarks} />}
          </>
        ) : null}
      </View>

      {/* Lines */}
      {isPayment && receipt && receipt.methods?.length ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>
              Payment Methods ({receipt.methods.length})
            </Text>
          </View>
          {receipt.methods.map((m) => (
            <View key={m.id} style={styles.lineRow}>
              <View style={styles.lineBadge}>
                <Text style={styles.lineBadgeText}>{m.method}</Text>
              </View>
              {/* The UTR is what a reconciler matches against the bank
                  statement, so it belongs on the line itself rather than
                  only on the approval screen. */}
              <View style={{ flex: 1, minWidth: 0 }}>
                {m.upi_reference ? (
                  <Text style={styles.lineSub} numberOfLines={1}>
                    UTR: {m.upi_reference}
                  </Text>
                ) : null}
                {m.cheque_number ? (
                  <Text style={styles.lineSub} numberOfLines={1}>
                    Cheque {m.cheque_number}
                    {m.bank_name ? ` · ${m.bank_name}` : ""}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.lineAmount}>{formatMoney(m.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isPayment && deposit && deposit.lines?.length ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="receipt-outline" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>
              Receipts Banked ({deposit.lines.length})
            </Text>
          </View>
          {deposit.lines.map((l) => (
            <View key={l.id} style={styles.lineRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lineTitle} numberOfLines={1}>
                  {l.receipt_no}
                </Text>
                <Text style={styles.lineSub} numberOfLines={1}>
                  {l.card_name}
                </Text>
              </View>
              <Text style={styles.lineAmount}>{formatMoney(l.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Grand total */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.totalBanner}
      >
        <View>
          <Text style={styles.totalBannerLabel}>Total Amount</Text>
          <Text style={styles.totalBannerSub}>
            {approval ? approval.level_label : "Not submitted"}
          </Text>
        </View>
        <Text style={styles.totalBannerValue}>{formatMoney(total ?? 0)}</Text>
      </LinearGradient>

      {/* OMS-generated SAP-style receipt — a POSTED payment only. */}
      {isPayment && receipt && receipt.status === "POSTED" &&
      receipt.sap_doc_entry != null ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setReceiptOpen(true)}
          style={styles.receiptBtn}
          accessibilityRole="button"
          accessibilityLabel="View payment receipt"
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.receiptBtnText}>View Payment Receipt</Text>
        </TouchableOpacity>
      ) : null}

      {isPayment && receipt ? (
        <ReceiptViewerModal
          visible={receiptOpen}
          receiptId={receipt.id}
          receiptNo={receipt.receipt_no}
          onClose={() => setReceiptOpen(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: sp(16), paddingBottom: sp(40) },
  receiptBtn: {
    marginTop: sp(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    backgroundColor: COLORS.primary,
    borderRadius: sp(12),
    paddingVertical: sp(13),
  },
  receiptBtnText: { color: "#fff", fontSize: fs(14), fontWeight: "700" },
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

  hero: {
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(10),
  },
  heroDoc: { flex: 1, color: "#fff", fontSize: fs(16), fontWeight: "800" },
  heroPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
  },
  heroPillText: { fontSize: fs(11), fontWeight: "700" },
  heroSub: {
    color: "rgba(255,255,255,0.9)",
    fontSize: fs(13),
    marginTop: sp(8),
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(12),
  },
  cardTitle: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },

  errorCard: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  errorBody: {
    fontSize: fs(13),
    lineHeight: fs(19),
    color: COLORS.error,
    fontWeight: "600",
  },
  errorHint: {
    fontSize: fs(11),
    lineHeight: fs(16),
    color: COLORS.textSecondary,
    marginTop: sp(10),
  },
  infoRow: { flexDirection: "row", paddingVertical: sp(7), gap: sp(12) },
  infoLabel: { width: "38%", fontSize: fs(13), color: COLORS.textSecondary },
  infoValue: {
    flex: 1,
    fontSize: fs(13),
    fontWeight: "600",
    color: COLORS.text,
  },

  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(10),
    paddingVertical: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lineBadge: {
    backgroundColor: "rgba(79,70,229,0.08)",
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 8,
  },
  lineBadgeText: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.primary,
  },
  lineTitle: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  lineSub: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },
  lineAmount: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },

  totalBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: sp(16),
    padding: sp(18),
    marginBottom: sp(14),
  },
  totalBannerLabel: { color: "#fff", fontSize: fs(15), fontWeight: "800" },
  totalBannerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fs(11),
    marginTop: 2,
  },
  totalBannerValue: { color: "#fff", fontSize: fs(20), fontWeight: "800" },

});
