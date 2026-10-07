import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

/**
 * Raising a credit-limit request, confirmed the way a decision is.
 *
 * The same two dialogs the rest of the app uses — a blocking spinner while the
 * submission is in flight, then a Done sheet built from
 * `approval/components/dialogs`, so the sheet, the circled icon and the button
 * row are identical. A submission raises one request per party and cannot be
 * taken back, which is worth the same confirmation an approval gets.
 */

/**
 * In flight: NO CLOSE AND NO BACKDROP DISMISSAL.
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
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]}>
            <Ionicons name="card" size={26} color={COLORS.primary} />
          </Animated.View>
          <Text style={styles.title}>Submitting…</Text>
          <Text style={styles.hint}>
            Reading each customer from SAP and routing the request.
          </Text>
        </View>
      </View>
    </Modal>
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: sp(32),
  },
  sheet: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: sp(10),
    backgroundColor: COLORS.surface,
    borderRadius: sp(20),
    paddingVertical: sp(28),
    paddingHorizontal: sp(20),
  },
  spinner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  title: { fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  hint: { fontSize: fs(12), color: COLORS.textSecondary, textAlign: "center" },

  // The decision dialogs' own info card, so the two read alike.
  infoCard: {
    flexDirection: "row",
    gap: sp(10),
    marginHorizontal: sp(20),
    marginBottom: sp(4),
    padding: sp(12),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
  },
  // `minWidth: 0` so a long value ellipsises inside the row.
  infoText: { flex: 1, minWidth: 0, gap: sp(4) },
  infoRow: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  infoLabel: { flex: 1, fontSize: fs(11.5), color: COLORS.textSecondary },
  infoValue: { flexShrink: 1, fontSize: fs(12.5), fontWeight: "800", color: COLORS.text },
});
