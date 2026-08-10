import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";

/** What just happened to the receipt — decides the wording and the accent. */
export type PaymentSuccessKind = "created" | "resubmitted" | "updated";

interface Props {
  visible: boolean;
  kind: PaymentSuccessKind;
  /** The document number, e.g. "RCP-OIL-20260805-000003". */
  receiptNo: string;
  /** Labels the number. "Receipt No" for a payment, "Deposit No" otherwise. */
  numberLabel?: string;
  /** Overrides the title, so a deposit does not announce itself as a payment. */
  title?: string;
  /** Display-ready stamp, e.g. "05 Aug 2026". */
  date: string;
  time: string;
  /** Set when some attachments failed; shown as a caveat, not a failure. */
  note?: string;
  onDone: () => void;
}

const COPY: Record<
  PaymentSuccessKind,
  { title: string; subtitle: string; stamp: string }
> = {
  created: {
    title: "Payment Created!",
    subtitle: "The entry has been created and sent to the approver.",
    stamp: "Created On",
  },
  resubmitted: {
    title: "Payment Resubmitted!",
    subtitle: "The entry has been updated and sent back for approval.",
    stamp: "Resubmitted On",
  },
  // An approver correcting an entry parked at their own rung: nothing moved,
  // so promising it was "sent" would be a lie.
  updated: {
    title: "Changes Saved!",
    subtitle: "The entry has been updated. It is still with you for approval.",
    stamp: "Updated On",
  },
};

/**
 * Terminal dialog of the create/edit flow.
 *
 * Deliberately the same shell, header and footer as ApprovalSuccessDialog — a
 * payment being raised and a payment being approved are two ends of one journey,
 * so they should not look like they came from different apps.
 *
 * `onDone` is what actually navigates; this component never routes itself, so
 * the caller decides where the flow lands.
 */
export default function PaymentSuccessDialog({
  visible,
  kind,
  receiptNo,
  numberLabel = "Receipt No",
  title,
  date,
  time,
  note,
  onDone,
}: Props) {
  const copy = COPY[kind];
  // "Updated" is a save, not a submission — blue reads as informational where
  // green would overclaim that the entry has moved on.
  const accent = kind === "updated" ? COLORS.primary : COLORS.success;

  return (
    <DialogShell visible={visible} onRequestClose={onDone}>
      <DialogHeader
        icon={kind === "updated" ? "save" : "checkmark-circle"}
        accent={accent}
        title={title ?? copy.title}
        subtitle={copy.subtitle}
        onClose={onDone}
        animateIcon
      />

      <View style={styles.infoCard}>
        <Ionicons
          name="receipt-outline"
          size={ms(18)}
          color={COLORS.primary}
        />
        <View style={styles.infoText}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{numberLabel}</Text>
            <Text style={styles.infoValue}>{receiptNo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{copy.stamp}</Text>
            <Text style={styles.infoValue}>
              {date} · {time}
            </Text>
          </View>
        </View>
      </View>

      {/* Attachments that did not upload. The payment itself is safe, so this
          is a caveat under the confirmation rather than an error dialog. */}
      {note ? (
        <View style={styles.noteBox}>
          <Ionicons
            name="alert-circle-outline"
            size={ms(15)}
            color={COLORS.warning}
          />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}

      <DialogFooter confirmLabel="Done" onConfirm={onDone} accent={accent} />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    flexDirection: "row",
    gap: sp(10),
    marginTop: sp(18),
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(12),
    padding: sp(12),
  },
  infoText: {
    flex: 1,
    gap: sp(6),
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(10),
  },
  infoLabel: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
  },
  infoValue: {
    flexShrink: 1,
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    marginTop: sp(10),
    backgroundColor: COLORS.warningLight,
    borderRadius: sp(10),
    padding: sp(10),
  },
  noteText: {
    flex: 1,
    fontSize: fs(11),
    lineHeight: fs(16),
    color: COLORS.text,
  },
});
