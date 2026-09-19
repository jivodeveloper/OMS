import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, RADIUS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { depositTenders } from "@/src/features/payments/depositTenders";
import type { BankDeposit } from "@/src/services/payments.service";

/**
 * Where each tender in this deposit is recorded in SAP.
 *
 * THE QUESTION THIS ANSWERS. A mixed deposit is one document to the person
 * banking it and two accounting events underneath: the CASH is posted by the
 * deposit, and the CHEQUES were already posted by their own receipts. Without
 * this, an approver sees a deposit for the full amount and a SAP card quoting
 * one document number that covers only part of it — and nothing at all about
 * where the rest went.
 *
 * Shown only once the deposit has settled, beneath the SAP card, and only when
 * there are cheques to account for. A cash-only deposit is already fully
 * described by the SAP card above it, and repeating the same number under a
 * second heading would suggest two postings where there was one.
 */

const money = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2,
                                      maximumFractionDigits: 2 })}`;

const shortDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

interface Props {
  deposit: BankDeposit;
  style?: StyleProp<ViewStyle>;
}

export default function TenderRecordCard({ deposit, style }: Props) {
  const tenders = depositTenders(deposit);

  // Nothing to explain: no cheques means the SAP card above already accounts
  // for every rupee in this deposit.
  if (tenders.cheques.length === 0) return null;

  // Before it settles, "where is it recorded" has no answer yet. The approval
  // screens already say what is in the deposit.
  const settled = deposit.status === "POSTED";
  if (!settled) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Ionicons name="file-tray-full-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.title}>WHERE THIS IS RECORDED</Text>
      </View>

      <Text style={styles.lede}>
        {tenders.isChequeOnly
          ? "The cheques in this deposit reached the bank when their own receipts posted, so this deposit creates no new SAP document."
          : "This deposit posts its cash to SAP. The cheques were already there — each reached the bank when its own receipt posted."}
      </Text>

      {/* ── Cash: this deposit's own SAP document ─────────────────────── */}
      {tenders.cashTotal > 0 ? (
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Ionicons name="cash-outline" size={15} color={COLORS.success} />
            <Text style={styles.blockTitle}>Cash</Text>
            <Text style={styles.blockAmount}>{money(tenders.cashTotal)}</Text>
          </View>
          <Text style={styles.detail}>
            Posted by this deposit
            {deposit.sap_doc_num ? ` · SAP DocNum ${deposit.sap_doc_num}` : ""}
          </Text>
          {/* The amount above is what was BANKED, which is what SAP holds. If
              it is less than what was collected, say so here rather than let
              an approver reconcile it against the receipts themselves and
              conclude the posting is wrong. */}
          {tenders.cashShortfall > 0 ? (
            <Text style={styles.detail}>
              {money(tenders.cashShortfall)} of the cash collected was not
              banked
              {deposit.shortfall_reason
                ? ` — ${deposit.shortfall_reason}`
                : ""}
            </Text>
          ) : null}
          {deposit.source_gl_account ? (
            <Text style={styles.detail}>
              From cash account {deposit.source_gl_account}
              {deposit.bank_account_name ? ` → ${deposit.bank_account_name}` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Cheques: recorded under their own receipts ────────────────── */}
      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
          <Text style={styles.blockTitle}>
            {tenders.cheques.length === 1 ? "Cheque" : `Cheques (${tenders.cheques.length})`}
          </Text>
          <Text style={styles.blockAmount}>{money(tenders.chequeTotal)}</Text>
        </View>
        <Text style={styles.detail}>
          Already in SAP — recorded when each receipt posted, not by this
          deposit.
        </Text>

        {tenders.cheques.map((cheque, index) => (
          <View
            key={`${cheque.receiptNo}-${cheque.chequeNumber}-${index}`}
            style={styles.chequeRow}
          >
            <View style={styles.chequeMain}>
              <Text style={styles.chequeNo}>
                {cheque.chequeNumber ? `CHQ ${cheque.chequeNumber}` : "Cheque"}
                {cheque.payerBank ? ` · ${cheque.payerBank}` : ""}
              </Text>
              <Text style={styles.chequeMeta}>
                {cheque.receiptNo}
                {cheque.sapDocNum
                  ? ` · SAP DocNum ${cheque.sapDocNum}`
                  : " · not yet posted"}
                {cheque.postedAt ? ` · ${shortDate(cheque.postedAt)}` : ""}
              </Text>
            </View>
            <Text style={styles.chequeAmount}>{money(cheque.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: sp(14),
    gap: sp(10),
  },
  header: { flexDirection: "row", alignItems: "center", gap: sp(6) },
  title: {
    fontSize: fs(11),
    fontWeight: "700",
    letterSpacing: 0.6,
    color: COLORS.textSecondary,
  },
  lede: { fontSize: fs(12.5), lineHeight: ms(18), color: COLORS.textSecondary },
  block: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: sp(10),
    gap: sp(4),
  },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: sp(6) },
  blockTitle: { flex: 1, fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  blockAmount: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  detail: { fontSize: fs(12), lineHeight: ms(17), color: COLORS.textSecondary },
  chequeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    paddingTop: sp(8),
    marginTop: sp(4),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  chequeMain: { flex: 1, gap: sp(2) },
  chequeNo: { fontSize: fs(12.5), fontWeight: "600", color: COLORS.text },
  chequeMeta: { fontSize: fs(11.5), color: COLORS.textMuted },
  chequeAmount: { fontSize: fs(12.5), fontWeight: "600", color: COLORS.text },
});
