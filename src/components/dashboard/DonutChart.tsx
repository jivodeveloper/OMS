import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS, SPACING } from '@/src/constants/theme';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  valuePrefix?: string;
  maxLegendItems?: number;
  onSegmentPress?: (label: string) => void;
  onTotalPress?: () => void;
}

export default function DonutChart({
  data,
  size = 140,
  strokeWidth = 18,
  centerLabel,
  centerValue,
  valuePrefix = '',
  maxLegendItems,
  onSegmentPress,
  onTotalPress,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noData}>No data</Text>
      </View>
    );
  }

  const nonZeroData = data.filter((d) => d.value > 0);
  const chartWidth = Math.max(size, 110);
  const barHeight = Math.max(Math.round(strokeWidth * 0.7), 10);

  return (
    <View style={styles.container}>
      <View style={[styles.summary, { width: chartWidth }]}>
        <TouchableOpacity
          activeOpacity={onTotalPress ? 0.75 : 1}
          onPress={onTotalPress}
          disabled={!onTotalPress}
          style={styles.centerText}
        >
          <Text style={styles.centerValue}>{centerValue}</Text>
          {centerLabel && (
            <Text style={styles.centerLabel} numberOfLines={1}>
              {centerLabel}
            </Text>
          )}
        </TouchableOpacity>
        <View style={[styles.segmentBar, { height: barHeight }]}>
          {nonZeroData.map((seg, i) => (
            <TouchableOpacity
              key={`${seg.label}-${i}`}
              activeOpacity={onSegmentPress ? 0.75 : 1}
              onPress={() => onSegmentPress?.(seg.label)}
              disabled={!onSegmentPress}
              style={[
                styles.segment,
                {
                  backgroundColor: seg.color,
                  flexGrow: seg.value,
                  borderTopLeftRadius: i === 0 ? barHeight / 2 : 0,
                  borderBottomLeftRadius: i === 0 ? barHeight / 2 : 0,
                  borderTopRightRadius: i === nonZeroData.length - 1 ? barHeight / 2 : 0,
                  borderBottomRightRadius: i === nonZeroData.length - 1 ? barHeight / 2 : 0,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Legend */}
      {(() => {
        const scrollable = maxLegendItems != null && data.length > maxLegendItems;
        const itemHeight = 26;
        const legendContent = data.map((d, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={onSegmentPress ? 0.75 : 1}
            onPress={() => onSegmentPress?.(d.label)}
            disabled={!onSegmentPress}
            style={styles.legendItem}
          >
            <View style={[styles.legendDot, { backgroundColor: d.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={styles.legendValue}>
              {valuePrefix}{d.value}
            </Text>
          </TouchableOpacity>
        ));
        return scrollable ? (
          <ScrollView
            style={[styles.legend, { maxHeight: itemHeight * maxLegendItems }]}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {legendContent}
          </ScrollView>
        ) : (
          <View style={styles.legend}>{legendContent}</View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  summary: {
    alignSelf: 'center',
    alignItems: 'center',
  },
  centerText: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  centerValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  centerLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    maxWidth: 80,
    textAlign: 'center',
  },
  segmentBar: {
    width: '100%',
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  segment: {
    flexBasis: 0,
    minWidth: 2,
  },
  legend: {
    marginTop: SPACING.sm,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  legendValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  noData: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});
