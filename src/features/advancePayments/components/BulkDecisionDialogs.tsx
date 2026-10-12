import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogRequiredNote from "@/src/features/approval/components/dialogs/DialogRequiredNote";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import RemarksInput from "@/src/features/approval/components/dialogs/RemarksInput";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

/**
 * Deciding several requests at once — asked for, watched, and accounted for.
 *
 * THE SAME DIALOGS AS ONE DECISION. Shell, circled icon, remarks box with its
 * counter, button row: approving ten requests is the same act as approving
 * one and must not look like a different app.
 *
 * ONE REQUEST AT A TIME UNDERNEATH, each with its own version — there is no
 * bulk endpoint, and firing them together would lose which of them failed. So
 * the progress says how far it has got, and the outcome says what did and did
 * not go through.
 */

/** Which decision a bulk run is making. */
export type BulkAction = "approve" | "reject";

const WORDS: Record<
  BulkAction,
  {
    verb: string;
    done: string;
    progress: string;
    icon: "checkmark-done-circle" | "close-circle";
    accent: string;
    /** Rejecting is final and the server refuses it without a reason. */
    remarksRequired: boolean;
    caution: string;
  }
> = {
  approve: {
    verb: "Approve",
    done: "Approved",
    progress: "Approving",
    icon: "checkmark-done-circle",
    accent: COLORS.success,
    remarksRequired: false,
    caution: "Any at the last stage are posted to SAP.",
  },
  reject: {
    verb: "Reject",
    done: "Rejected",
    progress: "Rejecting",
    icon: "close-circle",
    accent: COLORS.error,
    remarksRequired: true,
    caution: "Rejecting is final: they cannot be resubmitted.",
  },
};

/** Confirm the lot, and take the remarks they will all carry. */
export function BulkDecisionPrompt({
  action,
  count,
  busy,
  progress,
  onClose,
  onConfirm,
}: {
  action: BulkAction;
  count: number;
  busy: boolean;
  /** "Approving 3 of 10…" while it runs. */
  progress: string;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}) {
  const words = WORDS[action];
  const [remarks, setRemarks] = useState("");
  const [touched, setTouched] = useState(false);
  const empty = remarks.trim().length === 0;

  const confirm = () => {
    // Surface the requirement on the first attempt rather than refusing
    // silently — the same as one decision's own dialog.
    if (words.remarksRequired && empty) {
      setTouched(true);
      return;
    }
    onConfirm(remarks.trim());
  };

  return (
    <DialogShell visible dismissable={!busy} onRequestClose={busy ? undefined : onClose}>
      <DialogHeader
        icon={words.icon}
        accent={words.accent}
        title={`${words.verb} Selected`}
        subtitle={`${count} request${count === 1 ? "" : "s"} will be ${words.done.toLowerCase()}, one after another. ${words.caution}`}
        onClose={busy ? undefined : onClose}
      />

      <RemarksInput
        label={words.remarksRequired ? "Remarks (Required)" : "Remarks (Optional)"}
        value={remarks}
        onChangeText={(value) => {
          setRemarks(value);
          if (touched) setTouched(false);
        }}
        placeholder={
          words.remarksRequired
            ? "Say why — every request in this lot carries it"
            : "Added to every request in this lot"
        }
        error={touched && empty}
      />

      {touched && empty ? <DialogRequiredNote /> : null}

      {/* WHAT IS HAPPENING NOW, because this is the one decision that takes
          long enough for a spinner alone to look stuck. */}
      {busy && progress ? (
        <View style={styles.progressRow}>
          <Ionicons name="sync" size={14} color={words.accent} />
          <Text style={[styles.progressText, { color: words.accent }]}>{progress}</Text>
        </View>
      ) : null}

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel={busy ? `${words.progress}…` : `${words.verb} ${count}`}
        onConfirm={confirm}
        accent={words.accent}
        loading={busy}
      />
    </DialogShell>
  );
}

/** What went through, and what did not — with the reason for each refusal. */
export function BulkDecisionDone({
  action,
  done,
  failed,
  onClose,
}: {
  action: BulkAction;
  done: string[];
  /** `[requestNo, why]` for each one the server refused. */
  failed: [string, string][];
  onClose: () => void;
}) {
  const words = WORDS[action];
  const bad = failed.length > 0;

  return (
    <DialogShell visible onRequestClose={onClose}>
      <DialogHeader
        icon={bad ? "alert-circle" : "checkmark-circle"}
        accent={bad ? COLORS.warning : words.accent}
        title={
          bad
            ? `${words.done} ${done.length}, ${failed.length} not`
            : `${words.done} ${done.length}`
        }
        subtitle={
          bad
            ? "The ones below were refused. They are still on your desk."
            : action === "approve"
              ? "They have all moved on to their next stage."
              : "They have all gone back to their creators."
        }
        onClose={onClose}
        animateIcon
      />

      <View style={styles.card}>
        {done.length ? (
          <Text style={styles.ok} numberOfLines={3}>
            {done.join(", ")}
          </Text>
        ) : null}

        {/* EACH REFUSAL WITH ITS OWN REASON. A count alone ("3 not approved")
            leaves the approver opening three requests to find out why. */}
        {failed.map(([requestNo, why]) => (
          <View key={requestNo} style={styles.failRow}>
            <Text style={styles.failNo}>{requestNo}</Text>
            <Text style={styles.failWhy}>{why}</Text>
          </View>
        ))}
      </View>

      <DialogFooter
        confirmLabel="Done"
        onConfirm={onClose}
        accent={bad ? COLORS.warning : words.accent}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    paddingHorizontal: sp(20),
    marginTop: -sp(4),
  },
  progressText: { fontSize: fs(11.5), fontWeight: "700" },

  card: {
    marginHorizontal: sp(20),
    marginBottom: sp(4),
    padding: sp(12),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
    gap: sp(6),
  },
  ok: { fontSize: fs(12), color: COLORS.textSecondary },
  failRow: { gap: 2 },
  failNo: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.text },
  failWhy: { fontSize: fs(11.5), color: COLORS.error },
});
