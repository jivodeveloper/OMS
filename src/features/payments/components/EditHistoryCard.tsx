import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { StatusHistoryRow } from "@/src/services/payments.service";

interface EditHistoryCardProps {
  /** The full timeline; this card picks the edits out of it. */
  history: StatusHistoryRow[];
  /**
   * Outer spacing, supplied by the screen.
   *
   * The two screens inset their cards differently — the deposit page gives
   * each card its own `marginHorizontal`, while the approval page wraps them
   * in a padded container. A fixed margin here would be right on one and
   * doubled on the other, so the gutter is the caller's decision.
   */
  style?: StyleProp<ViewStyle>;
}

/** Field keys as stored, mapped to what a person calls them. */
const FIELD_LABELS: Record<string, string> = {
  // Receipt
  amount: "Amount",
  payment_date: "Payment date",
  is_advance: "Advance payment",
  remarks: "Remarks",
  received_from: "Received from",
  payment_method: "Payment method",
  upi_reference: "UPI reference",
  cheque_number: "Cheque number",
  cheque_bank: "Cheque bank",
  cheque_date: "Cheque date",
  allocations: "Invoices applied",
  // Deposit
  deposit_date: "Deposit date",
  deposit_amount: "Deposit amount",
  collected_amount: "Collected amount",
  bank: "Bank",
  slip_number: "Slip number",
  shortfall_reason: "Shortfall reason",
  deposited_by: "Deposited by",
  receipts: "Receipts banked",
  attachments: "Attachments",
};

const labelFor = (key: string) =>
  FIELD_LABELS[key] ??
  // An unmapped key is still shown, tidied up, rather than hidden: a field
  // added to the backend must never make an edit silently invisible here.
  key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Render a stored value for reading — never as raw JSON.
 *
 * Values arrive as strings, booleans, or arrays (attachment type names,
 * receipt numbers, allocation objects). Objects are turned into
 * "Label: value" pairs so nothing ever reaches the screen looking like a
 * serialized payload.
 */
const displayValue = (value: unknown): string => {
  // "None", not a dash: an empty list is a real state — no attachments yet,
  // no invoices applied — and reads as one.
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const row = entry as Record<string, unknown>;
          // Allocations arrive as { invoice, amount } — named, so the line
          // reads "901 · 400.00" rather than as an object dump.
          if ("invoice" in row) {
            return `${row.invoice}${row.amount ? ` · ${row.amount}` : ""}`;
          }
          return Object.entries(row)
            .map(([k, v]) => `${labelFor(k)}: ${String(v)}`)
            .join(" · ");
        }
        return String(entry);
      })
      // Numbered once there is more than one, so two identical labels
      // ("Cheque image", "Cheque image") stay countable.
      .map((line, i, all) => (all.length > 1 ? `${i + 1}. ${line}` : line))
      .join("\n");
  }
  return String(value);
};

const formatWhen = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

/**
 * What changed after this entry was created, who changed it, and when.
 *
 * An approver signing off a corrected entry could previously see only that it
 * had been edited — the timeline said "Receipt edited." and stopped there. The
 * figures in front of them might not be the figures someone else had already
 * looked at, and nothing on the page said which ones had moved.
 *
 * Each edit is its own collapsed row, newest first, opening to a before/after
 * list. Collapsed by default because the CURRENT values are what the approver
 * is deciding on; the history is there to be checked, not to be waded through.
 *
 * Renders nothing when an entry has never been edited, which is most of them —
 * an "Edit History (0)" panel on every unedited document is noise.
 */
export default function EditHistoryCard({
  history,
  style,
}: EditHistoryCardProps) {
  const [openId, setOpenId] = useState<number | null>(null);

  // Newest first: the most recent change is the one an approver checks.
  const edits = history
    .filter((row) => row.action === "UPDATED")
    .slice()
    .reverse();

  if (edits.length === 0) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <View style={styles.headerIcon}>
          <Ionicons name="create-outline" size={ms(16)} color={COLORS.warning} />
        </View>
        <Text style={styles.cardTitle}>Edit History</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{edits.length}</Text>
        </View>
      </View>

      <Text style={styles.lead}>
        {edits.length === 1
          ? "This entry was edited after it was created."
          : `This entry was edited ${edits.length} times after it was created.`}
      </Text>

      {edits.map((edit) => {
        const open = openId === edit.id;
        const changes = Object.entries(edit.change_data || {});
        const who = edit.performed_by_name || edit.changed_by_username || "System";

        return (
          <View key={edit.id} style={styles.editBlock}>
            <Pressable
              onPress={() => setOpenId(open ? null : edit.id)}
              style={({ pressed }) => [
                styles.editHeader,
                pressed ? styles.editHeaderPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Edit by ${who}, ${changes.length} field${
                changes.length === 1 ? "" : "s"
              } changed`}
            >
              <View style={styles.editHeaderText}>
                {/* Full name first — an approver knows colleagues by name, not
                    by the username stored on the audit row. */}
                <Text style={styles.editWho}>{who}</Text>
                <Text style={styles.editWhen}>
                  {formatWhen(edit.created_at)}
                  {changes.length
                    ? ` · ${changes.length} field${
                        changes.length === 1 ? "" : "s"
                      }`
                    : ""}
                </Text>
              </View>
              <Ionicons
                name={open ? "chevron-up" : "chevron-down"}
                size={ms(16)}
                color={COLORS.textSecondary}
              />
            </Pressable>

            {open ? (
              <View style={styles.editBody}>
                {changes.length === 0 ? (
                  // An UPDATED row with no diff predates change tracking, or
                  // recorded an edit that touched nothing tracked. Saying so
                  // is better than an empty panel that looks broken.
                  <Text style={styles.noDetail}>
                    {edit.reason || "No field-level detail was recorded."}
                  </Text>
                ) : (
                  changes.map(([field, change]) => (
                    <View key={field} style={styles.changeRow}>
                      <Text style={styles.fieldName}>{labelFor(field)}</Text>
                      <View style={styles.valueRow}>
                        <Text style={styles.oldValue}>
                          {displayValue(change.old)}
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={ms(12)}
                          color={COLORS.textSecondary}
                          style={styles.arrow}
                        />
                        <Text style={styles.newValue}>
                          {displayValue(change.new)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Radius, padding and border match the sibling cards on both screens. The
  // horizontal gutter is NOT set here — see the `style` prop.
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: sp(16),
    marginBottom: sp(14),
    gap: sp(8),
    // Same lift as every sibling card. Without it this one read as a flat
    // panel dropped into a stack of raised ones.
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
  },
  headerIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warningLight,
  },
  cardTitle: {
    flex: 1,
    fontSize: fs(14),
    fontWeight: "800",
    color: COLORS.text,
  },
  countPill: {
    minWidth: ms(22),
    paddingHorizontal: sp(7),
    paddingVertical: sp(2),
    borderRadius: sp(10),
    backgroundColor: COLORS.warningLight,
    alignItems: "center",
  },
  countText: {
    fontSize: fs(11),
    fontWeight: "800",
    color: COLORS.warning,
  },
  lead: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
  },
  editBlock: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(10),
    overflow: "hidden",
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    paddingHorizontal: sp(11),
    paddingVertical: sp(9),
    backgroundColor: COLORS.inputBackground,
  },
  editHeaderPressed: {
    opacity: 0.7,
  },
  editHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: sp(1),
  },
  editWho: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
  },
  editWhen: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
  },
  editBody: {
    paddingHorizontal: sp(11),
    paddingVertical: sp(10),
    gap: sp(10),
  },
  noDetail: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  changeRow: {
    gap: sp(3),
  },
  fieldName: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(6),
  },
  // Struck through, so "what it was" is unmistakable at a glance rather than
  // depending on the reader tracking left-to-right order.
  //
  // `minWidth: 0` alongside the shrink: without it a long value — an
  // attachment list, a remark — refuses to wrap and pushes the arrow and the
  // new value off the card. flexShrink alone does not do this in RN.
  oldValue: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: fs(13),
    lineHeight: fs(18),
    color: COLORS.textSecondary,
    textDecorationLine: "line-through",
  },
  arrow: {
    marginTop: sp(3),
  },
  newValue: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: fs(13),
    lineHeight: fs(18),
    fontWeight: "700",
    color: COLORS.text,
  },
});
