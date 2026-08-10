import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";

interface Props {
  /** Human-facing invoice number, e.g. "INV-625021392". */
  invoiceNo: string;
  /** What the invoice is worth — its outstanding balance when selected. */
  invoiceAmount: number;
  /** What this payment covers. */
  receivedAmount: number;
}

const money = (value: number) =>
  `₹${(Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Invoice against payment, so the person can see what is still owed.
 *
 * Used on BOTH the create/edit form and the read-only detail screen — one
 * component so the figures and the wording cannot diverge between the moment a
 * payment is raised and the moment it is approved.
 *
 * The status chips are derived, never stored: they are just a comparison of the
 * two amounts, and computing them here means they can never disagree with the
 * numbers printed beside them.
 */
export default function InvoiceSummaryCard({
  invoiceNo,
  invoiceAmount,
  receivedAmount,
}: Props) {
  const remaining = invoiceAmount - receivedAmount;

  // Three outcomes, each meaning something different to an approver:
  //   under  -> a part payment; the invoice stays open for the rest
  //   exact  -> settles the invoice
  //   over   -> more than is owed. SAP refuses this, so it is flagged as an
  //             error rather than a neutral state.
  const isOver = remaining < -0.005;
  const isExact = Math.abs(remaining) <= 0.005;
  // Nothing entered yet is its own state — "Part payment" would imply money
  // had actually been taken.
  const isNone = receivedAmount <= 0.005;

  const receivedTone = isOver
    ? { bg: COLORS.errorLight, fg: COLORS.error, label: "Exceeds invoice" }
    : isExact
      ? { bg: COLORS.successLight, fg: COLORS.success, label: "Accepted" }
      : isNone
        ? { bg: COLORS.errorLight, fg: COLORS.error, label: "Not Received" }
        : { bg: COLORS.warningLight, fg: COLORS.warning, label: "Part payment" };

  const remainingTone = isOver
    ? { bg: COLORS.errorLight, fg: COLORS.error, label: "Over-applied" }
    : isExact
      ? { bg: COLORS.successLight, fg: COLORS.success, label: "Settled" }
      : { bg: COLORS.warningLight, fg: COLORS.warning, label: "Pending" };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="document-text" size={ms(16)} color={COLORS.primary} />
        <Text style={styles.title}>Invoice Summary</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Invoice Amount</Text>
          <Text style={styles.invoiceAmount}>{money(invoiceAmount)}</Text>
          {!!invoiceNo && <Text style={styles.invoiceNo}>{invoiceNo}</Text>}
        </View>

        <View style={styles.divider} />

        <View style={styles.col}>
          <Text style={styles.label}>Received Amount</Text>
          <Text style={styles.receivedAmount}>{money(receivedAmount)}</Text>
          <View style={[styles.chip, { backgroundColor: receivedTone.bg }]}>
            <Text style={[styles.chipText, { color: receivedTone.fg }]}>
              {receivedTone.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Only when something is actually outstanding. A settled invoice has no
          remaining balance to state, and printing "₹0.00 Settled" under two
          identical figures is noise — the "Accepted" chip already says it. */}
      {!isExact ? (
        <View style={styles.footer}>
          <Text style={styles.label}>
            {isOver ? "Over-applied by" : "Remaining Balance"}
          </Text>
          <Text
            style={[
              styles.remaining,
              { color: isOver ? COLORS.error : COLORS.warning },
            ]}
          >
            {money(Math.abs(remaining))}
          </Text>
          <View style={[styles.chip, { backgroundColor: remainingTone.bg }]}>
            <Text style={[styles.chipText, { color: remainingTone.fg }]}>
              {remainingTone.label}
            </Text>
          </View>
        </View>
      ) : null}

      {isOver ? (
        <Text style={styles.warning}>
          This is more than the invoice owes. SAP will reject the posting —
          reduce the amount to {money(invoiceAmount)} or less.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(14),
    padding: sp(14),
    marginBottom: sp(12),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(7),
    marginBottom: sp(12),
  },
  title: {
    fontSize: fs(14),
    fontWeight: "700",
    color: COLORS.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(12),
  },
  label: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: sp(3),
  },
  invoiceAmount: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.primary,
  },
  invoiceNo: {
    fontSize: fs(11),
    color: COLORS.textMuted,
    marginTop: sp(2),
  },
  receivedAmount: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.success,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    marginTop: sp(5),
  },
  chipText: {
    fontSize: fs(10),
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    marginTop: sp(12),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  remaining: {
    fontSize: fs(18),
    fontWeight: "800",
  },
  warning: {
    fontSize: fs(11),
    lineHeight: fs(16),
    color: COLORS.error,
    marginTop: sp(10),
    textAlign: "center",
  },
});
