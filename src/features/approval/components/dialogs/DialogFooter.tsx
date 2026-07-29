import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS } from "@/src/constants/theme";

interface DialogFooterProps {
  /** Omit for single-button footers (success dialog). */
  cancelLabel?: string;
  onCancel?: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  /** Fill colour of the primary button. */
  accent: string;
  loading?: boolean;
  disabled?: boolean;
}

/** Cancel + confirm row with Android ripple and an iOS press-opacity fallback. */
export default function DialogFooter({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  accent,
  loading = false,
  disabled = false,
}: DialogFooterProps) {
  const confirmDisabled = disabled || loading;

  return (
    <View style={styles.row}>
      {cancelLabel ? (
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            styles.cancelBtn,
            pressed && styles.pressed,
          ]}
          android_ripple={{ color: "#CBD5E1" }}
          onPress={onCancel}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: confirmDisabled ? COLORS.textMuted : accent },
          pressed && !confirmDisabled && styles.pressed,
        ]}
        android_ripple={{ color: "rgba(255,255,255,0.25)" }}
        onPress={onConfirm}
        disabled={confirmDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: confirmDisabled, busy: loading }}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </View>
        ) : (
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // iOS has no ripple, so press feedback falls back to a dim.
  pressed: {
    opacity: 0.85,
  },
  cancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
