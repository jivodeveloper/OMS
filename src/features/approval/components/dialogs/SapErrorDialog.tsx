import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import DialogShell from "./DialogShell";
import DialogHeader from "./DialogHeader";
import DialogFooter from "./DialogFooter";

interface SapErrorDialogProps {
  visible: boolean;
  /** The stored `sap_response`, already written for a person to read. */
  message: string;
  /** Offered only when this viewer may correct the document. */
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * Split the stored message into its three parts.
 *
 * `sap_poster._error_text` composes them as
 *   <what went wrong>
 *   What to do: <action>
 *   SAP said: <verbatim>  /  SAP code: <code>
 *
 * Parsing here rather than sending three fields keeps ONE stored string as the
 * record of what SAP said — the audit trail stays a single value, and an older
 * receipt written before this format still renders as a plain message.
 */
function split(message: string) {
  const text = (message || "").trim();
  const actionAt = text.indexOf("What to do:");
  const sapAt = text.indexOf("SAP said:");

  if (actionAt === -1 && sapAt === -1) {
    return { summary: text, action: "", raw: "" };
  }
  const summary = text.slice(0, actionAt > -1 ? actionAt : sapAt).trim();
  const action =
    actionAt > -1
      ? text
          .slice(actionAt + "What to do:".length, sapAt > -1 ? sapAt : undefined)
          .trim()
      : "";
  const raw = sapAt > -1 ? text.slice(sapAt).trim() : "";
  return { summary, action, raw };
}

/**
 * Shown when SAP refuses a posting.
 *
 * The approval itself succeeded — this is only about the posting — so the
 * dialog leads with what to change rather than treating it as a failure of the
 * decision. SAP's verbatim response is kept at the bottom, quieter, because it
 * is what support needs and not what the user should read first.
 */
export default function SapErrorDialog({
  visible,
  message,
  canEdit,
  onEdit,
  onClose,
}: SapErrorDialogProps) {
  const { summary, action, raw } = split(message);

  return (
    <DialogShell visible={visible} onRequestClose={onClose}>
      <DialogHeader
        icon="cloud-offline"
        accent={COLORS.error}
        title="Not posted to SAP"
        subtitle="The approval was recorded. SAP would not accept the posting."
        onClose={onClose}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {!!summary && <Text style={styles.summary}>{summary}</Text>}

        {!!action && (
          <View style={styles.actionBox}>
            <Ionicons
              name="build-outline"
              size={ms(16)}
              color={COLORS.primary}
              style={styles.actionIcon}
            />
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>What to do</Text>
              <Text style={styles.actionBody}>{action}</Text>
            </View>
          </View>
        )}

        {!!raw && (
          <View style={styles.rawBox}>
            <Text style={styles.rawLabel}>SAP's exact response</Text>
            <Text style={styles.rawBody}>{raw}</Text>
          </View>
        )}
      </ScrollView>

      <DialogFooter
        cancelLabel={canEdit ? "Close" : undefined}
        onCancel={canEdit ? onClose : undefined}
        confirmLabel={canEdit ? "Edit Payment" : "Close"}
        onConfirm={canEdit ? onEdit : onClose}
        accent={canEdit ? COLORS.primary : COLORS.error}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  // Capped so a long SAP trace scrolls inside the dialog instead of pushing the
  // buttons off screen.
  body: {
    maxHeight: ms(300),
  },
  bodyContent: {
    paddingBottom: sp(4),
  },
  summary: {
    fontSize: fs(14),
    lineHeight: fs(20),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: sp(12),
  },
  actionBox: {
    flexDirection: "row",
    gap: sp(9),
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    borderRadius: sp(12),
    padding: sp(12),
    marginBottom: sp(12),
  },
  actionIcon: {
    marginTop: sp(1),
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionLabel: {
    fontSize: fs(11),
    fontWeight: "800",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: sp(3),
  },
  actionBody: {
    fontSize: fs(13),
    lineHeight: fs(19),
    color: COLORS.text,
  },
  rawBox: {
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: sp(10),
    padding: sp(11),
  },
  rawLabel: {
    fontSize: fs(10),
    fontWeight: "700",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: sp(4),
  },
  rawBody: {
    fontSize: fs(12),
    lineHeight: fs(17),
    color: COLORS.textSecondary,
  },
});
