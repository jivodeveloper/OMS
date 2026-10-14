import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS, RADIUS } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import {
  advancePaymentService,
  type ExpenseDashboard,
  type ExpenseRanked,
  type OmsDashboard,
} from "@/src/services/advancePayment.service";
import { fs, ms, sp } from "@/src/utils/responsive";

import { failureDetails, failureMessage } from "../showError";

/**
 * PAYMENTS & EXPENSES — what actually went out, beside what was asked for.
 *
 * TWO SOURCES, ONE QUESTION. The left side is SAP: expense postings that have
 * really happened, which is the only record of money that has left. The right
 * side is OMS: the payment requests this system raised, approved and paid.
 * Read apart they answer nothing — "we approved ₹40 lakh" says nothing about
 * what was spent, and "₹38 lakh was spent" says nothing about what is still
 * coming. Read together they do, which is why one screen carries both.
 *
 * READ ONLY, AND GATED ON ITS OWN KEY (`Expense_Dashboard`). Nothing here
 * opens a request or decides anything; the key says "may look at the whole
 * company's spending", which is a different permission from any of the ones
 * that raise or approve a payment.
 *
 * NOT THE WEB'S BOARD. The web renders this as a rotating wall display for a
 * screen on the office floor — carousels, a twelve-month chart, ten panels.
 * A phone is read held in one hand by somebody checking a figure, so the same
 * data is a scrollable column here: the headline numbers, then each breakdown
 * ranked largest first. The numbers and their names are identical; only the
 * arrangement differs.
 *
 * THE PERIOD IS THE ONE CONTROL. Everything is "for the chosen period",
 * including the comparison, which the server works out against the same
 * number of days immediately before — so "+12%" always means against a
 * like-for-like stretch, never against a calendar month of a different length.
 */

/** Periods worth one tap. `from` empty means "let the server decide". */
const PRESETS = [
  { key: "month", label: "This month" },
  { key: "prev", label: "Last month" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** `{from, to}` for a preset, worked out on the device's own calendar. */
function rangeFor(preset: PresetKey): { from: string; to: string } {
  const today = new Date();
  if (preset === "month") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  }
  if (preset === "prev") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  const days = preset === "7d" ? 7 : 30;
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  return { from: iso(from), to: iso(today) };
}

/**
 * Money as a reader scans it: ₹1.2 Cr, ₹3.4 L, ₹5,600.
 *
 * Full rupees on a dashboard of crores is a wall of digits nobody compares;
 * the exact figure belongs on the request, not here.
 */
function money(value: number): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/** "+12.4%" / "-3.1%", or "—" when the period before had nothing to compare. */
function changeLabel(change: number | null | undefined): string {
  if (change === null || change === undefined || !Number.isFinite(change)) return "—";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

/**
 * A headline figure.
 *
 * `change` is coloured by DIRECTION ONLY where it means something: spending
 * more is not automatically bad and this screen does not pretend to judge it,
 * so the arrow says which way and the reader decides.
 */
function Kpi({
  label,
  value,
  hint,
  change,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number | null;
}) {
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {change !== undefined ? (
        <View style={styles.kpiChangeRow}>
          <Ionicons
            name={up ? "arrow-up" : down ? "arrow-down" : "remove"}
            size={ms(11)}
            color={up ? COLORS.error : down ? COLORS.success : COLORS.textMuted}
          />
          <Text
            style={[
              styles.kpiChange,
              { color: up ? COLORS.error : down ? COLORS.success : COLORS.textMuted },
            ]}
          >
            {changeLabel(change)}
          </Text>
        </View>
      ) : null}
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * One ranked breakdown: the biggest first, with a bar for its share.
 *
 * THE BAR IS RELATIVE TO THE BIGGEST LINE, not to the period's total, because
 * the question being asked is "what dominates this list?" — and against a
 * total, a list of twenty small heads is twenty bars too short to compare.
 * The share of the total is still printed, so nothing is lost.
 */
function Ranked({
  title,
  rows,
  limit = 6,
}: {
  title: string;
  rows: ExpenseRanked[];
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  if (shown.length === 0) return null;
  const biggest = Math.max(...shown.map((r) => Math.abs(r.amount) || 0), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {shown.map((row) => (
        <View key={row.name} style={styles.rankRow}>
          <View style={styles.rankHead}>
            <Text style={styles.rankName} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={styles.rankAmount}>{money(row.amount)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.max(2, (Math.abs(row.amount) / biggest) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.rankMeta}>
            {row.share.toFixed(1)}% of the period
            {row.entries ? ` · ${row.entries} ${row.entries === 1 ? "entry" : "entries"}` : ""}
          </Text>
        </View>
      ))}
      {rows.length > shown.length ? (
        <Text style={styles.rankMore}>…and {rows.length - shown.length} more</Text>
      ) : null}
    </View>
  );
}

export default function ExpenseDashboardScreen() {
  // Reached from the Reports tab, so Back belongs on the page before it.
  useBackToOrigin("/(main)/dashboard");

  const [preset, setPreset] = useState<PresetKey>("month");
  const [side, setSide] = useState<"sap" | "oms">("sap");
  const [expenses, setExpenses] = useState<ExpenseDashboard | null>(null);
  const [oms, setOms] = useState<OmsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const range = useMemo(() => rangeFor(preset), [preset]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError("");
      try {
        /*
         * BOTH SIDES AT ONCE, each settled on its own.
         *
         * The SAP half talks to HANA and can be slow or down; the OMS half is
         * this system's own tables and almost never is. Failing the screen
         * when one of them fails would hide the half that answered — and the
         * OMS half is the one an approver can still act on.
         */
        const [sap, ours] = await Promise.allSettled([
          advancePaymentService.expenseDashboard({ from: range.from, to: range.to }),
          advancePaymentService.omsDashboard({ from: range.from, to: range.to }),
        ]);

        setExpenses(sap.status === "fulfilled" ? sap.value : null);
        setOms(ours.status === "fulfilled" ? ours.value : null);

        if (sap.status === "rejected" && ours.status === "rejected") {
          setError([failureMessage(sap.reason), ...failureDetails(sap.reason)].join(" "));
        } else if (sap.status === "rejected") {
          // Named, not swallowed: "SAP could not be reached" is why half the
          // screen is empty, and it is the server's own sentence.
          setError(failureMessage(sap.reason));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range.from, range.to],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const periodText = expenses?.period || oms?.period;

  return (
    <View style={styles.screen}>
      {/* ── The period, and which side of the board ──────────────────── */}
      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetRow}
        >
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.preset, preset === p.key && styles.presetOn]}
              onPress={() => setPreset(p.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: preset === p.key }}
            >
              <Text style={[styles.presetText, preset === p.key && styles.presetTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sideRow}>
          {(
            [
              { key: "sap", label: "Spent (SAP)" },
              { key: "oms", label: "Requests (OMS)" },
            ] as const
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.side, side === tab.key && styles.sideOn]}
              onPress={() => setSide(tab.key)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: side === tab.key }}
            >
              <Text style={[styles.sideText, side === tab.key && styles.sideTextOn]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.muted}>Reading the period…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {periodText ? (
            <Text style={styles.period}>
              {periodText.from} to {periodText.to} · {periodText.days}{" "}
              {periodText.days === 1 ? "day" : "days"}, against the{" "}
              {periodText.days === 1 ? "day" : `${periodText.days} days`} before
            </Text>
          ) : null}

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={ms(16)} color={COLORS.warning} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {side === "sap" ? (
            expenses ? (
              <>
                <View style={styles.kpiGrid}>
                  <Kpi
                    label="Spent"
                    value={money(expenses.kpis.total)}
                    change={expenses.kpis.change}
                    hint={`was ${money(expenses.kpis.previous)}`}
                  />
                  <Kpi label="Per day" value={money(expenses.kpis.per_day)} />
                  <Kpi label="Direct" value={money(expenses.kpis.direct)} />
                  <Kpi label="Indirect" value={money(expenses.kpis.indirect)} />
                  <Kpi label="Entries" value={String(expenses.kpis.entries)} />
                  <Kpi
                    label="Salary"
                    value={money(expenses.kpis.salary)}
                    // Salary dwarfs everything else, so the server leaves it
                    // out of the total unless asked. Saying which is on screen
                    // is the difference between a figure and a guess.
                    hint={expenses.kpis.salary_included ? "in the total" : "not in the total"}
                  />
                </View>

                {expenses.kpis.top_head ? (
                  <View style={styles.leadCard}>
                    <Text style={styles.leadLabel}>Biggest head</Text>
                    <Text style={styles.leadName} numberOfLines={2}>
                      {expenses.kpis.top_head.name}
                    </Text>
                    <Text style={styles.leadValue}>
                      {money(expenses.kpis.top_head.amount)} ·{" "}
                      {expenses.kpis.top_head.share.toFixed(1)}% of the period
                    </Text>
                  </View>
                ) : null}

                <Ranked title="By budget head" rows={expenses.heads} />
                <Ranked title="By category" rows={expenses.categories} />
                <Ranked title="By account" rows={expenses.accounts} />
                <Ranked title="By branch" rows={expenses.branches} limit={4} />
                <Ranked title="By variety" rows={expenses.varieties} />

                {expenses.largest.length > 0 ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Largest entries</Text>
                    {expenses.largest.slice(0, 8).map((row, index) => (
                      <View
                        key={`${row.trans_id ?? "x"}-${row.doc_num ?? index}`}
                        style={styles.entryRow}
                      >
                        <View style={styles.entryText}>
                          <Text style={styles.entryName} numberOfLines={1}>
                            {row.account || row.budget || "—"}
                          </Text>
                          <Text style={styles.entryMeta} numberOfLines={1}>
                            {[row.date, row.branch, row.category].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <Text style={styles.entryAmount}>{money(row.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>
                SAP&apos;s expenses could not be read for this period.
              </Text>
            )
          ) : oms ? (
            <>
              <View style={styles.kpiGrid}>
                <Kpi
                  label="Raised"
                  value={money(oms.kpis.raised.amount)}
                  change={oms.kpis.raised.change}
                  hint={`${oms.kpis.raised.count} requests`}
                />
                <Kpi
                  label="Paid"
                  value={money(oms.kpis.paid.amount)}
                  change={oms.kpis.paid.change}
                  hint={`${oms.kpis.paid.count} requests`}
                />
                <Kpi
                  label="Pending now"
                  value={money(oms.kpis.pending.amount)}
                  hint={`${oms.kpis.pending.count} waiting · ${oms.kpis.pending.returned} returned`}
                />
                <Kpi
                  label="Rejected"
                  value={money(oms.kpis.rejected.amount)}
                  hint={`${oms.kpis.rejected.count} requests`}
                />
                <Kpi
                  label="Days to pay"
                  value={
                    oms.kpis.days_to_pay === null ? "—" : oms.kpis.days_to_pay.toFixed(1)
                  }
                  hint="raised to paid, average"
                />
              </View>

              <Ranked title="Waiting at" rows={oms.waiting_at} />
              <Ranked title="Waiting on" rows={oms.waiting_on} />
              <Ranked title="By purpose" rows={oms.by_purpose} />
              <Ranked title="By budget head" rows={oms.by_budget} />
              <Ranked title="By type" rows={oms.by_type} limit={5} />
              <Ranked title="Bill or advance" rows={oms.bill_or_advance} limit={3} />
              <Ranked title="By company" rows={oms.by_company} limit={3} />
              <Ranked title="Top payees" rows={oms.top_payees} />

              {oms.oldest.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Waiting longest</Text>
                  {oms.oldest.slice(0, 8).map((row) => (
                    <View key={row.id} style={styles.entryRow}>
                      <View style={styles.entryText}>
                        <Text style={styles.entryName} numberOfLines={1}>
                          {row.request_no} · {row.payee || "—"}
                        </Text>
                        <Text style={styles.entryMeta} numberOfLines={1}>
                          {[row.stage, row.waiting_on, row.company].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      <Text style={styles.entryAmount}>{money(row.amount)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>The OMS side could not be read for this period.</Text>
          )}

          <View style={{ height: sp(90) }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  controls: {
    paddingTop: sp(8),
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  presetRow: { paddingHorizontal: sp(12), gap: sp(6), paddingBottom: sp(8) },
  preset: {
    paddingHorizontal: sp(12),
    paddingVertical: sp(6),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  presetOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  presetText: { fontSize: fs(11.5), fontWeight: "700", color: COLORS.textSecondary },
  presetTextOn: { color: "#fff" },

  sideRow: { flexDirection: "row", paddingHorizontal: sp(12), paddingBottom: sp(8), gap: sp(8) },
  side: {
    flex: 1,
    paddingVertical: sp(8),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
  },
  sideOn: { backgroundColor: "#E8F0FE", borderColor: COLORS.primary },
  sideText: { fontSize: fs(12), fontWeight: "700", color: COLORS.textSecondary },
  sideTextOn: { color: COLORS.primary },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: sp(10) },
  muted: { fontSize: fs(12.5), color: COLORS.textSecondary, textAlign: "center" },

  content: { padding: sp(12), gap: sp(10) },
  period: { fontSize: fs(11), color: COLORS.textSecondary },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    padding: sp(10),
    borderRadius: RADIUS.md,
    backgroundColor: "#FEF3C7",
  },
  errorText: { flex: 1, minWidth: 0, fontSize: fs(12), color: "#92400E" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(8) },
  kpi: {
    // Two to a row at any width, without measuring: half the row less the gap.
    flexBasis: "48%",
    flexGrow: 1,
    padding: sp(10),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  kpiLabel: {
    fontSize: fs(10),
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: COLORS.textSecondary,
  },
  kpiValue: { fontSize: fs(18), fontWeight: "900", color: COLORS.text, marginTop: 2 },
  kpiChangeRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  kpiChange: { fontSize: fs(11), fontWeight: "800" },
  kpiHint: { fontSize: fs(10.5), color: COLORS.textMuted, marginTop: 1 },

  leadCard: {
    padding: sp(12),
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  leadLabel: {
    fontSize: fs(10),
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
  },
  leadName: { fontSize: fs(15), fontWeight: "900", color: "#fff", marginTop: 2 },
  leadValue: { fontSize: fs(12), color: "rgba(255,255,255,0.9)", marginTop: 2 },

  card: {
    padding: sp(12),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    gap: sp(8),
  },
  cardTitle: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },

  rankRow: { gap: 3 },
  rankHead: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  // `minWidth: 0` so a long head name is cut rather than pushing the amount off.
  rankName: { flex: 1, minWidth: 0, fontSize: fs(12.5), fontWeight: "600", color: COLORS.text },
  rankAmount: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.text },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.borderLight,
    overflow: "hidden",
  },
  barFill: { height: 5, borderRadius: 3, backgroundColor: COLORS.primary },
  rankMeta: { fontSize: fs(10.5), color: COLORS.textSecondary },
  rankMore: { fontSize: fs(11), color: COLORS.textMuted, fontStyle: "italic" },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(6),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  entryText: { flex: 1, minWidth: 0 },
  entryName: { fontSize: fs(12.5), fontWeight: "600", color: COLORS.text },
  entryMeta: { fontSize: fs(10.5), color: COLORS.textSecondary, marginTop: 1 },
  entryAmount: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
});
