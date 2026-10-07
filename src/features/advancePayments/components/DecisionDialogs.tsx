import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogRequiredNote from "@/src/features/approval/components/dialogs/DialogRequiredNote";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import RemarksInput from "@/src/features/approval/components/dialogs/RemarksInput";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import type { StageAction } from "@/src/services/advancePayment.service";

/**
 * The decision dialogs, built from the receive-payment approval's own pieces.
 *
 * `DialogShell`, `DialogHeader`, `RemarksInput` and `DialogFooter` are imported
 * from `approval/components/dialogs`, so these are the SAME dialogs an approver
 * already knows from a receipt — same sheet, same circled icon, same remarks
 * box with its counter, same button row. Only the wording differs, because an
 * advance payment can be returned, sent back or cancelled as well as approved
 * and rejected, and `ApproveDialog` / `RejectDialog` name only the two.
 *
 * REMARKS LIVE IN THE DIALOG. A decision and its reason are one act: asking for
 * the words in a box further up the page meant an approver could reject with a
 * reason they had written for something else, or be refused for a field they
 * had scrolled past.
 */

/** How each action introduces itself, and whether it may proceed silently. */
const PROMPT: Record<
  StageAction,
  {
    icon: keyof typeof Ionicons.glyphMap;
    accent: string;
    title: string;
    subtitle: string;
    confirmLabel: string;
    remarksRequired: boolean;
  }
> = {
  approve: {
    icon: "checkmark-circle",
    accent: COLORS.success,
    title: "Approve Request",
    subtitle: "Are you sure you want to approve this request?",
    confirmLabel: "Approve",
    remarksRequired: false,
  },
  reject: {
    icon: "alert-circle",
    accent: COLORS.error,
    title: "Reject Request",
    subtitle:
      "This request will be sent back to the creator. Please state why it is being rejected.",
    confirmLabel: "Reject",
    remarksRequired: true,
  },
  return: {
    icon: "arrow-undo-circle",
    accent: COLORS.warning,
    title: "Return to Creator",
    subtitle:
      "The creator will be asked to correct this request and send it on again. Say what needs changing.",
    confirmLabel: "Return",
    remarksRequired: true,
  },
  "send-back": {
    icon: "arrow-back-circle",
    accent: COLORS.warning,
    title: "Send Back to Payment",
    subtitle:
      "The payment details will be reopened for the paying desk. Say what needs correcting.",
    confirmLabel: "Send Back",
    remarksRequired: true,
  },
  cancel: {
    icon: "ban",
    accent: COLORS.error,
    title: "Cancel Request",
    subtitle: "This request will be withdrawn. It cannot be reopened afterwards.",
    confirmLabel: "Cancel Request",
    remarksRequired: false,
  },
  resubmit: {
    icon: "refresh-circle",
    accent: COLORS.primary,
    title: "Resubmit Request",
    subtitle: "The request goes back to its approver as it now stands.",
    confirmLabel: "Resubmit",
    remarksRequired: false,
  },
};

/** Confirm one decision, and take its remarks. */
export function DecisionPrompt({
  action,
  initialRemarks = "",
  onClose,
  onConfirm,
}: {
  /** Null while nothing is being decided. */
  action: StageAction | null;
  /** Whatever was written in the page's optional remarks box. */
  initialRemarks?: string;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}) {
  const [remarks, setRemarks] = useState(initialRemarks);
  const [touched, setTouched] = useState(false);

  // Opened: start from what the page already holds, so an approver who wrote
  // their note while reading does not type it twice. Closed: cleared, so one
  // decision's words never carry into another.
  useEffect(() => {
    setRemarks(action ? initialRemarks : "");
    if (!action) setTouched(false);
  }, [action, initialRemarks]);

  if (!action) return null;
  const prompt = PROMPT[action];
  const empty = remarks.trim().length === 0;

  const confirm = () => {
    // Surface the requirement on the first attempt rather than refusing silently.
    if (prompt.remarksRequired && empty) {
      setTouched(true);
      return;
    }
    onConfirm(remarks.trim());
  };

  return (
    <DialogShell visible onRequestClose={onClose}>
      <DialogHeader
        icon={prompt.icon}
        accent={prompt.accent}
        title={prompt.title}
        subtitle={prompt.subtitle}
        onClose={onClose}
      />

      <RemarksInput
        label={prompt.remarksRequired ? "Remarks (Required)" : "Remarks (Optional)"}
        value={remarks}
        onChangeText={(value) => {
          setRemarks(value);
          if (touched) setTouched(false);
        }}
        placeholder={
          prompt.remarksRequired
            ? "Say why — the creator will read this"
            : "Add any remarks (optional)"
        }
        error={touched && empty}
      />

      {touched && empty ? <DialogRequiredNote /> : null}

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel={prompt.confirmLabel}
        onConfirm={confirm}
        accent={prompt.accent}
      />
    </DialogShell>
  );
}

/** What the decision did — the last thing seen before the list. */
export function DecisionDone({
  action,
  requestNo,
  status,
  isFinal = false,
  onDone,
}: {
  action: StageAction | null;
  requestNo: string;
  /** Where the request stands now, in the list's own words. */
  status: string;
  /**
   * The approval that COMPLETED the request.
   *
   * Without it the dialog always claimed the request had been "passed to the
   * next stage", which is untrue on the last rung of any route — there is no
   * next stage, the payment has gone to SAP.
   */
  isFinal?: boolean;
  onDone: () => void;
}) {
  if (!action) return null;
  const prompt = PROMPT[action];
  const approved = action === "approve";
  const stamp = new Date();

  return (
    <DialogShell visible onRequestClose={onDone}>
      <DialogHeader
        icon={approved ? "checkmark-circle" : prompt.icon}
        accent={prompt.accent}
        title={
          approved
            ? "Request Approved!"
            : action === "reject"
              ? "Request Rejected"
              : `${prompt.confirmLabel} done`
        }
        subtitle={
          approved
            ? isFinal
              ? "Approved. The payment has been posted to SAP — its response is on this page."
              : "Approved and passed to the next stage."
            : action === "reject"
              ? "The request has been rejected and sent back to the creator."
              : prompt.subtitle
        }
        onClose={onDone}
        animateIcon
      />

      <View style={styles.infoCard}>
        <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
        <View style={styles.infoText}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Request</Text>
            <Text style={styles.infoValue}>{requestNo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Now</Text>
            <Text style={styles.infoValue}>{status}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>On</Text>
            <Text style={styles.infoValue}>
              {stamp.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              {stamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>
      </View>

      <DialogFooter confirmLabel="Done" onConfirm={onDone} accent={prompt.accent} />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    flexDirection: "row",
    gap: sp(10),
    marginHorizontal: sp(20),
    marginBottom: sp(4),
    padding: sp(12),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
  },
  infoText: { flex: 1, minWidth: 0, gap: sp(4) },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: sp(10) },
  infoLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  infoValue: {
    flex: 1,
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
});
