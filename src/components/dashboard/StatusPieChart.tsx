import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import { PieChart } from "react-native-gifted-charts";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { StatusDistEntry } from "@/src/types/dashboard";
import DonutChart from "./DonutChart";
import AnimatedCard from "./AnimatedCard";

const STATUS_COLORS: Record<string, string> = {
  Pending: "#F59E0B",
  Rejected: "#DC2626",
  Completed: "#059669",
};

const RAW_STATUS_COLORS: Record<string, string> = {
  CREATED: "#2563EB",
  RATE_APPROVAL: "#F59E0B",
  BILLING: "#8B5CF6",
  NEED_APPROVAL: "#F97316",
  BILLING_PENDING: "#A855F7",
  APPROVED: "#22C55E",
  REJECTED: "#DC2626",
  BILLING_REJECTED: "#E11D48",
  COMPLETED: "#059669",
  AUDITOR_APPROVAL: "#0EA5E9",
};

const FALLBACK_STATUS_COLORS = [
  "#64748B",
  "#14B8A6",
  "#EC4899",
  "#84CC16",
  "#6366F1",
  "#F43F5E",
];

const normalizeStatusKey = (status: string) =>
  status.trim().toUpperCase().replace(/\s+/g, "_");

const formatStatusLabel = (status: string) =>
  status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

interface Props {
  data: StatusDistEntry[];
  showAllStatus?: boolean;
  onStatusPress?: (status: "Pending" | "Completed" | "Rejected") => void;
  onTotalPress?: () => void;
}

export default function StatusPieChart({
  data,
  showAllStatus = false,
  onStatusPress,
  onTotalPress,
}: Props) {
  const [selectedRawStatusIndex, setSelectedRawStatusIndex] = useState<number | null>(null);

  const groupedStatusCounts = data.reduce(
    (counts, entry) => {
      const status = String(entry.status || "").trim().toLowerCase();
      const count = Number(entry.count || 0);

      if (status.includes("rejected")) {
        counts.Rejected += count;
      } else if (status.includes("completed")) {
        counts.Completed += count;
      } else {
        counts.Pending += count;
      }

      return counts;
    },
    { Pending: 0, Rejected: 0, Completed: 0 },
  );

  const chartData = Object.entries(groupedStatusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      label: status,
      value: count,
      color: STATUS_COLORS[status],
    }));

  const rawStatusCounts = data.reduce((counts, entry) => {
    const key = normalizeStatusKey(String(entry.status || "Unknown"));
    counts[key] = (counts[key] || 0) + Number(entry.count || 0);
    return counts;
  }, {} as Record<string, number>);

  const rawChartData = Object.entries(rawStatusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count], index) => ({
      label: formatStatusLabel(status),
      text: formatStatusLabel(status),
      value: count,
      color:
        RAW_STATUS_COLORS[status] ||
        FALLBACK_STATUS_COLORS[index % FALLBACK_STATUS_COLORS.length],
      onPress: () =>
        setSelectedRawStatusIndex(selectedRawStatusIndex === index ? null : index),
    }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);
  const rawTotal = rawChartData.reduce((sum, d) => sum + d.value, 0);
  const selectedRawStatus =
    selectedRawStatusIndex !== null ? rawChartData[selectedRawStatusIndex] : null;
  const rawStatusSplitIndex = Math.ceil(rawChartData.length / 2);
  const rawStatusLeft = rawChartData.slice(0, rawStatusSplitIndex);
  const rawStatusRight = rawChartData.slice(rawStatusSplitIndex);
  return (
    <View style={styles.wrapper}>
      <AnimatedCard style={styles.card}>
        <Text style={styles.title}>Order Status</Text>
        <DonutChart
          data={chartData}
          size={110}
          strokeWidth={14}
          centerValue={String(total)}
          centerLabel="Total"
          onSegmentPress={(label) => {
            if (
              label === "Pending" ||
              label === "Completed" ||
              label === "Rejected"
            ) {
              onStatusPress?.(label);
            }
          }}
          onTotalPress={onTotalPress}
        />
      </AnimatedCard>

      {showAllStatus ? (
        <AnimatedCard style={styles.card}>
          <Text style={styles.title}>All Status</Text>
          <View style={styles.rawDonutMap}>
            <View style={styles.rawStatusSide}>
              {rawStatusLeft.map((item, index) => {
                const isSelected = selectedRawStatusIndex === index;

                return (
                  <TouchableOpacity
                    key={item.label}
                    activeOpacity={0.8}
                    onPress={() =>
                      setSelectedRawStatusIndex(isSelected ? null : index)
                    }
                    style={[
                      styles.rawStatusMini,
                      isSelected && { backgroundColor: `${item.color}12` },
                    ]}
                  >
                    <Text
                      style={[styles.rawStatusMiniText, isSelected && { color: item.color }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    <View style={[styles.rawStatusMiniDot, { backgroundColor: item.color }]} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.rawPieWrap}>
              <PieChart
                data={rawChartData}
                donut
                isThreeD={false}
                shadow={false}
                radius={70}
                innerRadius={41}
                strokeWidth={2}
                strokeColor={COLORS.surface}
                innerCircleColor={COLORS.surface}
                innerCircleBorderWidth={0}
                centerLabelComponent={() => (
                  <View style={styles.rawDonutCenter}>
                    <Text
                      style={styles.rawDonutValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {selectedRawStatus ? selectedRawStatus.value : rawTotal}
                    </Text>
                    <Text style={styles.rawDonutLabel} numberOfLines={2}>
                      {selectedRawStatus ? selectedRawStatus.label : "Total"}
                    </Text>
                  </View>
                )}
              />
            </View>

            <View style={styles.rawStatusSide}>
              {rawStatusRight.map((item, rightIndex) => {
                const index = rawStatusSplitIndex + rightIndex;
                const isSelected = selectedRawStatusIndex === index;

                return (
                  <TouchableOpacity
                    key={item.label}
                    activeOpacity={0.8}
                    onPress={() =>
                      setSelectedRawStatusIndex(isSelected ? null : index)
                    }
                    style={[
                      styles.rawStatusMini,
                      styles.rawStatusMiniRight,
                      isSelected && { backgroundColor: `${item.color}12` },
                    ]}
                  >
                    <View style={[styles.rawStatusMiniDot, { backgroundColor: item.color }]} />
                    <Text
                      style={[styles.rawStatusMiniText, isSelected && { color: item.color }]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </AnimatedCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    gap: SPACING.sm,
  },
  card: {
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  rawDonutMap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  rawPieWrap: {
    width: 142,
    alignItems: "center",
    justifyContent: "center",
  },
  rawStatusSide: {
    flex: 1,
    gap: 5,
  },
  rawStatusMini: {
    minHeight: 23,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  rawStatusMiniRight: {
    justifyContent: "flex-start",
  },
  rawStatusMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rawStatusMiniText: {
    flexShrink: 1,
    fontSize: 8,
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  rawDonutCenter: {
    alignItems: "center",
    justifyContent: "center",
    width: 85,
  },
  rawDonutValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: COLORS.text,
    textAlign: "center",
  },
  rawDonutLabel: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
