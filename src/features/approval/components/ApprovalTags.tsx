import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "@/src/constants/theme";
import type { ApprovalTag } from "../types";

interface ApprovalTagsProps {
  tags: ApprovalTag[];
}

/**
 * One colour per tag category so a card's nature reads at a glance. Colours are
 * drawn from the app palette rather than invented, keeping the list consistent
 * with badges elsewhere in the app.
 */
const TAG_COLORS: Record<ApprovalTag, { bg: string; text: string }> = {
  Invoice: { bg: COLORS.primaryLight, text: COLORS.primary },
  Purchase: { bg: "#EDE9FE", text: "#6D28D9" },
  Vendor: { bg: "#FFEDD5", text: "#C2410C" },
  Bank: { bg: "#CCFBF1", text: "#0F766E" },
  Payment: { bg: COLORS.successLight, text: COLORS.success },
  Deposit: { bg: "#E0F2FE", text: "#0369A1" },
};

function ApprovalTags({ tags }: ApprovalTagsProps) {
  if (tags.length === 0) return null;

  return (
    <View style={styles.row}>
      {tags.map((tag) => {
        const palette = TAG_COLORS[tag];
        return (
          <View
            key={tag}
            style={[styles.tag, { backgroundColor: palette.bg }]}
          >
            <Text style={[styles.tagText, { color: palette.text }]}>{tag}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(ApprovalTags);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
