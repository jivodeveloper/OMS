import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

interface ApprovalSummaryCardProps {
  count: number;
  /** Shows the amber dot on Filter when a non-default filter is applied. */
  filterActive?: boolean;
  dateLabel: string;
  onPressFilter: () => void;
  onPressDate: () => void;
}

/**
 * Gradient count bar — same construction as the Order List's `countBar`, so the
 * two screens share one visual language. Filter (left) and Date (right) keep
 * their intrinsic width; the middle column absorbs the rest.
 */
function ApprovalSummaryCard({
  count,
  filterActive = false,
  dateLabel,
  onPressFilter,
  onPressDate,
}: ApprovalSummaryCardProps) {
  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.bar}
    >
      <TouchableOpacity
        style={styles.pillBtn}
        onPress={onPressFilter}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Filter approval requests"
      >
        <Ionicons name="funnel-outline" size={14} color="#fff" />
        <Text style={styles.pillText}>Filter</Text>
        {filterActive ? <View style={styles.pillDot} /> : null}
      </TouchableOpacity>

      <View style={styles.textWrap}>
        <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
          {count} Request{count === 1 ? "" : "s"} Found
        </Text>
        <Text style={styles.subText} numberOfLines={1}>
          Last updated just now
        </Text>
      </View>

      <TouchableOpacity
        style={styles.pillBtn}
        onPress={onPressDate}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Filter by date"
      >
        <Ionicons name="calendar-outline" size={14} color="#fff" />
        <Text style={styles.pillText} numberOfLines={1}>
          {dateLabel}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

export default React.memo(ApprovalSummaryCard);

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: sp(16),
    marginTop: sp(12),
    paddingVertical: sp(12),
    paddingHorizontal: sp(12),
    borderRadius: sp(16),
    gap: sp(10),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  // Middle column is the only flexible one, so the pills keep their size and
  // the count text absorbs whatever width is left.
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  countText: {
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "800",
  },
  subText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fs(11),
    marginTop: 2,
  },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
  },
  pillText: {
    color: "#fff",
    fontSize: fs(12),
    fontWeight: "700",
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD166",
    marginLeft: 2,
  },
});
