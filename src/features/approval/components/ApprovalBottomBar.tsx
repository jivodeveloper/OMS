import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

interface ApprovalBottomBarProps {
  onReject: () => void;
  onApprove: () => void;
  disabled?: boolean;
}

/** Sticky reject/approve bar — two equal-width outlined buttons. */
function ApprovalBottomBar({
  onReject,
  onApprove,
  disabled = false,
}: ApprovalBottomBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          styles.rejectBtn,
          pressed && styles.pressed,
        ]}
        android_ripple={{ color: "#FECACA" }}
        onPress={onReject}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.btn,
          styles.approveBtn,
          pressed && styles.pressed,
        ]}
        android_ripple={{ color: "#BBF7D0" }}
        onPress={onApprove}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
        <Text style={styles.approveText}>Approve</Text>
      </Pressable>
    </View>
  );
}

export default React.memo(ApprovalBottomBar);

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
    // Extra bottom padding lifts the bar clear of the global bottom nav.
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 13,
    overflow: "hidden",
  },
  // iOS has no ripple, so press feedback falls back to a dim.
  pressed: {
    opacity: 0.85,
  },
  rejectBtn: {
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.error,
  },
  rejectText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.error,
  },
  approveBtn: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },
  approveText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.success,
  },
});
