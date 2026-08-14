import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Checkbox } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { formatAmount } from "../_lib/constants";
import type { DepositablePayment } from "../_lib/depositData";

interface DepositPaymentRowProps {
  payment: DepositablePayment;
  selected: boolean;
  onToggle: () => void;
}

const METHOD_ICON: Record<string, string> = {
  Cash: "cash-outline",
  UPI: "phone-portrait-outline",
  Cheque: "document-text-outline",
};

export default function DepositPaymentRow({
  payment,
  selected,
  onToggle,
}: DepositPaymentRowProps) {
  // Already-deposited payments are shown for context but can't be re-deposited.
  const isDeposited = payment.status === "deposited";

  return (
    <TouchableOpacity
      style={[
        styles.card,
        selected && styles.cardSelected,
        isDeposited && styles.cardDisabled,
      ]}
      activeOpacity={0.8}
      disabled={isDeposited}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: isDeposited }}
    >
      <View style={styles.checkboxWrap}>
        <Checkbox.Android
          status={selected ? "checked" : "unchecked"}
          onPress={isDeposited ? undefined : onToggle}
          disabled={isDeposited}
          color={COLORS.primary}
          uncheckedColor={COLORS.textMuted}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.party} numberOfLines={1}>
            {payment.party}
          </Text>
          <Text style={styles.amount}>₹{formatAmount(payment.amount)}</Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="receipt-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{payment.invoice}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{payment.date}</Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.methodPill}>
            <Ionicons
              name={(METHOD_ICON[payment.method] ?? "cash-outline") as any}
              size={12}
              color={COLORS.primary}
            />
            <Text style={styles.methodText}>{payment.method}</Text>
          </View>

          <View style={[styles.badge, isDeposited ? styles.badgeDone : styles.badgePending]}>
            <Text
              style={[
                styles.badgeText,
                isDeposited ? styles.badgeTextDone : styles.badgeTextPending,
              ]}
            >
              {isDeposited ? "Already Deposited" : "Pending Deposit"}
            </Text>
          </View>
        </View>

        {/* Cheque identity, so the employee can match the row to the physical
            cheque before banking it. Cash rows have nothing to verify. */}
        {payment.chequeDetail ? (
          <Text style={styles.chequeDetail} numberOfLines={1}>
            {payment.chequeDetail}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingRight: SPACING.sm + 2,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  checkboxWrap: {
    marginTop: -2,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  party: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  chequeDetail: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
  },
  metaDot: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginHorizontal: 2,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginTop: 3,
  },
  methodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
  },
  methodText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },
  badge: {
    borderRadius: RADIUS.full,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
  },
  badgePending: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warning,
  },
  badgeDone: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  badgeTextPending: {
    color: COLORS.warning,
  },
  badgeTextDone: {
    color: COLORS.success,
  },
});
