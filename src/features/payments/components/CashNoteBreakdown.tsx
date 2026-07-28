import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import { formatAmount, NOTE_DENOMINATIONS } from "../constants";
import { noteRowsTotal, type CashBreakdownError } from "../validation";
import type { CashNoteRow } from "../types";

interface CashNoteBreakdownProps {
  rows: CashNoteRow[];
  /** The card's entered amount, so the breakdown can show what it must match. */
  amount: number;
  error: CashBreakdownError | null;
  onAddRow: () => void;
  onChangeRow: (id: string, patch: Partial<CashNoteRow>) => void;
  onRemoveRow: (id: string) => void;
}

export default function CashNoteBreakdown({
  rows,
  amount,
  error,
  onAddRow,
  onChangeRow,
  onRemoveRow,
}: CashNoteBreakdownProps) {
  // Running total of the denominations entered so far — lets the user sanity-check
  // the breakdown against the amount without leaving the card.
  const total = noteRowsTotal(rows);
  const balanced = amount > 0 && rows.length > 0 && total === amount;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>Cash Note Breakdown</Text>
        {total > 0 ? (
          <View style={styles.totalWrap}>
            {balanced ? (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={COLORS.success}
              />
            ) : null}
            <Text
              style={[
                styles.total,
                error ? styles.totalError : null,
                balanced ? styles.totalOk : null,
              ]}
            >
              ₹{formatAmount(total)}
              {amount > 0 ? (
                <Text style={styles.totalTarget}> / ₹{formatAmount(amount)}</Text>
              ) : null}
            </Text>
          </View>
        ) : null}
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>
          No notes added. Use “Add Note” to record denominations.
        </Text>
      ) : null}

      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.noteCol}>
            <Dropdown
              label=""
              data={NOTE_DENOMINATIONS}
              value={row.denomination}
              onChange={(value) => onChangeRow(row.id, { denomination: value })}
              placeholder="Note"
              searchable={false}
              iconColor={COLORS.textSecondary}
              noBottomSpacing
            />
          </View>

          <View style={styles.qtyCol}>
            <TextInput
              value={row.quantity}
              onChangeText={(text) =>
                onChangeRow(row.id, { quantity: text.replace(/[^0-9]/g, "") })
              }
              mode="outlined"
              placeholder="Qty"
              keyboardType="number-pad"
              textColor={COLORS.black}
              style={styles.qtyInput}
              outlineStyle={styles.qtyOutline}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          </View>

          <TouchableOpacity
            style={styles.deleteBtn}
            activeOpacity={0.8}
            onPress={() => onRemoveRow(row.id)}
            accessibilityLabel="Remove note row"
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={onAddRow}>
        <Ionicons name="add" size={16} color={COLORS.primary} />
        <Text style={styles.addBtnLabel}>Add Note</Text>
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={15} color={COLORS.error} />
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  totalWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  total: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  totalError: {
    color: COLORS.error,
  },
  totalOk: {
    color: COLORS.success,
  },
  totalTarget: {
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: COLORS.error,
  },
  empty: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  noteCol: {
    // Slightly narrower than the qty column so "₹500" and a 3-digit qty both fit
    // comfortably on a 360pt-wide screen.
    flex: 1.1,
  },
  qtyCol: {
    flex: 1,
  },
  qtyInput: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
    height: 56,
  },
  qtyOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  addBtnLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
});
