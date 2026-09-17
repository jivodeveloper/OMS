import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { fs, sp } from "@/src/utils/responsive";
import type { ApprovalDecision } from "../types";
import BackDateSapResultList from "./BackDateSapResultList";

interface Props {
  visible: boolean;
  decision: ApprovalDecision;
  requestNo: string;
  /** True when this was the LAST stage — the one that wrote to SAP. */
  isFinal: boolean;
  /** SAP's reply, on a final approval. */
  statusText?: string;
  onDone: () => void;
}

/**
 * The decision landed.
 *
 * On a FINAL approval this holds SAP's own response on screen rather than
 * closing over it. That moment — the one time the approver most wants to see
 * what SAP said — used to be the moment it disappeared, leaving them to hunt
 * for it under a Completed filter.
 */
export default function BackDateDecisionDoneDialog({
  visible,
  decision,
  requestNo,
  isFinal,
  statusText,
  onDone,
}: Props) {
  const approved = decision === "approve";
  const accent = approved ? COLORS.success : COLORS.error;

  const subtitle = !approved
    ? "The requester has been told why"
    : isFinal
      ? "SAP accepted the grant"
      : "Forwarded to the next approver";

  return (
    <DialogShell visible={visible} dismissable={false} onRequestClose={onDone}>
      <DialogHeader
        icon={approved ? "checkmark-circle" : "close-circle"}
        accent={accent}
        title={approved ? "Approved" : "Rejected"}
        subtitle={`${requestNo} · ${subtitle}`}
        animateIcon
      />

      <View style={styles.body}>
        <Text style={styles.text}>
          {!approved
            ? "This ends the request. The requester can raise a new one."
            : isFinal
              ? "The back-posting rights are now in SAP."
              : "It now waits for the next approver in the chain."}
        </Text>

        {approved && isFinal ? (
          <ScrollView style={styles.scroll} nestedScrollEnabled>
            <BackDateSapResultList text={statusText} status="SUCCESS" />
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
  scroll: { maxHeight: sp(160) },
});
