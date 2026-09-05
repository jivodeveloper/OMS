import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";

interface VerifySuccessDialogProps {
  visible: boolean;
  receiptNo: string;
  amount: string;
  /** Display-ready stamp, e.g. "05 Sep 2026". */
  date: string;
  time: string;
  onDone: () => void;
}

/**
 * Terminal dialog of the verification flow — Done returns to the list.
 *
 * Verification used to end in a toast that vanished while the screen was
 * already navigating away, so the one person who had just taken
 * responsibility for counting the money got the least confirmation of any
 * action in the app. Approving shows a dialog and waits for Done; verifying
 * now does the same.
 *
 * Its own component rather than a third `decision` on ApprovalSuccessDialog:
 * that dialog is typed to ApprovalDecision ("approve" | "reject") and every
 * line of its copy is about a request moving through an approval chain.
 * Verification is a different act by a different person — it attests that
 * physical cash or a cheque matched what was typed — so it gets its own
 * wording and says what happens NEXT, which is the question a verifier
 * actually has.
 *
 * Navigation is deliberately NOT on a timer. The verifier decides when they
 * have read it; nothing here is undoable, so there is no reason to rush them.
 */
export default function VerifySuccessDialog({
  visible,
  receiptNo,
  amount,
  date,
  time,
  onDone,
}: VerifySuccessDialogProps) {
  return (
    <DialogShell visible={visible} onRequestClose={onDone}>
      <DialogHeader
        icon="shield-checkmark"
        accent={COLORS.success}
        title="Payment Verified!"
        subtitle="The handover is recorded. This payment has moved on for approval."
        onClose={onDone}
        animateIcon
      />

      <View style={styles.infoCard}>
        <Ionicons
          name="receipt-outline"
          size={fs(18)}
          color={COLORS.primary}
        />
        <View style={styles.infoText}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Receipt</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {receiptNo}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Amount</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {amount}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Verified On</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {date} · {time}
            </Text>
          </View>
        </View>
      </View>

      <DialogFooter
        confirmLabel="Done"
        onConfirm={onDone}
        accent={COLORS.success}
      />
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
});
