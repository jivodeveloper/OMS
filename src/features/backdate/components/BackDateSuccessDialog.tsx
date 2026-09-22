import React from "react";
import { StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

interface Props {
  visible: boolean;
  /** Display-ready, e.g. "#130". */
  requestNo: string;
  onDone: () => void;
}

/**
 * The request was raised.
 *
 * Built from the shared dialog kit rather than an `Alert`, so it owns what
 * happens next: the screen only navigates when the user has acknowledged the
 * request number, which is the one thing they need to find it again.
 *
 * The button names its destination — the tracking list, as the body already
 * promised. It read "View request" while going somewhere else, which is the
 * kind of small lie that teaches people not to read dialogs.
 *
 * Deliberately not dismissable by backdrop — there is exactly one thing to do.
 */
export default function BackDateSuccessDialog({
  visible,
  requestNo,
  onDone,
}: Props) {
  return (
    <DialogShell visible={visible} dismissable={false} onRequestClose={onDone}>
      <DialogHeader
        icon="checkmark-circle"
        accent={COLORS.success}
        title="Request submitted"
        subtitle={`BackDate request ${requestNo}`}
        animateIcon
      />

      <View style={styles.body}>
        <Text style={styles.text}>
          It is now waiting for its first approval. The rights are written to
          SAP only after the last approver says yes — you can follow it under
          BackDate Tracking.
        </Text>
      </View>

      <DialogFooter
        confirmLabel="Go to Tracking"
        onConfirm={onDone}
        accent={COLORS.success}
      />
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
});
