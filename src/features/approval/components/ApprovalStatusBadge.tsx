import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "@/src/constants/theme";
import { fs } from "@/src/utils/responsive";
import type { ApprovalStatus } from "../types";

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus;
}

/** Per-status palette; keys match ApprovalStatus so every case is covered. */
const STATUS_COLORS: Record<
  ApprovalStatus,
  { bg: string; border: string; text: string }
> = {
  Pending: {
    bg: COLORS.warningLight,
    border: COLORS.warning,
    text: COLORS.warning,
  },
  Approved: {
    bg: COLORS.successLight,
    border: COLORS.success,
    text: COLORS.success,
  },
  Rejected: {
    bg: COLORS.errorLight,
    border: COLORS.errorBorder,
    text: COLORS.error,
  },
};

function ApprovalStatusBadge({ status }: ApprovalStatusBadgeProps) {
  const palette = STATUS_COLORS[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>{status}</Text>
    </View>
  );
}

// Status never changes for a given card in this list, so re-rendering it with
// the parent is pure waste.
export default React.memo(ApprovalStatusBadge);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    fontSize: fs(10),
    fontWeight: "700",
  },
});
