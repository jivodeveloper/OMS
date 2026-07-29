import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Surface, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
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
} from "../_lib/constants";
import { validateCashBreakdown } from "../_lib/validation";
import type { AttachmentStub, CashNoteRow, PaymentMethodEntry } from "../_lib/types";

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
  const [showDatePicker, setShowDatePicker] = React.useState(false);
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
    // Adding a row while the section is closed would hide the row just created.
    onChange({ noteRows: [...entry.noteRows, row], notesExpanded: true });
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
        // An expanded card whose denominations don't balance stays open —
        // collapsing it would hide the error the user still has to fix.
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
            placeholder="Enter Amount"
            keyboardType="decimal-pad"
            prefix="₹"
            required
          />

          {/* ── Cash ── */}
          {entry.method === "cash" ? (
            <CashNoteBreakdown
              rows={entry.noteRows}
              amount={amount}
              error={cashError}
              expanded={entry.notesExpanded}
              onToggle={() => onChange({ notesExpanded: !entry.notesExpanded })}
              onAddRow={addNoteRow}
              onChangeRow={changeNoteRow}
              onRemoveRow={removeNoteRow}
            />
          ) : null}

          {/* UPI carries no reference field — the screenshot is the record. */}

          {/* ── Cheque ── */}
          {entry.method === "cheque" ? (
            <>
              <FormField
                label="Cheque Number"
                value={entry.chequeNumber}
                onChangeText={(text) =>
                  onChange({ chequeNumber: text.replace(/[^0-9]/g, "") })
                }
                placeholder="Enter cheque number"
                keyboardType="number-pad"
                leftIcon="numeric"
              />

              <FormField
                label="Bank Name"
                value={entry.bankName}
                onChangeText={(text) => onChange({ bankName: text })}
                placeholder="Enter bank name"
                leftIcon="bank-outline"
              />

              {/* Cheque Date — web uses a native date input, native uses the
                  picker (same split as the Create Order delivery date). */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Cheque Date</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.webDateWrapper}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={COLORS.primary}
                    />
                    {/* @ts-ignore — 'input' is valid on web */}
                    <input
                      type="date"
                      value={entry.chequeDate}
                      onChange={(event: any) =>
                        onChange({ chequeDate: event.target.value })
                      }
                      style={{
                        border: "none",
                        outline: "none",
                        fontSize: 14,
                        color: COLORS.black,
                        background: "transparent",
                        width: "100%",
                        marginLeft: 10,
                        cursor: "pointer",
                      }}
                    />
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <TextInput
                        value={entry.chequeDate}
                        mode="outlined"
                        placeholder="Select date"
                        editable={false}
                        pointerEvents="none"
                        textColor={COLORS.black}
                        style={styles.input}
                        outlineStyle={styles.inputOutline}
                        outlineColor={COLORS.border}
                        activeOutlineColor={COLORS.primary}
                        left={
                          <TextInput.Icon
                            icon="calendar-outline"
                            color={COLORS.primary}
                          />
                        }
                      />
                    </TouchableOpacity>

                    {showDatePicker ? (
                      <DateTimePicker
                        value={
                          entry.chequeDate ? new Date(entry.chequeDate) : new Date()
                        }
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(_event, selectedDate) => {
                          setShowDatePicker(false);
                          if (selectedDate) {
                            onChange({
                              chequeDate: selectedDate.toISOString().split("T")[0],
                            });
                          }
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </>
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

          {/* ── Card actions: pinned to the bottom of the expanded card ── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.removeBtn, !canRemove && styles.actionDisabled]}
              activeOpacity={0.8}
              disabled={!canRemove}
              onPress={onRemove}
            >
              <Ionicons
                name="trash-outline"
                size={15}
                color={canRemove ? COLORS.error : COLORS.textMuted}
              />
              <Text
                style={[
                  styles.removeLabel,
                  !canRemove && styles.actionLabelDisabled,
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
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  webDateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 56,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  removeBtn: {
    flex: 1,
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
  removeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.error,
  },
  actionDisabled: {
    backgroundColor: COLORS.inputBackground,
    borderColor: COLORS.border,
  },
  actionLabelDisabled: {
    color: COLORS.textMuted,
  },
});
