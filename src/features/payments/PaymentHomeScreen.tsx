import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";

import CompactMonthPicker from "@/src/components/dashboard/CompactMonthPicker";
import { COLORS } from "@/src/constants/theme";
import { useAuth } from "@/src/context/AuthContext";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
  type PaymentReceipt,
} from "@/src/services/payments.service";

/** Which document this home page summarises. */
export type HomeKind = "payment" | "deposit";

/**
 * Everything that differs between the payments home and the deposits home.
 *
 * Both are the sales dashboard's layout with payment data in it, so the only
 * difference between the two is wording and where the links go. Keeping that
 * in one table means a layout fix lands on both and they cannot drift.
 */
const KIND = {
  payment: {
    heroCount: "Total Payments",
    recentTitle: "Recent Payments",
    empty: "No recent payments",
    totalLabel: "Total Payments",
    trackingRoute: "/(main)/payments/payment-tracking",
  },
  deposit: {
    heroCount: "Total Deposits",
    recentTitle: "Recent Deposits",
    empty: "No recent deposits",
    totalLabel: "Total Deposits",
    trackingRoute: "/(main)/payments/deposit-tracking",
  },
} satisfies Record<HomeKind, unknown>;

/** One flattened document, from either type. */
interface Row {
  id: number;
  docNo: string;
  party: string;
  amount: number;
  date: string;
  bucket: Bucket;
  /** Approval request id — null until the document has been submitted. */
  approvalId: number | null;
}

/**
 * Three buckets, matching the dashboard's Pending / Approved / Rejected.
 *
 * `rejected` deliberately covers both SAP failure states as well as an
 * approver's rejection: PENDING_ERROR means SAP refused, SAP_UNKNOWN means it
 * never answered. Neither is done, and both need somebody to look.
 */
type Bucket = "pending" | "approved" | "rejected";

const BUCKET_OF: Record<string, Bucket> = {
  DRAFT: "pending",
  PENDING_APPROVAL: "pending",
  POSTING_TO_SAP: "pending",
  APPROVED: "approved",
  POSTED: "approved",
  REJECTED: "rejected",
  PENDING_ERROR: "rejected",
  SAP_UNKNOWN: "rejected",
  // Posted, then reversed in SAP. Not "approved" — the money is no longer
  // recorded there and somebody has to decide what happens next.
  CANCELLED_IN_SAP: "rejected",
};

const money = (value: number) =>
  `₹${(Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

/** Time-of-day greeting, pinned to IST — same derivation as the dashboard. */
const greetingNow = () => {
  const local = new Date();
  const istHour = new Date(
    local.getTime() + local.getTimezoneOffset() * 60000 + 5.5 * 3600000,
  ).getHours();
  if (istHour < 5) return "Good Night";
  if (istHour < 12) return "Good Morning";
  if (istHour < 17) return "Good Afternoon";
  if (istHour < 21) return "Good Evening";
  return "Good Night";
};

const prettyDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Home page for a payments or deposits user.
 *
 * Deliberately the SAME layout as the sales dashboard — hero card, activity
 * grid, recent list — with payment figures in place of order ones. A payments
 * user's home should not look like a different product from a sales user's.
 *
 * Figures are aggregated on the device from the documents already fetched:
 * there is no summary endpoint, and a screen that silently disagreed with the
 * tracking list would be worse than a slightly larger fetch.
 */
export default function PaymentHomeScreen({ kind }: { kind: HomeKind }) {
  const copy = KIND[kind];
  const { user } = useAuth();
  const displayName = user?.name || user?.username || "there";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const flat: Row[] =
          kind === "payment"
            ? (await paymentsService.listReceipts()).map(
                (r: PaymentReceipt) => ({
                  id: r.id,
                  docNo: r.receipt_no,
                  party: r.card_name || r.card_code || "—",
                  amount: Number(r.total_amount) || 0,
                  date: r.payment_date || r.created_at,
                  bucket: BUCKET_OF[r.status] ?? "pending",
                  approvalId: r.approval?.id ?? null,
                }),
              )
            : (await paymentsService.listDeposits()).map((d: BankDeposit) => ({
                id: d.id,
                docNo: d.deposit_no,
                party: d.bank_account_name || "Bank deposit",
                amount: Number(d.deposit_amount) || 0,
                date: d.deposit_date || d.created_at,
                bucket: BUCKET_OF[d.status] ?? "pending",
                approvalId: d.approval?.id ?? null,
              }));
        setRows(flat);
        setError(null);
      } catch (err) {
        // Keep what is on screen during a refresh — blanking a populated page
        // because one refetch failed reads as data loss.
        if (mode === "initial") setRows([]);
        setError(err instanceof Error ? err.message : "Could not load activity.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  // Creating or approving changes these figures, and the user comes straight
  // back here afterwards.
  const hasFocused = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      void load("refresh");
    }, [load]),
  );

  /** Rows inside a period. `month === 0` means the whole year. */
  const inPeriod = useCallback(
    (year: number, month: number) =>
      rows.filter((r) => {
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime())) return false;
        if (d.getFullYear() !== year) return false;
        return month === 0 || d.getMonth() + 1 === month;
      }),
    [rows],
  );

  const current = useMemo(
    () => inPeriod(periodYear, periodMonth),
    [inPeriod, periodYear, periodMonth],
  );

  /** The month before the selected one, for the "vs Jul" comparison. */
  const previous = useMemo(() => {
    if (periodMonth === 0) return null;
    const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
    const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;
    return {
      label: MONTHS_SHORT[prevMonth - 1],
      count: inPeriod(prevYear, prevMonth).length,
    };
  }, [inPeriod, periodYear, periodMonth]);

  const counts = useMemo(() => {
    const acc = { total: current.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of current) acc[r.bucket] += 1;
    return acc;
  }, [current]);

  /** Approved as a share of everything decided. Zero while nothing is. */
  const approvalRate = useMemo(() => {
    const decided = counts.approved + counts.rejected;
    return decided ? Math.round((counts.approved / decided) * 100) : 0;
  }, [counts]);

  const memberSince = useMemo(() => {
    const raw = (user as { created_at?: string } | null)?.created_at;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  }, [user]);

  const recent = useMemo(
    () =>
      [...current]
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 5),
    [current],
  );

  const pctDelta = (value: number, prev: number | undefined) => {
    if (prev === undefined || prev === null) return null;
    if (prev === 0) return value === 0 ? 0 : 100;
    return Math.round(((value - prev) / prev) * 100);
  };

  /**
   * Open the tracking list, optionally on a status.
   *
   * A LABEL is passed rather than a filter value because the underlying value
   * differs by role — an approver's "Pending" is "awaiting me", a creator's is
   * a document status. The tracking screen resolves the label against whichever
   * option list applies to the viewer.
   */
  const openTracking = useCallback(
    (statusLabel?: string) => {
      router.push({
        pathname: copy.trackingRoute,
        // "Total …" is the All view; the rest match their option labels.
        params: statusLabel ? { statusLabel } : {},
      } as never);
    },
    [copy.trackingRoute],
  );

  /**
   * Open the SAME detail screen the tracking cards open, with the same params.
   * Routing somewhere else made one payment look like two different pages
   * depending on where it was opened from.
   */
  const openDetail = useCallback(
    (row: Row) => {
      // Deposits have their own detail screen — see PaymentTrackingScreen.
      if (kind === "deposit") {
        router.push({
          pathname: "/(main)/payments/deposit-details",
          params: { id: String(row.id) },
        } as never);
        return;
      }
      router.push({
        pathname: "/(main)/approval/approval-details",
        params: {
          documentId: String(row.id),
          id: row.approvalId != null ? String(row.approvalId) : "",
          requestNo: row.docNo,
          // Return HERE after acting. Without it a verifier who opened a
          // payment from the home page was dropped on the tracking list
          // afterwards — a screen they never asked for. The action bar
          // itself is decided by permissions, not by this.
          from: "dashboard",
        },
      } as never);
    },
    [kind],
  );

  const activityCards = [
    {
      title: copy.totalLabel,
      statusLabel: "All",
      value: counts.total,
      icon: "document-text",
      color: "#2563EB",
      bg: "#EEF4FF",
      delta: pctDelta(counts.total, previous?.count),
    },
    {
      title: "Pending",
      statusLabel: "Pending",
      value: counts.pending,
      icon: "time",
      color: "#EA8C00",
      bg: "#FFF7ED",
      delta: null,
    },
    {
      title: "Approved",
      statusLabel: "Approved",
      value: counts.approved,
      icon: "checkmark-circle",
      color: "#16A34A",
      bg: "#ECFDF3",
      delta: null,
    },
    {
      title: "Rejected",
      statusLabel: "Rejected",
      value: counts.rejected,
      icon: "close-circle",
      color: "#DC2626",
      bg: "#FEF2F2",
      delta: null,
    },
  ];

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load("refresh")}
        />
      }
    >
      {/* ===== Hero ===== */}
      <LinearGradient
        colors={["#2563EB", "#1E3A8A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.heroDecor} />
        <View style={s.heroTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.heroGreeting}>{greetingNow()},</Text>
            <Text style={s.heroName} numberOfLines={1}>
              {displayName}! 👋
            </Text>
            <View style={s.heroChipRow}>
              {!!user?.role && (
                <View style={s.heroChip}>
                  <Text style={s.heroChipText}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Text>
                </View>
              )}
              {!!user?.company?.name && (
                <View style={s.heroChip}>
                  <Ionicons name="business" size={12} color="#fff" />
                  <Text style={s.heroChipText} numberOfLines={1}>
                    {user.company.name}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={s.heroLogoWrap}>
            <Image
              source={require("../../../assets/images/jivo-official-logo.png")}
              style={s.heroLogo}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={s.heroStatsRow}>
          <View style={s.heroStat}>
            <Ionicons
              name="calendar-outline"
              size={ms(16)}
              color="rgba(255,255,255,0.85)"
            />
            <View style={s.heroStatTextWrap}>
              <Text style={s.heroStatLabel} numberOfLines={1}>
                Member Since
              </Text>
              <Text
                style={s.heroStatValue}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {memberSince}
              </Text>
            </View>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Ionicons
              name="document-text-outline"
              size={ms(16)}
              color="rgba(255,255,255,0.85)"
            />
            <View style={s.heroStatTextWrap}>
              <Text style={s.heroStatLabel} numberOfLines={1}>
                {copy.heroCount}
              </Text>
              <Text style={s.heroStatValue} numberOfLines={1}>
                {counts.total}
              </Text>
            </View>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Ionicons
              name="ribbon-outline"
              size={ms(16)}
              color="rgba(255,255,255,0.85)"
            />
            <View style={s.heroStatTextWrap}>
              <Text style={s.heroStatLabel} numberOfLines={1}>
                Approval Rate
              </Text>
              <Text style={s.heroStatValue} numberOfLines={1}>
                {approvalRate}%
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ===== Your Activity ===== */}
      <View style={s.sectionHeaderRow}>
        <Text style={s.sectionTitle}>Your Activity</Text>
        <CompactMonthPicker
          year={periodYear}
          month={periodMonth}
          onChangeYear={setPeriodYear}
          onChangeMonth={setPeriodMonth}
        />
      </View>

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <View style={s.activityGrid}>
        {activityCards.map((c) => (
          <TouchableOpacity
            key={c.title}
            activeOpacity={0.85}
            onPress={() => openTracking(c.statusLabel)}
            style={[
              s.activityCard,
              { backgroundColor: c.bg, borderColor: `${c.color}22` },
            ]}
          >
            <View style={[s.activityIcon, { backgroundColor: `${c.color}1F` }]}>
              <Ionicons name={c.icon as never} size={18} color={c.color} />
            </View>
            <Text style={s.activityValue}>{c.value}</Text>
            <Text style={s.activityLabel}>{c.title}</Text>
            {c.delta !== null && previous ? (
              <View style={s.deltaRow}>
                <View
                  style={[
                    s.deltaChip,
                    { backgroundColor: c.delta >= 0 ? "#DCFCE7" : "#FEE2E2" },
                  ]}
                >
                  <Ionicons
                    name={c.delta >= 0 ? "arrow-up" : "arrow-down"}
                    size={9}
                    color={c.delta >= 0 ? "#16A34A" : "#DC2626"}
                  />
                  <Text
                    style={[
                      s.deltaChipText,
                      { color: c.delta >= 0 ? "#16A34A" : "#DC2626" },
                    ]}
                  >
                    {Math.abs(c.delta)}%
                  </Text>
                </View>
                <Text style={s.deltaVs}>vs {previous.label}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {/* ===== Recent ===== */}
      <View style={s.card}>
        <View style={s.cardHeaderRow}>
          <Text style={s.cardTitle}>{copy.recentTitle}</Text>
          <TouchableOpacity style={s.linkRow} onPress={() => openTracking()}>
            <Text style={s.linkText}>View all</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {recent.length === 0 ? (
          <Text style={s.emptyText}>{copy.empty}</Text>
        ) : (
          recent.map((row, i) => {
            const pill =
              row.bucket === "rejected"
                ? {
                    color: "#DC2626",
                    bg: "#FEF2F2",
                    icon: "close-circle-outline",
                  }
                : row.bucket === "approved"
                  ? {
                      color: "#16A34A",
                      bg: "#ECFDF3",
                      icon: "checkmark-circle-outline",
                    }
                  : { color: "#EA8C00", bg: "#FFF7ED", icon: "time-outline" };
            return (
              <TouchableOpacity
                key={row.id}
                activeOpacity={0.8}
                onPress={() => openDetail(row)}
                style={[s.recentRow, i > 0 && s.recentRowBordered]}
              >
                <View style={[s.recentIcon, { backgroundColor: pill.bg }]}>
                  <Ionicons
                    name={pill.icon as never}
                    size={18}
                    color={pill.color}
                  />
                </View>
                <View style={s.recentTextWrap}>
                  <Text style={s.recentNumber} numberOfLines={1}>
                    {row.docNo}
                  </Text>
                  <Text style={s.recentParty} numberOfLines={1}>
                    {row.party}
                  </Text>
                </View>
                <View style={s.recentRight}>
                  <Text style={s.recentAmount} numberOfLines={1}>
                    {money(row.amount)}
                  </Text>
                  <Text style={s.recentDate}>{prettyDate(row.date)}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// Mirrors the sales dashboard's `bStyles` so the two homes are visually the
// same page with different data in it.
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: fs(12),
    color: COLORS.error,
    marginHorizontal: sp(16),
    marginBottom: sp(8),
  },

  hero: {
    marginHorizontal: sp(16),
    marginTop: sp(14),
    marginBottom: 6,
    borderRadius: sp(22),
    padding: sp(18),
    overflow: "hidden",
    position: "relative",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  heroDecor: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start" },
  heroGreeting: { fontSize: fs(14), color: "rgba(255,255,255,0.88)" },
  heroName: {
    fontSize: fs(22),
    fontWeight: "800",
    color: "#fff",
    marginTop: 2,
  },
  heroChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(8),
    marginTop: sp(10),
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: sp(11),
    paddingVertical: sp(5),
  },
  heroChipText: { fontSize: fs(11.5), fontWeight: "600", color: "#fff" },
  heroLogoWrap: { marginLeft: sp(8) },
  heroLogo: { width: ms(96), height: ms(52), opacity: 0.95 },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: sp(16),
    paddingTop: sp(14),
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  heroStat: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(7),
  },
  heroStatTextWrap: { flex: 1, minWidth: 0 },
  heroStatDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.22)",
    marginHorizontal: sp(8),
  },
  heroStatLabel: { fontSize: fs(10.5), color: "rgba(255,255,255,0.85)" },
  heroStatValue: {
    fontSize: fs(13.5),
    fontWeight: "800",
    color: "#fff",
    marginTop: 2,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: sp(16),
    marginTop: sp(16),
    marginBottom: sp(10),
    gap: sp(8),
  },
  sectionTitle: {
    fontSize: fs(17),
    fontWeight: "800",
    color: "#0F172A",
    flexShrink: 1,
  },

  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(12),
    marginHorizontal: sp(16),
  },
  activityCard: {
    flexGrow: 1,
    flexBasis: "45%",
    minWidth: ms(140),
    borderRadius: sp(16),
    borderWidth: 1,
    padding: sp(14),
  },
  activityIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sp(10),
  },
  activityValue: { fontSize: fs(22), fontWeight: "800", color: "#0F172A" },
  activityLabel: { fontSize: fs(12.5), color: "#475569", marginTop: 2 },
  deltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(8),
  },
  deltaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: sp(6),
    paddingVertical: sp(2),
  },
  deltaChipText: { fontSize: fs(10), fontWeight: "800" },
  deltaVs: { fontSize: fs(10.5), color: "#94A3B8" },

  card: {
    backgroundColor: "#fff",
    borderRadius: sp(16),
    marginHorizontal: sp(16),
    marginTop: sp(16),
    padding: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sp(6),
  },
  cardTitle: { fontSize: fs(15.5), fontWeight: "800", color: "#0F172A" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkText: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.primary },

  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(11),
  },
  recentRowBordered: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  recentIcon: {
    width: ms(38),
    height: ms(38),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
  },
  recentTextWrap: { flex: 1, minWidth: 0 },
  recentNumber: { fontSize: fs(13.5), fontWeight: "700", color: "#0F172A" },
  recentParty: { fontSize: fs(12), color: "#64748B", marginTop: 2 },
  recentRight: { alignItems: "flex-end", flexShrink: 0 },
  recentAmount: {
    fontSize: fs(13.5),
    fontWeight: "800",
    color: COLORS.primary,
  },
  recentDate: { fontSize: fs(10.5), color: "#94A3B8", marginTop: 2 },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: 16,
  },
});
