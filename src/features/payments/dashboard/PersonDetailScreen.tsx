import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsDashboardService, {
  type DatePreset,
  type PersonDetail,
} from "@/src/services/paymentsDashboard.service";

import DonutCard from "./DonutCard";
import { compactMoney, initials, money, prettyDate } from "./format";

/**
 * One participant's collection history.
 *
 * Reached from a row in the dashboard's Collection Performance list, and given
 * the SAME company and date window as the screen behind it — otherwise the
 * totals here would not reconcile with the row that was tapped, which is the
 * first thing anyone checks.
 */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={s.statValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {money(value)}
      </Text>
      {!!hint && <Text style={s.statHint}>{hint}</Text>}
    </View>
  );
}

/** Collected vs banked per day. Two bars per day on a shared scale — drawn
 *  with plain views because that is all it is, and the series is already
 *  capped server-side at a quarter. */
function Timeline({ points }: { points: PersonDetail["timeline"] }) {
  const peak = Math.max(
    ...points.map((p) => Math.max(p.received, p.deposited)),
    0,
  );
  if (!points.length || !peak) return null;

  return (
    <View style={s.card}>
      <View style={s.timelineHead}>
        <Text style={s.cardTitle}>Collection Timeline</Text>
        <View style={s.timelineLegend}>
          <View style={[s.legendDot, { backgroundColor: "#2563EB" }]} />
          <Text style={s.legendText}>Collected</Text>
          <View style={[s.legendDot, { backgroundColor: "#16A34A" }]} />
          <Text style={s.legendText}>Banked</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.timeline}
      >
        {points.map((point) => (
          <View style={s.day} key={point.date}>
            <View style={s.dayBars}>
              <View
                style={[
                  s.dayBar,
                  s.barBlue,
                  { height: `${Math.max((point.received / peak) * 100, 1)}%` },
                ]}
              />
              <View
                style={[
                  s.dayBar,
                  s.barGreen,
                  { height: `${Math.max((point.deposited / peak) * 100, 1)}%` },
                ]}
              />
            </View>
            <Text style={s.dayLabel}>{point.date.slice(8)}</Text>
          </View>
        ))}
      </ScrollView>

      <Text style={s.timelineScale}>Peak day {compactMoney(peak)}</Text>
    </View>
  );
}

export default function PersonDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    name?: string;
    company?: string;
    preset?: string;
  }>();

  const kind = params.kind === "user" ? "user" : "person";
  const id = Number(params.id || 0);

  const [data, setData] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await paymentsDashboardService.person(kind, id, {
        company: params.company || "",
        preset: (params.preset as DatePreset) || undefined,
      });
      setData(result);
    } catch (err: any) {
      setError(
        err?.response?.status === 404
          ? "That person no longer exists."
          : "Could not load this person. Pull down to try again.",
      );
    }
  }, [kind, id, params.company, params.preset]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const name = data?.person.name || params.name || "Person";
  const rangeText = data?.filters.date_from
    ? data.filters.date_from === data.filters.date_to
      ? prettyDate(data.filters.date_from)
      : `${prettyDate(data.filters.date_from)} – ${prettyDate(data.filters.date_to)}`
    : "";

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[COLORS.primary]}
          tintColor={COLORS.primary}
        />
      }
    >
      <LinearGradient
        colors={[COLORS.gradientEnd, COLORS.gradientStart]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <Pressable
          style={s.back}
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={ms(20)} color="#FFFFFF" />
        </Pressable>

        <View style={s.heroBody}>
          <View style={s.heroAvatar}>
            <Text style={s.heroAvatarText}>{initials(name)}</Text>
          </View>
          <View style={s.heroText}>
            <Text style={s.heroName} numberOfLines={1}>
              {name}
            </Text>
            {!!data && (
              <Text style={s.heroSub} numberOfLines={1}>
                {data.person.subtitle}
                {data.person.code ? ` · ${data.person.code}` : ""}
              </Text>
            )}
            {!!rangeText && <Text style={s.heroRange}>{rangeText}</Text>}
          </View>
        </View>
      </LinearGradient>

      {!!error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={ms(18)} color="#B91C1C" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {data && (
        <>
          <View style={s.statGrid}>
            <Stat
              label="Total Collected"
              value={data.kpis.received_total}
              hint={`${data.kpis.received_count} receipt${data.kpis.received_count === 1 ? "" : "s"}`}
            />
            <Stat
              label="Total Deposits"
              value={data.kpis.deposit_total}
              hint={`${data.kpis.deposit_count} deposit${data.kpis.deposit_count === 1 ? "" : "s"}`}
            />
            <Stat label="Against Invoice" value={data.kpis.against_invoice} />
            <Stat label="Advance" value={data.kpis.advance_payment} />
          </View>

          {data.charts.received.total > 0 && (
            <DonutCard
              title="Invoice vs Advance"
              subtitle="How this person's collections were applied"
              series={data.charts.received}
              centerLabel="Collected"
            />
          )}

          {data.charts.methods.total > 0 && (
            <DonutCard
              title="Payment Method Breakdown"
              subtitle="Tenders this person handled"
              series={data.charts.methods}
              centerLabel="Collected"
            />
          )}

          <Timeline points={data.timeline} />

          <View style={s.card}>
            <Text style={s.cardTitle}>Recent Activities</Text>
            {data.recent_activity.length === 0 ? (
              <Text style={s.none}>Nothing recorded in this period.</Text>
            ) : (
              data.recent_activity.map((event) => (
                <View style={s.activity} key={`${event.kind}-${event.id}`}>
                  <View
                    style={[
                      s.activityIcon,
                      event.kind === "RECEIPT" ? s.iconBlue : s.iconGreen,
                    ]}
                  >
                    <Ionicons
                      name={
                        event.kind === "RECEIPT"
                          ? "download-outline"
                          : "business-outline"
                      }
                      size={ms(15)}
                      color={event.kind === "RECEIPT" ? "#2563EB" : "#16A34A"}
                    />
                  </View>
                  <View style={s.activityBody}>
                    <Text style={s.activityRef} numberOfLines={1}>
                      {event.reference}
                    </Text>
                    <Text style={s.activityParty} numberOfLines={1}>
                      {event.party}
                    </Text>
                  </View>
                  <View style={s.activityMeta}>
                    <Text style={s.activityAmount}>{money(event.amount)}</Text>
                    <Text style={s.activityDate}>
                      {prettyDate(event.date)} · {event.detail}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: sp(30) },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },

  hero: {
    paddingHorizontal: sp(16),
    paddingTop: sp(16),
    paddingBottom: sp(20),
    borderBottomLeftRadius: sp(20),
    borderBottomRightRadius: sp(20),
  },
  back: { width: ms(32), height: ms(32), justifyContent: "center" },
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(12),
    marginTop: sp(6),
  },
  heroAvatar: {
    width: ms(50),
    height: ms(50),
    borderRadius: ms(25),
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { color: "#FFFFFF", fontSize: fs(17), fontWeight: "800" },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { color: "#FFFFFF", fontSize: fs(18), fontWeight: "800" },
  heroSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: fs(11.5),
    marginTop: sp(2),
  },
  heroRange: {
    color: "rgba(255,255,255,0.92)",
    fontSize: fs(11),
    fontWeight: "700",
    marginTop: sp(5),
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginHorizontal: sp(14),
    marginTop: sp(14),
    padding: sp(12),
    borderRadius: sp(10),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { flex: 1, color: "#B91C1C", fontSize: fs(12), fontWeight: "600" },

  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(10),
    paddingHorizontal: sp(14),
    marginTop: sp(14),
  },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: sp(12),
    borderRadius: sp(13),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  statLabel: { fontSize: fs(10.5), fontWeight: "700", color: "#64748B" },
  statValue: {
    fontSize: fs(16),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: sp(3),
  },
  statHint: { fontSize: fs(10), color: "#94A3B8", marginTop: sp(2) },

  card: {
    marginHorizontal: sp(14),
    marginTop: sp(12),
    padding: sp(14),
    borderRadius: sp(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  cardTitle: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },

  timelineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: sp(6),
  },
  timelineLegend: { flexDirection: "row", alignItems: "center", gap: sp(5) },
  legendDot: { width: ms(8), height: ms(8), borderRadius: ms(4) },
  legendText: { fontSize: fs(10), color: "#64748B", marginRight: sp(4) },

  timeline: { alignItems: "flex-end", gap: sp(6), height: ms(110), paddingTop: sp(12) },
  day: { alignItems: "center", gap: sp(5), height: "100%", width: ms(26) },
  dayBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: sp(2),
    flex: 1,
  },
  dayBar: { width: ms(8), borderRadius: sp(2) },
  barBlue: { backgroundColor: "#2563EB" },
  barGreen: { backgroundColor: "#16A34A" },
  dayLabel: { fontSize: fs(9), color: "#94A3B8" },
  timelineScale: {
    fontSize: fs(10),
    color: "#94A3B8",
    marginTop: sp(8),
    textAlign: "right",
  },

  none: {
    fontSize: fs(12),
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: sp(18),
  },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(10),
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  activityIcon: {
    width: ms(32),
    height: ms(32),
    borderRadius: sp(9),
    alignItems: "center",
    justifyContent: "center",
  },
  iconBlue: { backgroundColor: "#EFF6FF" },
  iconGreen: { backgroundColor: "#ECFDF5" },
  activityBody: { flex: 1, minWidth: 0 },
  activityRef: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text },
  activityParty: { fontSize: fs(10.5), color: "#94A3B8", marginTop: sp(1) },
  activityMeta: { alignItems: "flex-end" },
  activityAmount: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.text },
  activityDate: { fontSize: fs(9.5), color: "#94A3B8", marginTop: sp(1) },
});
