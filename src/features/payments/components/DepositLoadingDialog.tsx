import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";

/** Which round trip is in flight. Drives the line under the spinner. */
export type DepositStage = "saving" | "uploading" | "submitting";

interface DepositLoadingDialogProps {
  visible: boolean;
  stage: DepositStage;
  /** Edits say "Updating"; a new deposit says "Recording". */
  isEdit?: boolean;
  /** 1-based position and total, shown only while uploading files. */
  uploadIndex?: number;
  uploadTotal?: number;
}

/**
 * Blocking progress dialog for recording a bank deposit.
 *
 * WHY A DIALOG when the button already had a spinner. Recording a deposit is
 * not one request — it is create, then one upload PER attachment, then submit.
 * That is easily several seconds. The button lives at the bottom of a long
 * scrolling form, so a user who has scrolled up cannot see its spinner at all,
 * and nothing stopped them editing fields or tapping again while the chain was
 * mid-flight. A second tap risks a SECOND deposit for the same physical
 * hand-over, which is exactly what the PATCH-vs-POST split in `handleSubmit`
 * exists to prevent.
 *
 * Naming the current step matters more here than in verification: a multi-step
 * operation that says only "please wait" reads as hung, while "Uploading
 * attachment 2 of 3" is visibly progressing. That is the difference between
 * waiting and reaching for the button again.
 *
 * Same primitives and the same confirm -> loading -> success shape as
 * VerifyLoadingDialog and ApprovalLoadingDialog, so every long operation in
 * the app behaves alike. `dismissable={false}` blocks back and backdrop taps.
 */
export default function DepositLoadingDialog({
  visible,
  stage,
  isEdit = false,
  uploadIndex,
  uploadTotal,
}: DepositLoadingDialogProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      spin.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [visible, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const title = isEdit ? "Updating Deposit" : "Recording Deposit";

  // Falls back to the plain wording when the counts are absent, so the line is
  // never "attachment undefined of undefined".
  const subtitle =
    stage === "uploading"
      ? uploadTotal && uploadIndex
        ? `Uploading attachment ${uploadIndex} of ${uploadTotal}...`
        : "Uploading attachments..."
      : stage === "submitting"
        ? "Sending for approval..."
        : isEdit
          ? "Saving your changes..."
          : "Saving the deposit...";

  return (
    <DialogShell visible={visible} dismissable={false}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.ring,
            { borderTopColor: COLORS.success, transform: [{ rotate }] },
          ]}
        />

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.infoCard}>
        {/* The same icon the deposit form uses for the bank, so the dialog
            reads as part of that screen rather than a generic spinner. */}
        <Ionicons name="business-outline" size={18} color={COLORS.primary} />
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>This may take a few seconds.</Text>
          <Text style={styles.infoSubtitle}>
            Please don&apos;t close this window or tap Deposit again.
          </Text>
        </View>
      </View>

      <DialogFooter
        confirmLabel={isEdit ? "Updating..." : "Depositing..."}
        onConfirm={() => {}}
        accent={COLORS.success}
        loading
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    paddingTop: 6,
  },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 4,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    borderRadius: 12,
    padding: 12,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  infoSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
