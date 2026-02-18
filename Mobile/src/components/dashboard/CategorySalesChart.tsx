import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { CategorySalesEntry } from '@/src/types/dashboard';
import DonutChart from './DonutChart';
import AnimatedCard from './AnimatedCard';

const CATEGORY_COLORS = ['#8B5CF6', '#2563EB', '#059669', '#F59E0B', '#DC2626', '#0891B2', '#EC4899', '#6366F1'];

interface Props {
  data: CategorySalesEntry[];
}

export default function CategorySalesChart({ data }: Props) {
  // Show top 6, group rest as "Other"
  const top = data.slice(0, 6);
  const rest = data.slice(6);
  if (rest.length > 0) {
    const otherSales = rest.reduce((sum, d) => sum + d.total_sales, 0);
    const otherCount = rest.reduce((sum, d) => sum + d.count, 0);
    top.push({ category: 'Other', total_sales: otherSales, count: otherCount });
  }

  const total = top.reduce((sum, d) => sum + d.total_sales, 0);

  const formatVal = (val: number) => {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
    return `₹${Math.round(val)}`;
  };

  const chartData = top.map((entry, i) => ({
    label: entry.category.length > 10 ? entry.category.slice(0, 10) + '..' : entry.category,
    value: Math.round(entry.total_sales),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  return (
    <AnimatedCard style={styles.card}>
      <Text style={styles.title}>Category Sales</Text>
      <DonutChart
        data={chartData}
        size={110}
        strokeWidth={14}
        centerValue={formatVal(total)}
        centerLabel="Sales"
        valuePrefix="₹"
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
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
});