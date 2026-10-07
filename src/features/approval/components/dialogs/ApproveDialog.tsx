import React, { useEffect, useState } from "react";

import { COLORS } from "@/src/constants/theme";
import DialogFooter from "./DialogFooter";
import DialogHeader from "./DialogHeader";
import DialogShell from "./DialogShell";
import RemarksInput from "./RemarksInput";

interface ApproveDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
  /** Spins the confirm button while the decision is in flight. */
  loading?: boolean;
  /**
   * Wording only, for a screen whose document is not called a "request" — an
   * order screen says "Approve Order". NOTHING about the layout changes with
   * it: this dialog is the one the whole app uses.
   */
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
}

/**
 * Approve confirmation — remarks are optional here.
 *
 * THE ADVANCE PAYMENT DECISION DIALOG, part for part: `DialogShell`,
 * `DialogHeader`, `RemarksInput` and `DialogFooter` in that order, the same
 * circled icon at the same size, the same remarks box with its counter and the
 * same button row. `DecisionPrompt` exists beside it only because an advance
 * payment can also be returned, sent back, cancelled or resubmitted, which
 * this dialog has no name for.
 */
export default function ApproveDialog({
  visible,
  onClose,
  onConfirm,
  loading = false,
  title = "Approve Request",
  subtitle = "Are you sure you want to approve this request?",
  confirmLabel = "Approve",
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
        title={title}
        subtitle={subtitle}
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
        confirmLabel={confirmLabel}
        onConfirm={() => onConfirm(remarks.trim())}
        accent={COLORS.success}
        loading={loading}
      />
    </DialogShell>
  );
}
