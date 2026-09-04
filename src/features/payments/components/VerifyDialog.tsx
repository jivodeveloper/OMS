import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import RemarksInput from "@/src/features/approval/components/dialogs/RemarksInput";

interface VerifyDialogProps {
  visible: boolean;
  receiptNo: string;
  amount: string;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}

/**
 * Verification confirmation.
 *
 * Built from the SAME dialog primitives as ApproveDialog (shell, header,
 * remarks, footer) so it looks and behaves like every other confirmation in
 * the app — but it is its own component and says "Verify", never "Approve".
 * Reusing ApproveDialog itself would have put the wrong verb on a different
 * decision: verification attests that cash was counted, approval authorises
 * the payment, and they are performed by different people.
 *
 * The wording is deliberately about the PHYSICAL check, because that is the
 * thing the person is attesting to and the only thing the system cannot see.
 *
 * Remarks are optional, matching the backend, which defaults them to ''.
 */
export default function VerifyDialog({
  visible,
  receiptNo,
  amount,
  onClose,
  onConfirm,
}: VerifyDialogProps) {
  const [remarks, setRemarks] = useState("");

  // Cleared on close, so a reopened dialog never carries the previous note.
  useEffect(() => {
    if (!visible) setRemarks("");
  }, [visible]);

  return (
    <DialogShell visible={visible} onRequestClose={onClose}>
      <DialogHeader
        icon="shield-checkmark"
        accent={COLORS.success}
        title="Verify Payment"
        subtitle="Confirm that you have physically checked this payment."
        onClose={onClose}
      />

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>
          {receiptNo} · {amount}
        </Text>
        <Text style={styles.summaryNote}>
          Verifying sends this payment for approval. It cannot be undone.
        </Text>
      </View>

      <RemarksInput
        label="Remarks (Optional)"
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Anything worth noting about the handover"
      />

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel="Verify"
        onConfirm={() => onConfirm(remarks.trim())}
        accent={COLORS.success}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: sp(18),
    paddingBottom: sp(4),
    gap: sp(3),
  },
  summaryLine: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  summaryNote: { fontSize: fs(11), color: COLORS.textSecondary },
});
