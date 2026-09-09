import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";

/**
 * Blocking progress dialog for verification.
 *
 * WHY THIS EXISTS. The confirm dialog used to close the instant Verify was
 * tapped, leaving the plain details page on screen while the request was still
 * in flight. Nothing said "working", so a verifier on a slow connection had no
 * way to tell the tap had registered — and the natural response is to tap
 * Verify again. The second call is refused by the server (the receipt is no
 * longer PENDING), but the verifier sees an error for an action that actually
 * succeeded, which is the worst possible reading of a money workflow.
 *
 * Modelled on ApprovalLoadingDialog and built from the same primitives, so
 * confirm -> loading -> success is one consistent chain across decisions and
 * verification. It is its own component rather than a reuse because that one
 * is typed on ApprovalDecision ("approve" | "reject") and says "Approving
 * Request"; verification is neither.
 *
 * `dismissable={false}` is the load-bearing part: no close button, and back
 * or backdrop taps are ignored, so the dialog cannot be dismissed into the
 * same ambiguous state it exists to prevent.
 */
export default function VerifyLoadingDialog({ visible }: { visible: boolean }) {
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

  return (
    <DialogShell visible={visible} dismissable={false}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.ring,
            { borderTopColor: COLORS.success, transform: [{ rotate }] },
          ]}
        />

        <Text style={styles.title}>Verifying Payment</Text>
        <Text style={styles.subtitle}>
          Please wait while we record your verification.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Ionicons
          name="shield-checkmark-outline"
          size={18}
          color={COLORS.primary}
        />
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>This may take a few seconds.</Text>
          {/* The explicit instruction not to retry: this dialog is shown
              precisely when a verifier would otherwise be tempted to. */}
          <Text style={styles.infoSubtitle}>
            Please don&apos;t close this window or tap Verify again.
          </Text>
        </View>
      </View>

      <DialogFooter
        confirmLabel="Verifying..."
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
