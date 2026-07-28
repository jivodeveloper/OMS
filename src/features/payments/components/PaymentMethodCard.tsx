import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Surface } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import FormField from "./FormField";
import AttachmentPicker from "./AttachmentPicker";
import CashNoteBreakdown from "./CashNoteBreakdown";
import {
  formatAmount,
  methodMeta,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethodType,
} from "../constants";
import { validateCashBreakdown } from "../validation";
import type { AttachmentStub, CashNoteRow, PaymentMethodEntry } from "../types";

interface PaymentMethodCardProps {
  entry: PaymentMethodEntry;
  index: number;
  expanded: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PaymentMethodEntry>) => void;
  onRemove: () => void;
}

export default function PaymentMethodCard({
  entry,
  index,
  expanded,
  canRemove,
  onToggle,
  onChange,
  onRemove,
}: PaymentMethodCardProps) {
  const meta = methodMeta(entry.method);
  const amount = Number(entry.amount) || 0;
  const cashError = validateCashBreakdown(entry);
  // Cash is recorded through the note breakdown; UPI and Cheque carry proof
  // instead, so the attachment field belongs to those two only.
  const supportsAttachment = entry.method === "upi" || entry.method === "cheque";

  const addNoteRow = () => {
    const row: CashNoteRow = {
      id: `note-${entry.id}-${entry.noteRows.length + 1}-${Date.now()}`,
      denomination: null,
      quantity: "",
    };
    onChange({ noteRows: [...entry.noteRows, row] });
  };

  const changeNoteRow = (id: string, patch: Partial<CashNoteRow>) => {
    onChange({
      noteRows: entry.noteRows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  };

  const removeNoteRow = (id: string) => {
    onChange({ noteRows: entry.noteRows.filter((row) => row.id !== id) });
  };

  // Dummy attachment — a real document picker replaces this when the feature is
  // wired up, the surrounding UI stays the same.
  const addAttachment = () => {
    const file: AttachmentStub = {
      id: `file-${entry.id}-${entry.attachments.length + 1}-${Date.now()}`,
      name:
        entry.method === "cheque"
          ? `cheque-${entry.attachments.length + 1}.jpg`
          : `upi-screenshot-${entry.attachments.length + 1}.png`,
    };
    onChange({ attachments: [...entry.attachments, file] });
  };

  const removeAttachment = (id: string) => {
    onChange({ attachments: entry.attachments.filter((file) => file.id !== id) });
  };

  return (
    <Surface style={styles.card}>
      {/* ── Collapsed header: always visible, tap anywhere to expand ── */}
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.8}
        // An expanded card with an unbalanced breakdown stays open — collapsing
        // it would hide the error the user still has to fix.
        onPress={expanded && cashError ? undefined : onToggle}
        disabled={expanded && !!cashError}
        accessibilityRole="button"
        accessibilityLabel={`Payment method ${index + 1}, ${meta.label}`}
      >
        <View style={styles.methodIcon}>
          <Ionicons name={meta.icon as any} size={18} color={COLORS.primary} />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.headerIndex}>PAYMENT METHOD {index + 1}</Text>
          <Text style={styles.headerMethod}>{meta.label}</Text>
        </View>

        <View style={styles.headerRight}>
          {cashError ? (
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          ) : null}
          <Text style={amount > 0 ? styles.headerAmount : styles.headerAmountEmpty}>
            ₹{formatAmount(amount)}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.divider} />

          <View style={styles.field}>
            <Dropdown
              label="Payment Method"
              data={PAYMENT_METHOD_OPTIONS}
              value={entry.method}
              onChange={(value: PaymentMethodType) => onChange({ method: value })}
              placeholder="Select method..."
              searchable={false}
              leftIcon={meta.icon}
              iconColor={COLORS.textSecondary}
              required
            />
          </View>

          <FormField
            label="Amount"
            value={entry.amount}
            onChangeText={(text) =>
              onChange({ amount: text.replace(/[^0-9.]/g, "") })
            }
            placeholder="0"
            keyboardType="decimal-pad"
            prefix="₹"
            required
          />

          {/* Cash records denominations; UPI and Cheque record proof. */}
          {entry.method === "cash" ? (
            <CashNoteBreakdown
              rows={entry.noteRows}
              amount={amount}
              error={cashError}
              onAddRow={addNoteRow}
              onChangeRow={changeNoteRow}
              onRemoveRow={removeNoteRow}
            />
          ) : null}

          {supportsAttachment ? (
            <AttachmentPicker
              label={
                entry.method === "upi" ? "Upload Screenshot" : "Upload Cheque Image"
              }
              attachments={entry.attachments}
              onAdd={addAttachment}
              onRemove={removeAttachment}
            />
          ) : null}

          {/* Card footer — stays at the bottom of the expanded card. */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerRemoveBtn, !canRemove && styles.footerDisabled]}
              activeOpacity={0.8}
              disabled={!canRemove}
              onPress={onRemove}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={canRemove ? COLORS.error : COLORS.textMuted}
              />
              <Text
                style={[
                  styles.footerRemoveLabel,
                  !canRemove && styles.footerDisabledLabel,
                ]}
              >
                Remove Payment Method
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  headerIndex: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  headerMethod: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  headerAmountEmpty: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  body: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  field: {
    marginBottom: SPACING.sm,
  },
  footer: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  footerRemoveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    paddingVertical: SPACING.sm + 2,
  },
  footerRemoveLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.error,
  },
  footerDisabled: {
    backgroundColor: COLORS.inputBackground,
    borderColor: COLORS.border,
  },
  footerDisabledLabel: {
    color: COLORS.textMuted,
  },
});
