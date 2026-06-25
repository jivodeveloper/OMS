import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { CategorySalesEntry } from '@/src/types/dashboard';
import DonutChart from './DonutChart';
import AnimatedCard from './AnimatedCard';

const CATEGORY_COLORS = [
  '#8B5CF6',
  '#2563EB',
  '#059669',
  '#F59E0B',
  '#DC2626',
  '#0891B2',
  '#EC4899',
  '#6366F1',
];

interface Props {
  data: CategorySalesEntry[];
  showBarGraph?: boolean;
}

export default function CategorySalesChart({ data, showBarGraph = false }: Props) {
  const top = data.slice(0, 6);
  const rest = data.slice(6);

  if (rest.length > 0) {
    const otherSales = rest.reduce((sum, d) => sum + Number(d.total_sales || 0), 0);
    const otherCount = rest.reduce((sum, d) => sum + Number(d.count || 0), 0);
    top.push({ category: 'Other', total_sales: otherSales, count: otherCount });
  }

  const total = top.reduce((sum, d) => sum + Number(d.total_sales || 0), 0);

  const formatVal = (val: number) => {
    if (val >= 100000) return `Rs ${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `Rs ${(val / 1000).toFixed(0)}K`;
    return `Rs ${Math.round(val)}`;
  };

  const chartData = top.map((entry, i) => ({
    label:
      entry.category.length > 10
        ? `${entry.category.slice(0, 10)}..`
        : entry.category.toUpperCase(),
    value: Math.round(Number(entry.total_sales || 0)),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const maxCategorySales = Math.max(...chartData.map((entry) => entry.value), 1);
  const barScaleMax = Math.ceil(maxCategorySales / 4) * 4 || 4;
  const yAxisTicks = [barScaleMax, Math.round(barScaleMax / 2), 0];

  return (
    <View style={styles.wrapper}>
      <AnimatedCard style={styles.card}>
        <Text style={styles.title}>Category Sales</Text>
        <DonutChart
          data={chartData}
          size={110}
          strokeWidth={14}
          centerValue={formatVal(total)}
          centerLabel="Sales"
          valuePrefix="Rs "
        />
      </AnimatedCard>

      {showBarGraph ? (
        <AnimatedCard style={styles.card}>
          <Text style={styles.title}>Sales by Category</Text>
          <View style={styles.verticalChart}>
            <View style={styles.yAxisLabels}>
              {yAxisTicks.map((tick) => (
                <Text style={styles.yAxisLabel} key={tick}>
                  {formatVal(tick)}
                </Text>
              ))}
            </View>
            <View style={styles.plotArea}>
              <LinearGradient
                colors={['#EFF6FF', '#F8FBFF', '#EEF2FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.plotBackground}
              />
              <View style={styles.yAxisLine} />
              <View style={styles.xAxisLine} />
              <View style={styles.xAxisArrow} />
              <View style={styles.yAxisArrow} />
              <View style={[styles.gridLine, { top: 0 }]} />
              <View style={[styles.gridLine, { top: 69 }]} />
              <View style={styles.barColumns}>
                {chartData.slice(0, 5).map((entry) => {
                  const barHeight = Math.max((entry.value / barScaleMax) * 138, 10);

                  return (
                    <View style={styles.barColumn} key={`${entry.label}-vbar`}>
                      <Text
                        style={[styles.barValueLabel, { bottom: barHeight + 8 }]}
                        numberOfLines={1}
                      >
                        {formatVal(entry.value).replace('Rs ', '')}
                      </Text>
                      <View
                        style={[
                          styles.verticalBar,
                          {
                            height: barHeight,
                            backgroundColor: entry.color,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <View style={styles.xAxisLabelsRow}>
                {chartData.slice(0, 5).map((entry) => (
                  <Text
                    style={styles.xAxisLabel}
                    key={`${entry.label}-xlabel`}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {entry.label}
                  </Text>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.axisTitleRow}>
            <Text style={styles.axisTitle}>Category comparison</Text>
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
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  verticalChart: {
    marginTop: SPACING.md,
    height: 192,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  yAxisLabels: {
    width: 56,
    height: 164,
    justifyContent: 'space-between',
    paddingBottom: 22,
  },
  yAxisLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    textAlign: 'right',
  },
  plotArea: {
    flex: 1,
    height: 164,
    position: 'relative',
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 26,
  },
  plotBackground: {
    position: 'absolute',
    left: 0,
    right: 4,
    top: 0,
    bottom: 26,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  yAxisLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 26,
    width: 1,
    backgroundColor: '#94A3B8',
  },
  xAxisLine: {
    position: 'absolute',
    left: 0,
    right: 4,
    bottom: 26,
    height: 1,
    backgroundColor: '#94A3B8',
  },
  xAxisArrow: {
    position: 'absolute',
    right: 0,
    bottom: 22,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#94A3B8',
  },
  yAxisArrow: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#94A3B8',
  },
  gridLine: {
    position: 'absolute',
    left: 1,
    right: 8,
    height: 1,
    backgroundColor: '#DCEBFA',
  },
  barColumns: {
    height: 138,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  barColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barValueLabel: {
    position: 'absolute',
    width: 48,
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textSecondary,
    textAlign: 'center',
    zIndex: 2,
  },
  verticalBar: {
    width: 28,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  xAxisLabelsRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  xAxisLabel: {
    flex: 1,
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  axisTitleRow: {
    marginTop: 2,
    alignItems: 'center',
  },
  axisTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
