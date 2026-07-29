import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import { formatAmount, NOTE_DENOMINATIONS } from "../_lib/constants";
import { noteRowsTotal, type CashBreakdownError } from "../_lib/validation";
import type { CashNoteRow } from "../_lib/types";

interface CashNoteBreakdownProps {
  rows: CashNoteRow[];
  /** The card's entered amount, so the section can show what it must match. */
  amount: number;
  error: CashBreakdownError | null;
  expanded: boolean;
  onToggle: () => void;
  onAddRow: () => void;
  onChangeRow: (id: string, patch: Partial<CashNoteRow>) => void;
  onRemoveRow: (id: string) => void;
}

/** Collapsible "Denominations" section inside a Cash card. */
export default function CashNoteBreakdown({
  rows,
  amount,
  error,
  expanded,
  onToggle,
  onAddRow,
  onChangeRow,
  onRemoveRow,
}: CashNoteBreakdownProps) {
  const total = noteRowsTotal(rows);
  const balanced = amount > 0 && rows.length > 0 && total === amount;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.8}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="Denominations"
      >
        <Ionicons name="albums-outline" size={16} color={COLORS.primary} />
        <Text style={styles.headerLabel}>Denominations</Text>
        {rows.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{rows.length}</Text>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
        {error ? (
          <Ionicons name="alert-circle" size={15} color={COLORS.error} />
        ) : balanced ? (
          <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
        ) : null}
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>
              No denominations added. Use “Add” to record notes.
            </Text>
          ) : (
            <View style={styles.columnHeader}>
              <Text style={[styles.columnLabel, styles.noteCol]}>Note</Text>
              <Text style={[styles.columnLabel, styles.qtyCol]}>Quantity</Text>
              <View style={styles.deleteSpacer} />
            </View>
          )}

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
                  // Modal mode floats the options over the card instead of
                  // expanding inline and pushing the rows below it down.
                  mode="modal"
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
                accessibilityLabel="Remove denomination row"
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={onAddRow}
          >
            <Ionicons name="add" size={16} color={COLORS.primary} />
            <Text style={styles.addBtnLabel}>Add</Text>
          </TouchableOpacity>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Cash Amount</Text>
            <Text
              style={[
                styles.totalValue,
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

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={COLORS.error} />
              <Text style={styles.errorText}>{error.message}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.inputBackground,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm + 2,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  headerSpacer: {
    flex: 1,
  },
  countPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },
  body: {
    paddingHorizontal: SPACING.sm + 2,
    paddingBottom: SPACING.sm + 2,
  },
  empty: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
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
  deleteSpacer: {
    width: 40,
  },
  qtyInput: {
    backgroundColor: COLORS.surface,
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
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm + 2,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  totalValue: {
    fontSize: 14,
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
    fontSize: 12,
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
});
