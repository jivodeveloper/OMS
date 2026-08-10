import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import DialogShell from "./DialogShell";
import DialogHeader from "./DialogHeader";
import DialogFooter from "./DialogFooter";
import type { ApprovalDecision } from "../../types";

interface ApprovalSuccessDialogProps {
  visible: boolean;
  decision: ApprovalDecision;
  requestNo: string;
  /**
   * True when this was the FINAL approval — the chain is complete and the
   * document has gone to SAP. Without it the dialog always claimed the
   * document was "forwarded to the next approval level", which is a lie on a
   * single-level workflow and on the last rung of any other.
   */
  isFinal?: boolean;
  /** Display-ready stamp, e.g. "28 Jul 2026". */
  date: string;
  time: string;
  onDone: () => void;
}

/** Terminal dialog of the decision flow — Done returns to the list. */
export default function ApprovalSuccessDialog({
  visible,
  decision,
  requestNo,
  isFinal = false,
  date,
  time,
  onDone,
}: ApprovalSuccessDialogProps) {
  const isApprove = decision === "approve";
  const accent = isApprove ? COLORS.success : COLORS.error;

  return (
    <DialogShell visible={visible} onRequestClose={onDone}>
      <DialogHeader
        icon={isApprove ? "checkmark-circle" : "close-circle"}
        accent={accent}
        title={isApprove ? "Request Approved!" : "Request Rejected"}
        subtitle={
          !isApprove
            ? "The request has been rejected and sent back to the creator."
            : isFinal
              ? "Approved and sent to SAP for posting."
              : "Request approved successfully and forwarded to the next approval level."
        }
        onClose={onDone}
        animateIcon
      />

      <View style={styles.infoCard}>
        <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
        <View style={styles.infoText}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Request ID</Text>
            <Text style={styles.infoValue}>{requestNo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              {isApprove ? "Approved On" : "Rejected On"}
            </Text>
            <Text style={styles.infoValue}>
              {date} · {time}
            </Text>
          </View>
        </View>
      </View>

      <DialogFooter confirmLabel="Done" onConfirm={onDone} accent={accent} />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: 12,
  },
  infoText: {
    flex: 1,
    gap: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  infoValue: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
});
