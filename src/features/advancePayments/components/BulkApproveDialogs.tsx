import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import RemarksInput from "@/src/features/approval/components/dialogs/RemarksInput";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

/**
 * Approving several requests at once — asked for, watched, and accounted for.
 *
 * THE SAME DIALOGS AS ONE DECISION. Shell, circled icon, remarks box with its
 * counter, button row: approving ten requests is the same act as approving one
 * and must not look like a different app.
 *
 * ONE REQUEST AT A TIME UNDERNEATH, each with its own version — there is no
 * bulk endpoint, and inventing one in the client by firing them together would
 * lose which of them failed. So the progress says how far it has got, and the
 * outcome says what did and did not go through.
 */

/** Confirm the lot, and take the remarks they will all carry. */
export function BulkApprovePrompt({
  count,
  busy,
  progress,
  onClose,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  /** "Approving 3 of 10…" while it runs. */
  progress: string;
  onClose: () => void;
  onConfirm: (remarks: string) => void;
}) {
  const [remarks, setRemarks] = useState("");

  return (
    <DialogShell visible dismissable={!busy} onRequestClose={busy ? undefined : onClose}>
      <DialogHeader
        icon="checkmark-done-circle"
        accent={COLORS.success}
        title="Approve Selected"
        subtitle={`${count} request${count === 1 ? "" : "s"} will be approved, one after another.`}
        onClose={busy ? undefined : onClose}
      />

      <RemarksInput
        label="Remarks (Optional)"
        value={remarks}
        onChangeText={setRemarks}
        placeholder="Added to every request in this lot"
      />

      {/* WHAT IS HAPPENING NOW, because this is the one decision that takes
          long enough for a spinner alone to look stuck. */}
      {busy && progress ? (
        <View style={styles.progressRow}>
          <Ionicons name="sync" size={14} color={COLORS.primary} />
          <Text style={styles.progressText}>{progress}</Text>
        </View>
      ) : null}

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel={busy ? "Approving…" : `Approve ${count}`}
        onConfirm={() => onConfirm(remarks.trim())}
        accent={COLORS.success}
        loading={busy}
      />
    </DialogShell>
  );
}

/** What went through, and what did not — with the reason for each refusal. */
export function BulkApproveDone({
  done,
  failed,
  onClose,
}: {
  done: string[];
  /** `[requestNo, why]` for each one the server refused. */
  failed: [string, string][];
  onClose: () => void;
}) {
  const bad = failed.length > 0;

  return (
    <DialogShell visible onRequestClose={onClose}>
      <DialogHeader
        icon={bad ? "alert-circle" : "checkmark-circle"}
        accent={bad ? COLORS.warning : COLORS.success}
        title={bad ? `Approved ${done.length}, ${failed.length} not` : `Approved ${done.length}`}
        subtitle={
          bad
            ? "The ones below were refused. They are still on your desk."
            : "They have all moved on to their next stage."
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
        accent={bad ? COLORS.warning : COLORS.success}
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
  progressText: { fontSize: fs(11.5), color: COLORS.primary, fontWeight: "700" },

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
