import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { PieChart } from "react-native-gifted-charts";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { ChartSeries } from "@/src/services/paymentsDashboard.service";
import { compactMoney, money, SLICE_COLORS } from "./format";

/**
 * One donut plus its interactive legend.
 *
 * `react-native-gifted-charts` is the app's existing chart library (see
 * StatusPieChart); recharts and chart.js are in package.json but are web-only
 * and unused here.
 *
 * There is no hover on a phone, so the web's hover tooltip becomes a tap: tap a
 * slice or a legend row and the centre of the donut shows that slice's amount
 * and share. Tapping the selected one again clears it. A long press on a legend
 * row hides the series, re-scaling the rest — the touch equivalent of the web's
 * clickable legend.
 */

export default function DonutCard({
  title,
  subtitle,
  series,
  centerLabel,
  loading,
}: {
  title: string;
  subtitle: string;
  series: ChartSeries;
  centerLabel: string;
  loading?: boolean;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => series.slices.filter((slice) => !hidden.has(slice.key)),
    [series.slices, hidden],
  );

  // Recomputed from what is actually drawn, so the centre total and the legend
  // percentages agree with the arcs after a series is switched off.
  const shownTotal = useMemo(
    () => visible.reduce((sum, slice) => sum + slice.amount, 0),
    [visible],
  );

  const colorFor = (key: string) => {
    const index = series.slices.findIndex((slice) => slice.key === key);
    return SLICE_COLORS[(index < 0 ? 0 : index) % SLICE_COLORS.length];
  };

  // Zero-amount slices are dropped: the library draws them as a hairline that
  // still takes a tap, producing a selection for something invisible.
  const chartData = useMemo(
    () =>
      visible
        .filter((slice) => slice.amount > 0)
        .map((slice) => ({
          value: slice.amount,
          color: colorFor(slice.key),
          focused: focused === slice.key,
          // Carried through so onPress can identify the slice.
          text: slice.key,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, focused, series.slices],
  );

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setFocused(null);
  };

  const selected = focused
    ? series.slices.find((slice) => slice.key === focused)
    : null;
  const selectedPercent =
    selected && shownTotal ? (selected.amount / shownTotal) * 100 : 0;

  const hasData = series.slices.some((slice) => slice.amount > 0);

  return (
    <View style={s.card}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>

      {loading ? (
        <View style={s.skelWrap}>
          <View style={s.skelDonut} />
          <View style={s.skelLegend}>
            <View style={s.skelLine} />
            <View style={s.skelLine} />
            <View style={s.skelLine} />
          </View>
        </View>
      ) : !hasData ? (
        <View style={s.empty}>
          <Ionicons name="pie-chart-outline" size={ms(30)} color="#CBD5E1" />
          <Text style={s.emptyTitle}>No data in this period</Text>
          <Text style={s.emptyHint}>Try a wider date range.</Text>
        </View>
      ) : (
        <View style={s.body}>
          <View style={s.chartWrap}>
            <PieChart
              data={chartData}
              donut
              isThreeD={false}
              shadow={false}
              radius={ms(72)}
              innerRadius={ms(46)}
              strokeWidth={2}
              strokeColor={COLORS.surface}
              innerCircleColor={COLORS.surface}
              innerCircleBorderWidth={0}
              focusOnPress
              onPress={(item: { text?: string }) =>
                setFocused((current) =>
                  current === item?.text ? null : (item?.text ?? null),
                )
              }
              centerLabelComponent={() => (
                <View style={s.center}>
                  <Text
                    style={s.centerValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {compactMoney(selected ? selected.amount : shownTotal)}
                  </Text>
                  <Text style={s.centerLabel} numberOfLines={2}>
                    {selected
                      ? `${selected.label} · ${selectedPercent.toFixed(1)}%`
                      : centerLabel}
                  </Text>
                </View>
              )}
            />
          </View>

          <View style={s.legend}>
            {series.slices.map((slice) => {
              const off = hidden.has(slice.key);
              const percent =
                off || !shownTotal ? 0 : (slice.amount / shownTotal) * 100;
              return (
                <Pressable
                  key={slice.key}
                  style={[s.legendRow, off && s.legendRowOff]}
                  onPress={() =>
                    setFocused((current) =>
                      current === slice.key ? null : slice.key,
                    )
                  }
                  onLongPress={() => toggleHidden(slice.key)}
                  delayLongPress={280}
                  accessibilityLabel={`${slice.label}, ${money(slice.amount)}, ${percent.toFixed(1)} percent. Long press to ${off ? "show" : "hide"}.`}
                >
                  <View
                    style={[s.dot, { backgroundColor: colorFor(slice.key) }]}
                  />
                  <View style={s.legendText}>
                    <Text style={s.legendLabel} numberOfLines={1}>
                      {slice.label}
                    </Text>
                    <Text style={s.legendValue} numberOfLines={1}>
                      {money(slice.amount)}
                      <Text style={s.legendPct}>
                        {"  "}
                        {percent.toFixed(1)}%
                      </Text>
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: sp(14),
    marginTop: sp(12),
    padding: sp(14),
    borderRadius: sp(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  title: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },
  subtitle: { fontSize: fs(11), color: "#94A3B8", marginTop: sp(2) },

  body: { alignItems: "center", marginTop: sp(12) },
  chartWrap: { alignItems: "center", justifyContent: "center" },

  // Capped to the hole, not just padded: the inner radius is ms(46), so the
  // gap is ~92px across and a selected slice's label ("Mixed (cash + cheque) ·
  // 100.0%") would otherwise run out over the ring. ms(76) keeps a margin
  // inside the circle on both sides at any font scale.
  center: {
    alignItems: "center",
    justifyContent: "center",
    width: ms(76),
    paddingHorizontal: sp(4),
  },
  centerValue: {
    fontSize: fs(14),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  centerLabel: {
    fontSize: fs(9.5),
    color: "#94A3B8",
    textAlign: "center",
    marginTop: sp(1),
  },

  legend: { width: "100%", marginTop: sp(12), gap: sp(2) },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(9),
    paddingVertical: sp(7),
    paddingHorizontal: sp(8),
    borderRadius: sp(9),
  },
  // Greyed rather than removed, so the user can see what they switched off and
  // press it back on.
  legendRowOff: { opacity: 0.42 },
  dot: { width: ms(10), height: ms(10), borderRadius: sp(3) },
  legendText: { flex: 1, minWidth: 0 },
  legendLabel: { fontSize: fs(12), fontWeight: "700", color: COLORS.text },
  legendValue: { fontSize: fs(11), color: "#475569", marginTop: sp(1) },
  legendPct: { color: "#94A3B8" },

  empty: { alignItems: "center", paddingVertical: sp(26) },
  emptyTitle: {
    fontSize: fs(12.5),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: sp(8),
  },
  emptyHint: { fontSize: fs(11), color: "#94A3B8", marginTop: sp(2) },

  skelWrap: { alignItems: "center", marginTop: sp(14) },
  skelDonut: {
    width: ms(144),
    height: ms(144),
    borderRadius: ms(72),
    backgroundColor: "#EEF1F6",
  },
  skelLegend: { width: "100%", marginTop: sp(14), gap: sp(9) },
  skelLine: { height: ms(11), borderRadius: 4, backgroundColor: "#EEF1F6" },
});
