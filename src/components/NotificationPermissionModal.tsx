import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

type Props = {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  submitting?: boolean;
};

const BENEFITS = [
  "A Sales Order requires your approval",
  "Billing requests are assigned",
  "Auditor reviews are waiting",
  "Orders are approved or rejected",
  "Workflow updates happen in real time",
];

/**
 * Our own "explain first" notification-permission modal (Task 1 / Task 8).
 * Shown BEFORE the OS dialog; the OS prompt only fires when the user taps
 * "Allow Notifications". Uses a bell illustration, not a native alert/confirm.
 */
export default function NotificationPermissionModal({
  visible,
  onAllow,
  onDismiss,
  submitting = false,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.bellWrap}>
            <Ionicons name="notifications" size={34} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>Stay Updated</Text>
          <Text style={styles.subtitle}>
            Never miss an important approval or workflow update.
          </Text>

          <Text style={styles.bodyIntro}>
            Enable notifications to receive instant alerts when:
          </Text>

          <View style={styles.benefits}>
            {BENEFITS.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={COLORS.success}
                  style={styles.benefitIcon}
                />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={onAllow}
            disabled={submitting}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>
              {submitting ? "Please wait…" : "Allow Notifications"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onDismiss}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: "center",
  },
  bellWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  bodyIntro: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "600",
    alignSelf: "flex-start",
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  benefits: {
    alignSelf: "stretch",
    gap: 10,
    marginBottom: SPACING.lg,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  benefitIcon: {
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  primaryBtn: {
    alignSelf: "stretch",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  secondaryBtn: {
    alignSelf: "stretch",
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
});
