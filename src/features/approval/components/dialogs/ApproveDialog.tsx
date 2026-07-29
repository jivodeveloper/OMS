import React, { useEffect, useState } from "react";
import { COLORS } from "@/src/constants/theme";
import DialogShell from "./DialogShell";
import DialogHeader from "./DialogHeader";
import DialogFooter from "./DialogFooter";
import RemarksInput from "./RemarksInput";

interface ApproveDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}

/** Approve confirmation — remarks are optional here. */
export default function ApproveDialog({
  visible,
  onClose,
  onConfirm,
}: ApproveDialogProps) {
  const [remarks, setRemarks] = useState("");

  // Clear on close so a reopened dialog never shows the previous attempt's text.
  useEffect(() => {
    if (!visible) setRemarks("");
  }, [visible]);

  return (
    <DialogShell visible={visible} onRequestClose={onClose}>
      <DialogHeader
        icon="checkmark-circle"
        accent={COLORS.success}
        title="Approve Request"
        subtitle="Are you sure you want to approve this request?"
        onClose={onClose}
      />

      <RemarksInput
        label="Remarks (Optional)"
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Add any remarks (optional)"
      />

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel="Approve"
        onConfirm={() => onConfirm(remarks.trim())}
        accent={COLORS.success}
      />
    </DialogShell>
  );
}
