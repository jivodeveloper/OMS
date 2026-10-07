import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

/**
 * Raising a credit-limit request, confirmed the way a decision is.
 *
 * BUILT FROM THE SAME PIECES, part for part. The spinner is
 * `ApprovalLoadingDialog`'s ring and info card; the Done sheet is
 * `DecisionDone`'s header, info card and single-button footer. Nothing here
 * invents its own geometry — a submission is one of the app's confirmations
 * and must look like the rest of them.
 */

/**
 * In flight: NO CLOSE AND NO BACKDROP DISMISSAL (`dismissable={false}`).
 *
 * One tap is one submission. A second would raise the same parties twice, and
 * the server would take both — they are different requests to it.
 */
export function CreditLimitSubmittingDialog({ visible }: { visible: boolean }) {
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

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <DialogShell visible={visible} dismissable={false}>
      <View style={styles.center}>
        {/* Ring with a coloured arc — rotating it reads as a smooth spinner. */}
        <Animated.View
          style={[styles.ring, { borderTopColor: COLORS.primary, transform: [{ rotate }] }]}
        />

        <Text style={styles.title}>Submitting Request</Text>
        <Text style={styles.subtitle}>
          Please wait while we read each customer from SAP and route the request.
        </Text>
      </View>

      <View style={styles.waitCard}>
        <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
        <View style={styles.waitText}>
          <Text style={styles.waitTitle}>This may take a few seconds.</Text>
          <Text style={styles.waitSubtitle}>Please don&apos;t close this window.</Text>
        </View>
      </View>

      <DialogFooter
        confirmLabel="Submitting..."
        onConfirm={() => {}}
        accent={COLORS.primary}
        loading
      />
    </DialogShell>
  );
}

/** Raised: what went where, and Done leads back to the list. */
export function CreditLimitSubmittedDialog({
  count,
  company,
  onDone,
}: {
  count: number;
  company: string;
  onDone: () => void;
}) {
  const stamp = new Date();

  return (
    <DialogShell visible onRequestClose={onDone}>
      <DialogHeader
        icon="checkmark-circle"
        accent={COLORS.success}
        title={count > 1 ? "Requests Raised!" : "Request Raised!"}
        subtitle={
          count > 1
            ? "Each party is now with its own first approver."
            : "It is now with the first approver."
        }
        onClose={onDone}
        animateIcon
      />

      {/* `DecisionDone`'s info card, down to the inset and the right-aligned
          values, so the two read as one dialog with different words. */}
      <View style={styles.infoCard}>
        <Ionicons name="card-outline" size={18} color={COLORS.primary} />
        <View style={styles.infoText}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Raised</Text>
            <Text style={styles.infoValue}>
              {count} {count === 1 ? "request" : "requests"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Company</Text>
            <Text style={styles.infoValue}>{company}</Text>
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

      <DialogFooter confirmLabel="Done" onConfirm={onDone} accent={COLORS.success} />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  // ── ApprovalLoadingDialog's own geometry ───────────────────────────
  center: { alignItems: "center", paddingTop: 6 },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 4,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
  waitCard: {
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
  waitText: { flex: 1 },
  waitTitle: { fontSize: 12, fontWeight: "700", color: COLORS.primaryDark },
  waitSubtitle: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  // ── DecisionDone's own geometry ────────────────────────────────────
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
