import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import DialogShell from "./DialogShell";
import DialogFooter from "./DialogFooter";
import type { ApprovalDecision } from "../../types";

interface ApprovalLoadingDialogProps {
  visible: boolean;
  decision: ApprovalDecision;
}

/**
 * Blocking progress dialog. Deliberately has no close button and ignores
 * back/backdrop dismissal — the decision must not be interrupted mid-flight.
 */
export default function ApprovalLoadingDialog({
  visible,
  decision,
}: ApprovalLoadingDialogProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const isApprove = decision === "approve";
  const accent = isApprove ? COLORS.success : COLORS.error;

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
        {/* Ring with a coloured arc — rotating it reads as a smooth spinner. */}
        <Animated.View
          style={[
            styles.ring,
            { borderTopColor: accent, transform: [{ rotate }] },
          ]}
        />

        <Text style={styles.title}>
          {isApprove ? "Approving Request" : "Rejecting Request"}
        </Text>
        <Text style={styles.subtitle}>
          Please wait while we {isApprove ? "approve" : "reject"} this request.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>This may take a few seconds.</Text>
          <Text style={styles.infoSubtitle}>Please don&apos;t close this window.</Text>
        </View>
      </View>

      <DialogFooter
        confirmLabel={isApprove ? "Approving..." : "Rejecting..."}
        onConfirm={() => {}}
        accent={accent}
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
