import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { MonthlySalesEntry } from "@/src/types/dashboard";
import AnimatedCard from "./AnimatedCard";

interface Props {
  data: MonthlySalesEntry[];
}

export default function SalesLineChart({ data }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.max(screenWidth - SPACING.lg * 2 - SPACING.md * 2, 280);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!data || !data.length) {
    return (
      <AnimatedCard style={styles.card}>
        <Text style={styles.title}>Monthly Revenue Trend</Text>
        <Text style={styles.noData}>No sales data available</Text>
      </AnimatedCard>
    );
  }

  const labels = data.map((d) => d.label.split(" ")[0]);
  const values = data.map((d) => d.revenue);
  const maxValue = Math.max(...values, 1);
  const chartHeight = 210;
  const topPad = 18;
  const bottomPad = 42;
  const yAxisWidth = 72;
  const plotHeight = chartHeight - topPad - bottomPad;
  const plotWidth = chartWidth - yAxisWidth - 8;
  const pointCount = Math.max(values.length - 1, 1);
  const points = values.map((value, index) => ({
    x: yAxisWidth + (plotWidth * index) / pointCount,
    y: topPad + plotHeight - (value / maxValue) * plotHeight,
    value,
    label: data[index]?.label || labels[index] || "",
  }));
  const selectedPoint = selectedIndex == null ? null : points[selectedIndex];

  const formatRevenue = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
    return `₹${val}`;
  };

  return (
    <AnimatedCard style={styles.card}>
      <Text style={styles.title}>Monthly Revenue Trend</Text>
      <View style={[styles.chart, { width: chartWidth, height: chartHeight }]}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = topPad + plotHeight - ratio * plotHeight;
          return (
            <View key={ratio} style={[styles.gridRow, { top: y - 10 }]}>
              <Text style={styles.yLabel}>{formatRevenue(maxValue * ratio)}</Text>
              <View style={styles.gridLine} />
            </View>
          );
        })}

        {points.slice(0, -1).map((point, index) => {
          const next = points[index + 1];
          const deltaX = next.x - point.x;
          const deltaY = next.y - point.y;
          const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const angle = Math.atan2(deltaY, deltaX);

          return (
            <View
              key={`line-${index}`}
              style={[
                styles.lineSegment,
                {
                  width: length,
                  left: (point.x + next.x) / 2 - length / 2,
                  top: (point.y + next.y) / 2 - 1.5,
                  transform: [{ rotateZ: `${angle}rad` }],
                },
              ]}
            />
          );
        })}

        {points.map((point, index) => (
          <TouchableOpacity
            key={`${point.label}-${index}`}
            activeOpacity={0.85}
            onPress={() => setSelectedIndex(index)}
            style={[
              styles.pointHitArea,
              {
                left: point.x - 14,
                top: point.y - 14,
              },
            ]}
          >
            <View
              style={[
                styles.point,
                selectedIndex === index && styles.pointSelected,
              ]}
            />
          </TouchableOpacity>
        ))}

        {labels.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            style={[
              styles.xLabel,
              {
                left: points[index].x - 18,
                top: chartHeight - 30,
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))}

        {selectedPoint && (
          <View
            style={[
              styles.tooltip,
              {
                left: Math.max(
                  yAxisWidth,
                  Math.min(selectedPoint.x - 42, chartWidth - 92),
                ),
                top: Math.max(0, selectedPoint.y - 48),
              },
            ]}
          >
            <Text style={styles.tooltipLabel}>{selectedPoint.label}</Text>
            <Text style={styles.tooltipValue}>{formatRevenue(selectedPoint.value)}</Text>
          </View>
        )}
      </View>
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  chart: {
    position: "relative",
    alignSelf: "center",
    borderRadius: RADIUS.md,
    overflow: "visible",
  },
  noData: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: COLORS.primaryDark,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    minWidth: 80,
    zIndex: 5,
  },
  tooltipLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  gridRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  yLabel: {
    width: 66,
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textAlign: "right",
    marginRight: 4,
  },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  lineSegment: {
    position: "absolute",
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  pointHitArea: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  point: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  pointSelected: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
  },
  xLabel: {
    position: "absolute",
    width: 36,
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: "center",
    transform: [{ rotateZ: "-30deg" }],
  },
});
