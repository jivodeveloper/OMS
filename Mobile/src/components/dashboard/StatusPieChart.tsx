import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { StatusDistEntry } from "@/src/types/dashboard";
import DonutChart from "./DonutChart";
import AnimatedCard from "./AnimatedCard";

const STATUS_COLORS: Record<string, string> = {
  CREATED: "#2563EB",
  RATE_APPROVAL: "#F59E0B",
  BILLING: "#8B5CF6",
  NEED_APPROVAL: "#F97316",
  BILLING_PENDING: "#A855F7",
  APPROVED: "#22C55E",
  REJECTED: "#DC2626",
  BILLING_REJECTED: "#E11D48",
  COMPLETED: "#059669",
};

interface Props {
  data: StatusDistEntry[];
}

export default function StatusPieChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const chartData = data.map((entry) => ({
    label: entry.label || entry.status,
    value: entry.count,
    color: STATUS_COLORS[entry.status] || "#94A3B8",
  }));

  return (
    <AnimatedCard style={styles.card}>
      <Text style={styles.title}>Order Status</Text>
      <DonutChart
        data={chartData}
        size={110}
        strokeWidth={14}
        centerValue={String(total)}
        centerLabel="Total"
      />
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
});
