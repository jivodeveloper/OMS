import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';
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
}

export default function DonutChart({
  data,
  size = 140,
  strokeWidth = 18,
  centerLabel,
  centerValue,
  valuePrefix = '',
  maxLegendItems,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noData}>No data</Text>
      </View>
    );
  }

  const nonZeroData = data.filter((d) => d.value > 0);

  let accumulated = 0;
  const segments = nonZeroData.map((segment) => {
    const percentage = segment.value / total;
    const strokeDasharray = `${circumference * percentage} ${circumference * (1 - percentage)}`;
    const rotation = (accumulated / total) * 360 - 90;
    accumulated += segment.value;
    return { ...segment, strokeDasharray, rotation };
  });

  return (
    <View style={styles.container}>
      <View style={{ position: 'relative', width: size, height: size, alignSelf: 'center' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {segments.map((seg, i) => (
            <Circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={seg.strokeDasharray}
              strokeLinecap="round"
              rotation={seg.rotation}
              origin={`${center}, ${center}`}
            />
          ))}
        </Svg>
        {/* Center text */}
        <View style={[styles.centerText, { width: size, height: size }]} pointerEvents="none">
          <Text style={styles.centerValue}>{centerValue}</Text>
          {centerLabel && (
            <Text style={styles.centerLabel} numberOfLines={1}>
              {centerLabel}
            </Text>
          )}
        </View>
      </View>

      {/* Legend */}
      {(() => {
        const scrollable = maxLegendItems != null && data.length > maxLegendItems;
        const itemHeight = 26;
        const legendContent = data.map((d, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: d.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={styles.legendValue}>
              {valuePrefix}{d.value}
            </Text>
          </View>
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
  centerText: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
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
