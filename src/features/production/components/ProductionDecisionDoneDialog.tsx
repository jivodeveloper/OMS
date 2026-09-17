import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import type { ProductionSapStatus } from "@/src/services/production.service";
import { fs, sp } from "@/src/utils/responsive";
import type { ApprovalDecision } from "../types";

interface Props {
  visible: boolean;
  decision: ApprovalDecision;
  docNo: string;
  /** True when this was the LAST stage — the one that wrote back to SAP. */
  isFinal: boolean;
  /** Whether the write-back landed. `null` when it was not attempted. */
  sapStatus?: ProductionSapStatus;
  /** SAP's reply, verbatim. */
  statusText?: string;
  onDone: () => void;
}

/**
 * The decision landed — and, on a final one, whether SAP heard it.
 *
 * THE WRITE-BACK CAN FAIL AFTER THE APPROVAL SUCCEEDS, and the two are not the
 * same news. The approval is recorded either way; but until the write-back
 * lands, SAP is still blocking an order everyone now believes is released.
 * Closing on a cheerful "Approved" would hide exactly that, so a failed
 * write-back is reported here, in the same breath, with what SAP said.
 */
export default function ProductionDecisionDoneDialog({
  visible,
  decision,
  docNo,
  isFinal,
  sapStatus,
  statusText,
  onDone,
}: Props) {
  const approved = decision === "approve";
  const sapFailed = approved && isFinal && sapStatus === "FAILED";
  const accent = !approved || sapFailed ? COLORS.error : COLORS.success;

  const subtitle = !approved
    ? "The order will not be released"
    : sapFailed
      ? "SAP was not told"
      : isFinal
        ? "SAP can now release it"
        : "Forwarded to the next approver";

  return (
    <DialogShell visible={visible} dismissable={false} onRequestClose={onDone}>
      <DialogHeader
        icon={
          !approved ? "close-circle" : sapFailed ? "alert-circle" : "checkmark-circle"
        }
        accent={accent}
        title={!approved ? "Rejected" : sapFailed ? "Approved, not synced" : "Approved"}
        subtitle={`${docNo} · ${subtitle}`}
        animateIcon
      />

      <View style={styles.body}>
        <Text style={styles.text}>
          {!approved
            ? "This ends the approval. The planner cancels it in SAP, or raises a new order."
            : sapFailed
              ? "The approval is recorded, but the write-back to SAP failed — so SAP is still holding the order. Use Retry SAP on this page."
              : isFinal
                ? "The decision has been written back, and SAP's release gate will let this order through."
                : "It now waits for the next approver in the chain."}
        </Text>

        {approved && isFinal && statusText ? (
          <ScrollView style={styles.scroll} nestedScrollEnabled>
            <Text style={styles.sapText}>{statusText}</Text>
          </ScrollView>
        ) : null}
      </View>

      <DialogFooter confirmLabel="Done" onConfirm={onDone} accent={accent} />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: sp(4), paddingBottom: sp(12) },
  text: {
    fontSize: fs(13),
    lineHeight: fs(19),
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  scroll: { maxHeight: sp(160), marginTop: sp(10) },
  sapText: {
    fontSize: fs(12),
    lineHeight: fs(17),
    color: COLORS.textSecondary,
  },
});
