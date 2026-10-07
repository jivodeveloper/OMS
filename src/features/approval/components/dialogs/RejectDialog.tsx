import React, { useEffect, useState } from "react";

import { COLORS } from "@/src/constants/theme";
import DialogFooter from "./DialogFooter";
import DialogHeader from "./DialogHeader";
import DialogRequiredNote from "./DialogRequiredNote";
import DialogShell from "./DialogShell";
import RemarksInput from "./RemarksInput";

interface RejectDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
  /** Spins the confirm button while the decision is in flight. */
  loading?: boolean;
  /**
   * Wording only, for a screen whose document is not called a "request" — an
   * order screen says "Reject Order". NOTHING about the layout changes with
   * it: this dialog is the one the whole app uses.
   */
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
}

/**
 * Reject confirmation — unlike approve, a remark is mandatory here.
 *
 * THE ADVANCE PAYMENT DECISION DIALOG, part for part, down to the line that
 * appears when somebody tries to reject with nothing written: it is the shared
 * `DialogRequiredNote`, so the two cannot drift again the way they had.
 */
export default function RejectDialog({
  visible,
  onClose,
  onConfirm,
  loading = false,
  title = "Reject Request",
  subtitle = "This request will be sent back to the creator. Please state why it is being rejected.",
  confirmLabel = "Reject",
}: RejectDialogProps) {
  const [remarks, setRemarks] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) {
      setRemarks("");
      setTouched(false);
    }
  }, [visible]);

  const isEmpty = remarks.trim().length === 0;

  const handleConfirm = () => {
    // Surface the requirement on the first attempt rather than blocking silently.
    if (isEmpty) {
      setTouched(true);
      return;
    }
    onConfirm(remarks.trim());
  };

  return (
    <DialogShell visible={visible} onRequestClose={onClose}>
      <DialogHeader
        icon="alert-circle"
        accent={COLORS.error}
        title={title}
        subtitle={subtitle}
        onClose={onClose}
      />

      <RemarksInput
        label="Remarks (Required)"
        value={remarks}
        onChangeText={(value) => {
          setRemarks(value);
          if (touched) setTouched(false);
        }}
        placeholder="Say why — the creator will read this"
        error={touched && isEmpty}
      />

      {touched && isEmpty ? <DialogRequiredNote /> : null}

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel={confirmLabel}
        onConfirm={handleConfirm}
        accent={COLORS.error}
        loading={loading}
      />
    </DialogShell>
  );
}
