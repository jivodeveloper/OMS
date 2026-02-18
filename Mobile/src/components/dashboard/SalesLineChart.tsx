import React, { useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { LineChart } from "react-native-chart-kit";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { MonthlySalesEntry } from "@/src/types/dashboard";
import AnimatedCard from "./AnimatedCard";

interface Props {
  data: MonthlySalesEntry[];
}

export default function SalesLineChart({ data }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - SPACING.lg * 2 - SPACING.md * 2;
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    value: number;
    label: string;
  } | null>(null);

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

  const formatRevenue = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
    return `₹${val}`;
  };

  return (
    <AnimatedCard style={styles.card}>
      <Text style={styles.title}>Monthly Revenue Trend</Text>
      <View>
        <LineChart
          data={{
            labels,
            datasets: [{ data: values }],
          }}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          formatYLabel={(val) => formatRevenue(Number(val))}
          chartConfig={{
            backgroundColor: COLORS.surface,
            backgroundGradientFrom: COLORS.surface,
            backgroundGradientTo: COLORS.surface,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
            labelColor: () => COLORS.textSecondary,
            propsForDots: {
              r: "5",
              strokeWidth: "2",
              stroke: COLORS.primary,
            },
            propsForLabels: {
              fontSize: 11,
            },
          }}
          bezier
          style={styles.chart}
          verticalLabelRotation={30}
          onDataPointClick={({ x, y, value, index }) => {
            setTooltip({ x, y, value, label: data[index]?.label || "" });
          }}
          decorator={() =>
            tooltip ? (
              <View
                style={[
                  styles.tooltip,
                  {
                    left: Math.min(tooltip.x - 40, chartWidth - 100),
                    top: tooltip.y - 45,
                  },
                ]}
              >
                <Text style={styles.tooltipLabel}>{tooltip.label}</Text>
                <Text style={styles.tooltipValue}>
                  {formatRevenue(tooltip.value)}
                </Text>
              </View>
            ) : null
          }
        />
      </View>
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  chart: {
    borderRadius: RADIUS.md,
    marginLeft: -16,
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
});
