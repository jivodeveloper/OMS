import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import DialogShell from "./DialogShell";
import DialogHeader from "./DialogHeader";
import DialogFooter from "./DialogFooter";
import RemarksInput from "./RemarksInput";

interface RejectDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}

/** Reject confirmation — unlike approve, a remark is mandatory here. */
export default function RejectDialog({
  visible,
  onClose,
  onConfirm,
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
        title="Reject Request"
        subtitle="This request will be sent back to the creator. Please state why it is being rejected."
        onClose={onClose}
      />

      <RemarksInput
        label="Remarks (Required)"
        value={remarks}
        onChangeText={(value) => {
          setRemarks(value);
          if (touched) setTouched(false);
        }}
        placeholder="Enter the reason for rejection"
        error={touched && isEmpty}
      />

      {touched && isEmpty ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={COLORS.error} />
          <Text style={styles.errorText}>
            Remarks are required to reject a request.
          </Text>
        </View>
      ) : null}

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel="Reject"
        onConfirm={handleConfirm}
        accent={COLORS.error}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.error,
  },
});
