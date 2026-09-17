import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS, RADIUS } from "@/src/constants/theme";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { fs, sp } from "@/src/utils/responsive";
import BackDateSapResultList from "./BackDateSapResultList";

interface Props {
  visible: boolean;
  /** The stored `hana_status_text` from the 502. */
  statusText: string | undefined;
  /** The server's own sentence, when the text does not parse. */
  message: string;
  /** Offered only when the server says this viewer may correct the request. */
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * SAP refused the grant on the final approval.
 *
 * NOT the payments `SapErrorDialog`, deliberately. That one is written for a
 * posting that failed AFTER a successful approval, and it says so — "the
 * approval itself succeeded". For BackDate the opposite is true: SAP is called
 * BEFORE the approval is written, so a refusal means **nothing was approved**
 * and the request is still sitting at this stage. Reusing that copy would tell
 * the approver they had approved something they had not.
 *
 * The same dialog kit, so it looks identical; different words, because the
 * facts are different.
 */
export default function BackDateSapRefusedDialog({
  visible,
  statusText,
  message,
  canEdit,
  onEdit,
  onClose,
}: Props) {
  return (
    <DialogShell visible={visible} onRequestClose={onClose}>
      <DialogHeader
        icon="alert-circle"
        accent={COLORS.error}
        title="SAP refused the rights"
        subtitle="Nothing was approved"
      />

      <View style={styles.body}>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            This request is still waiting at your stage. Correct it and approve
            again — no rights have been granted.
          </Text>
        </View>

        <Text style={styles.heading}>SAP said</Text>
        <ScrollView style={styles.scroll} nestedScrollEnabled>
          <BackDateSapResultList text={statusText} status="FAILED" />
          {!statusText ? (
            <Text style={styles.fallback}>{message}</Text>
          ) : null}
        </ScrollView>
      </View>

      <DialogFooter
        cancelLabel="Close"
        onCancel={onClose}
        confirmLabel={canEdit ? "Edit & retry" : "Close"}
        onConfirm={canEdit ? onEdit : onClose}
        accent={COLORS.primary}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: sp(12) },
  notice: {
    backgroundColor: COLORS.errorLight,
    borderRadius: RADIUS.md,
    padding: sp(12),
    marginBottom: sp(12),
  },
  noticeText: { fontSize: fs(13), lineHeight: fs(19), color: COLORS.error },
  heading: {
    fontSize: fs(11),
    fontWeight: "700",
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  scroll: { maxHeight: sp(180) },
  fallback: {
    fontSize: fs(12),
    lineHeight: fs(18),
    color: COLORS.textSecondary,
    marginTop: sp(8),
  },
});
