import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

interface Props {
  onEdit: () => void;
  onVerify: () => void;
  /** False when the viewer created this receipt, or it is already verified. */
  canVerify?: boolean;
  disabled?: boolean;
}

/**
 * Edit + Verify, in the shape of the approver's Reject/Approve bar.
 *
 * Structurally the same as `ApprovalBottomBar` — two equal-width outlined
 * buttons, same padding, same ripple — so the details screen looks identical
 * whichever job brought the user there. It is a separate component rather
 * than a prop on that one because the actions differ in meaning as well as
 * wording: approving authorises a payment, verifying attests that the cash
 * was physically counted, and one component doing both would invite the
 * wrong verb on the wrong screen.
 *
 * Verify is disabled, not hidden, when the viewer raised the receipt: hiding
 * it leaves them wondering where the button went, and the details screen
 * explains the reason alongside.
 */
export default function VerifyBottomBar({
  onEdit,
  onVerify,
  canVerify = true,
  disabled = false,
}: Props) {
  return (
    <View style={styles.bar}>
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          styles.editBtn,
          pressed && styles.pressed,
        ]}
        android_ripple={{ color: "#DBEAFE" }}
        onPress={onEdit}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Edit payment"
      >
        <Ionicons name="create-outline" size={18} color={COLORS.primary} />
        <Text style={[styles.text, { color: COLORS.primary }]}>Edit</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.btn,
          styles.verifyBtn,
          !canVerify && styles.disabledBtn,
          pressed && canVerify && styles.pressed,
        ]}
        android_ripple={canVerify ? { color: "#BBF7D0" } : undefined}
        onPress={onVerify}
        disabled={disabled || !canVerify}
        accessibilityRole="button"
        accessibilityLabel="Verify payment"
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={18}
          color={canVerify ? COLORS.success : COLORS.textSecondary}
        />
        <Text
          style={[
            styles.text,
            { color: canVerify ? COLORS.success : COLORS.textSecondary },
          ]}
        >
          Verify
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: sp(10),
    paddingHorizontal: sp(12),
    paddingTop: sp(10),
    paddingBottom: sp(14),
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    paddingVertical: sp(12),
    borderRadius: 10,
    borderWidth: 1,
  },
  editBtn: { borderColor: COLORS.primary, backgroundColor: "#fff" },
  verifyBtn: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successLight ?? "#DCFCE7",
  },
  disabledBtn: { borderColor: COLORS.border, backgroundColor: "#F3F4F6" },
  pressed: { opacity: 0.75 },
  text: { fontSize: fs(13), fontWeight: "800" },
});
