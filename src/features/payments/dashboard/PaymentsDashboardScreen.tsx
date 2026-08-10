import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsDashboardService, {
  DATE_PRESETS,
  DEFAULT_PRESET,
  type CollectionRow,
  type DashboardCompany,
  type DashboardData,
  type DatePreset,
  type SortField,
} from "@/src/services/paymentsDashboard.service";

import DonutCard from "./DonutCard";
import KpiCard from "./KpiCard";
import { money } from "./format";

/**
 * Payments Dashboard — Analytics, on mobile.
 *
 * One screen, no tabs: the phone shows the same figures as the web Analytics
 * tab, stacked vertically. Everything comes from `/api/payments/dashboard/`,
 * which requires the `Payments_Dashboard` permission.
 *
 * The participants list is the screen's FlatList rather than a list nested in a
 * ScrollView — nesting two scrollers of the same orientation breaks
 * virtualisation and RN warns about it. Everything above the list is the
 * list's `ListHeaderComponent`, so the whole page scrolls as one surface and
 * the rows still recycle.
 */

const PAGE_SIZE = 20;

const EMPTY: DashboardData = {
  filters: {
    company: "",
    preset: DEFAULT_PRESET,
    date_from: "",
    date_to: "",
  },
  kpis: {
    total_payments: 0,
    total_payments_count: 0,
    deposit_total: 0,
    deposit_collected: 0,
    deposit_count: 0,
    received_total: 0,
    received_count: 0,
    against_invoice: 0,
    against_invoice_count: 0,
    advance_payment: 0,
    advance_count: 0,
    pending_receipts: 0,
    pending_receipts_count: 0,
    pending_deposits: 0,
    pending_deposits_count: 0,
    blocked_total: 0,
    blocked_count: 0,
  },
  charts: {
    received: { total: 0, slices: [] },
    methods: { total: 0, slices: [] },
    deposits: { total: 0, slices: [] },
  },
  collection_performance: {
    results: [],
    pagination: { page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 0 },
  },
};

const SORTS: { value: SortField; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "received", label: "Received" },
  { value: "deposited", label: "Deposited" },
  { value: "name", label: "Name" },
];

function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** A bottom sheet of options. Used for both filters and the sort picker —
 *  three near-identical pickers would otherwise be three sets of styles. */
function PickerSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  selected: T;
  onPick: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.sheetGrip} />
          <Text style={s.sheetTitle}>{title}</Text>
          {options.map((option) => {
            const active = option.value === selected;
            return (
              <Pressable
                key={option.value}
                style={[s.sheetRow, active && s.sheetRowActive]}
                onPress={() => {
                  onPick(option.value);
                  onClose();
                }}
              >
                <Text style={[s.sheetLabel, active && s.sheetLabelActive]}>
                  {option.label}
                </Text>
                {active && (
                  <Ionicons
                    name="checkmark"
                    size={ms(18)}
                    color={COLORS.primary}
                  />
                )}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PersonRow({
  row,
  onPress,
}: {
  row: CollectionRow;
  onPress: (row: CollectionRow) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.personRow, pressed && s.personRowPressed]}
      onPress={() => onPress(row)}
      android_ripple={{ color: "#E2E8F0" }}
    >
      <View
        style={[s.avatar, row.kind === "user" ? s.avatarUser : s.avatarPerson]}
      >
        <Text
          style={[
            s.avatarText,
            row.kind === "user" ? s.avatarTextUser : s.avatarTextPerson,
          ]}
        >
          {initials(row.name)}
        </Text>
      </View>

      <View style={s.personBody}>
        <View style={s.personTop}>
          <Text style={s.personName} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={s.personTotal}>{money(row.total)}</Text>
        </View>

        {/* What this person did, so a zero-amount row still explains itself. */}
        <Text style={s.personRoles} numberOfLines={1}>
          {row.role_labels.join(" · ")}
        </Text>

        <View style={s.barRow}>
          <Text style={s.barLabel}>Received</Text>
          <View style={s.barTrack}>
            <View
              style={[
                s.barFill,
                s.barBlue,
                { width: `${row.received_percent}%` },
              ]}
            />
          </View>
          <Text style={s.barValue}>{money(row.received)}</Text>
        </View>

        <View style={s.barRow}>
          <Text style={s.barLabel}>Deposited</Text>
          <View style={s.barTrack}>
            <View
              style={[
                s.barFill,
                s.barGreen,
                { width: `${row.deposit_percent}%` },
              ]}
            />
          </View>
          <Text style={s.barValue}>{money(row.deposited)}</Text>
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={ms(18)}
        color={COLORS.textLight ?? "#94A3B8"}
      />
    </Pressable>
  );
}

export default function PaymentsDashboardScreen() {
  const router = useRouter();

  const [company, setCompany] = useState("");
  // Last 30 Days by default, matching the web and analytics.DEFAULT_PRESET.
  const [preset, setPreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortField>("total");

  const [data, setData] = useState<DashboardData>(EMPTY);
  const [people, setPeople] = useState<CollectionRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [companies, setCompanies] = useState<DashboardCompany[]>([]);
  const [sheet, setSheet] = useState<"company" | "preset" | "sort" | null>(null);

  useEffect(() => {
    paymentsDashboardService
      .listCompanies()
      .then(setCompanies)
      // A failed company list must not block the dashboard: "All Companies"
      // still works, and that is the default.
      .catch(() => setCompanies([]));
  }, []);

  // One request per pause in typing, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({ company, preset, search: debouncedSearch, sort }),
    [company, preset, debouncedSearch, sort],
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await paymentsDashboardService.get({
        ...query,
        page: 1,
        page_size: PAGE_SIZE,
      });
      setData(result);
      setPeople(result.collection_performance.results);
      setPage(1);
      setHasMore(result.collection_performance.pagination.total_pages > 1);
    } catch (err: any) {
      setError(
        err?.response?.status === 403
          ? "You do not have permission to view the payments dashboard."
          : "Could not load the dashboard. Pull down to try again.",
      );
    }
  }, [query]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await paymentsDashboardService.collectionPerformance({
        ...query,
        page: next,
        page_size: PAGE_SIZE,
      });
      // Appended by key, because a row arriving twice (a page boundary moving
      // as data changes) would otherwise duplicate in the list.
      setPeople((current) => {
        const seen = new Set(current.map((r) => r.key));
        return [...current, ...result.results.filter((r) => !seen.has(r.key))];
      });
      setPage(next);
      setHasMore(next < result.pagination.total_pages);
    } catch {
      // Silent: the rows already shown remain valid, and a toast for a failed
      // scroll-append is more disruptive than simply not growing.
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, page, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openPerson = useCallback(
    (row: CollectionRow) => {
      router.push({
        pathname: "/(main)/payments/dashboard-person",
        params: {
          kind: row.kind,
          id: String(row.id),
          name: row.name,
          company,
          preset,
        },
      });
    },
    [router, company, preset],
  );

  const { kpis, charts, filters } = data;

  const companyLabel =
    companies.find((c) => c.company === company)?.display_name ||
    (company || "All Companies");
  // Falls back to the default preset's own label rather than a hardcoded one,
  // so the two cannot drift apart the next time the default changes.
  const presetLabel =
    DATE_PRESETS.find((p) => p.value === preset)?.label ??
    DATE_PRESETS.find((p) => p.value === DEFAULT_PRESET)?.label ??
    "";
  const rangeText = filters.date_from
    ? filters.date_from === filters.date_to
      ? prettyDate(filters.date_from)
      : `${prettyDate(filters.date_from)} – ${prettyDate(filters.date_to)}`
    : "";

  const header = (
    <View>
      {/* --- Hero: title + the window everything below covers ----------- */}
      <LinearGradient
        colors={[COLORS.gradientEnd, COLORS.gradientStart]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <Text style={s.heroTitle}>Payments Dashboard</Text>
        <Text style={s.heroSub}>Analytics</Text>
        {!!rangeText && <Text style={s.heroRange}>{rangeText}</Text>}
      </LinearGradient>

      {/* --- Filters ---------------------------------------------------- */}
      <View style={s.filters}>
        <Pressable style={s.filter} onPress={() => setSheet("company")}>
          <Text style={s.filterLabel}>Company</Text>
          <View style={s.filterValueRow}>
            <Text style={s.filterValue} numberOfLines={1}>
              {companyLabel}
            </Text>
            <Ionicons name="chevron-down" size={ms(14)} color="#64748B" />
          </View>
        </Pressable>

        <Pressable style={s.filter} onPress={() => setSheet("preset")}>
          <Text style={s.filterLabel}>Date Range</Text>
          <View style={s.filterValueRow}>
            <Text style={s.filterValue} numberOfLines={1}>
              {presetLabel}
            </Text>
            <Ionicons name="chevron-down" size={ms(14)} color="#64748B" />
          </View>
        </Pressable>
      </View>

      {!!error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={ms(18)} color="#B91C1C" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* --- KPI cards: settled in SAP -------------------------------- */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionTitle}>Posted to SAP</Text>
        <Text style={s.sectionHint}>Settled in the books of record</Text>
      </View>

      {/* Four cards, not five: "Total Payments" was removed because it summed
          the same posted receipts as Received Total and always showed an
          identical figure — two cards answering one question. */}
      <View style={s.kpiGrid}>
        <KpiCard
          label="Deposit Total"
          value={kpis.deposit_total}
          hint={`${kpis.deposit_count} posted`}
          info="Deposits posted to SAP — money confirmed into company bank accounts. Measured by the amount banked, so any shortfall against what was collected is excluded."
          icon="business-outline"
          tone="green"
          loading={loading}
        />
        <KpiCard
          label="Received Total"
          value={kpis.received_total}
          hint={`${kpis.received_count} settled`}
          info="Amount received from customers and confirmed in SAP. Anything not yet posted — including receipts SAP refused — appears under Not Yet in SAP instead."
          icon="download-outline"
          tone="amber"
          loading={loading}
        />
        <KpiCard
          label="Against Invoice"
          value={kpis.against_invoice}
          hint={`${kpis.against_invoice_count} allocated`}
          info="Posted payments applied to customer invoices rather than taken on account. With Advance Payment this adds up to Received Total."
          icon="receipt-outline"
          tone="violet"
          loading={loading}
        />
        <KpiCard
          label="Advance Payment"
          value={kpis.advance_payment}
          hint={`${kpis.advance_count} on account`}
          info="Posted payments with no invoice allocation — money taken on account, to be applied to an invoice later."
          icon="trending-up-outline"
          tone="sky"
          loading={loading}
        />
      </View>

      {/* --- KPI cards: raised but not settled -------------------------
          Restricting the figures above to posted documents makes them
          trustworthy but would otherwise hide real work. These say what the
          posted totals are NOT counting. */}
      <View style={s.sectionLabel}>
        <Text style={s.sectionTitle}>Not Yet in SAP</Text>
        <Text style={s.sectionHint}>
          Created but not settled — excluded from the totals above
        </Text>
      </View>

      <View style={s.kpiGrid}>
        <KpiCard
          label="Pending Payments"
          value={kpis.pending_receipts}
          hint={`${kpis.pending_receipts_count} not posted`}
          info="Payment receipts raised but not settled in SAP: draft, awaiting approval, mid-post, refused by SAP, or unconfirmed. Rejected and cancelled receipts are excluded — nothing is waiting on those."
          icon="time-outline"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          label="Pending Deposits"
          value={kpis.pending_deposits}
          hint={`${kpis.pending_deposits_count} not posted`}
          info="Bank deposits raised but not settled in SAP. Kept separate from pending payments because banking a receipt and recording it are different steps, and adding them would count the same money twice."
          icon="time-outline"
          tone="slate"
          loading={loading}
        />
        <KpiCard
          label="Needs Attention"
          value={kpis.blocked_total}
          hint={`${kpis.blocked_count} stuck`}
          info="The subset of pending work that will not clear on its own: SAP refused the document, or never answered. Everything else advances as the approval chain moves; these need somebody to correct and resubmit, or to reconcile."
          icon="alert-circle-outline"
          tone="red"
          loading={loading}
        />
      </View>

      {/* --- Charts ------------------------------------------------------ */}
      <DonutCard
        title="Received Payments"
        subtitle="Posted receipts: invoice-linked versus on-account"
        series={charts.received}
        centerLabel="Received"
        loading={loading}
      />
      <DonutCard
        title="Payment Methods"
        subtitle="How the posted money arrived"
        series={charts.methods}
        centerLabel="Received"
        loading={loading}
      />
      <DonutCard
        title="Deposit Details"
        subtitle="Posted deposits, by tender"
        series={charts.deposits}
        centerLabel="Deposited"
        loading={loading}
      />

      {/* --- Participants header + controls ------------------------------ */}
      <View style={s.listHead}>
        <Text style={s.listTitle}>Collection Performance</Text>
        <Text style={s.listSub}>
          Everyone who collected, banked, recorded or submitted.
        </Text>

        <View style={s.listTools}>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={ms(15)} color="#94A3B8" />
            <TextInput
              style={s.searchInput}
              placeholder="Search name or code"
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={ms(16)} color="#94A3B8" />
              </Pressable>
            )}
          </View>

          <Pressable style={s.sortBtn} onPress={() => setSheet("sort")}>
            <Ionicons name="swap-vertical" size={ms(15)} color={COLORS.primary} />
            <Text style={s.sortText}>
              {SORTS.find((x) => x.value === sort)?.label}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.screen}>
      <FlatList
        data={loading ? [] : people}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => (
          <PersonRow row={item} onPress={openPerson} />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View style={s.listLoading}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={ms(34)} color="#CBD5E1" />
              <Text style={s.emptyTitle}>
                {debouncedSearch
                  ? "Nobody matches that search"
                  : "No activity in this period"}
              </Text>
              <Text style={s.emptyHint}>
                {debouncedSearch
                  ? "Try a different name or code."
                  : "People appear here once they collect, bank, record or submit."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footerLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null
        }
        removeClippedSubviews
        initialNumToRender={8}
        windowSize={9}
      />

      <PickerSheet
        visible={sheet === "company"}
        title="Company"
        selected={company}
        onPick={setCompany}
        onClose={() => setSheet(null)}
        options={[
          { value: "", label: "All Companies" },
          ...companies.map((c) => ({
            value: c.company,
            label: c.display_name || c.company,
          })),
        ]}
      />
      <PickerSheet
        visible={sheet === "preset"}
        title="Date Range"
        selected={preset}
        onPick={(value) => setPreset(value as DatePreset)}
        onClose={() => setSheet(null)}
        // Custom Range needs two date pickers, which do not fit this sheet;
        // the five presets cover the phone use case and the web offers the
        // custom window.
        options={DATE_PRESETS.filter((p) => p.value !== "custom")}
      />
      <PickerSheet
        visible={sheet === "sort"}
        title="Sort by"
        selected={sort}
        onPick={(value) => setSort(value as SortField)}
        onClose={() => setSheet(null)}
        options={SORTS}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingBottom: sp(28) },

  hero: {
    paddingHorizontal: sp(18),
    paddingTop: sp(20),
    paddingBottom: sp(22),
    borderBottomLeftRadius: sp(20),
    borderBottomRightRadius: sp(20),
  },
  heroTitle: { color: "#FFFFFF", fontSize: fs(20), fontWeight: "800" },
  heroSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: fs(12.5),
    fontWeight: "600",
    marginTop: sp(2),
  },
  heroRange: {
    color: "rgba(255,255,255,0.92)",
    fontSize: fs(11.5),
    fontWeight: "700",
    marginTop: sp(10),
  },

  filters: {
    flexDirection: "row",
    gap: sp(10),
    paddingHorizontal: sp(14),
    marginTop: sp(14),
  },
  filter: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: sp(12),
    paddingHorizontal: sp(12),
    paddingVertical: sp(10),
    borderWidth: 1,
    borderColor: "#E8EDF4",
  },
  filterLabel: {
    fontSize: fs(10),
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sp(3),
    gap: sp(6),
  },
  filterValue: {
    flex: 1,
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginHorizontal: sp(14),
    marginTop: sp(12),
    padding: sp(12),
    borderRadius: sp(10),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { flex: 1, color: "#B91C1C", fontSize: fs(12), fontWeight: "600" },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(10),
    paddingHorizontal: sp(14),
    marginTop: sp(8),
  },

  // The screen answers two questions; these keep them apart so a reader never
  // has to guess which set a card belongs to.
  sectionLabel: { paddingHorizontal: sp(14), marginTop: sp(16) },
  sectionTitle: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  sectionHint: { fontSize: fs(10.5), color: "#94A3B8", marginTop: sp(1) },

  listHead: { paddingHorizontal: sp(14), marginTop: sp(18) },
  listTitle: { fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  listSub: { fontSize: fs(11.5), color: "#64748B", marginTop: sp(2) },
  listTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginTop: sp(10),
    marginBottom: sp(4),
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(7),
    backgroundColor: COLORS.surface,
    borderRadius: sp(10),
    paddingHorizontal: sp(11),
    height: ms(38),
    borderWidth: 1,
    borderColor: "#E8EDF4",
  },
  searchInput: {
    flex: 1,
    fontSize: fs(13),
    color: COLORS.text,
    padding: 0,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    height: ms(38),
    paddingHorizontal: sp(11),
    borderRadius: sp(10),
    backgroundColor: "#EEF2FF",
  },
  sortText: { fontSize: fs(12), fontWeight: "700", color: COLORS.primary },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(11),
    marginHorizontal: sp(14),
    marginTop: sp(9),
    padding: sp(12),
    borderRadius: sp(14),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  personRowPressed: { backgroundColor: "#F8FAFF" },

  avatar: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPerson: { backgroundColor: "#EEF2FF" },
  avatarUser: { backgroundColor: "#ECFEFF" },
  avatarText: { fontSize: fs(13), fontWeight: "800" },
  avatarTextPerson: { color: "#4F46E5" },
  avatarTextUser: { color: "#0E7490" },

  personBody: { flex: 1, minWidth: 0 },
  personTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(8),
  },
  personName: {
    flex: 1,
    fontSize: fs(13.5),
    fontWeight: "800",
    color: COLORS.text,
  },
  personTotal: { fontSize: fs(13), fontWeight: "800", color: COLORS.text },
  personRoles: { fontSize: fs(10.5), color: "#94A3B8", marginTop: sp(1) },

  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(7),
    marginTop: sp(6),
  },
  barLabel: { width: ms(58), fontSize: fs(10), color: "#64748B" },
  barTrack: {
    flex: 1,
    height: ms(5),
    borderRadius: 99,
    backgroundColor: "#EEF1F6",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 99 },
  barBlue: { backgroundColor: "#2563EB" },
  barGreen: { backgroundColor: "#16A34A" },
  barValue: {
    width: ms(76),
    textAlign: "right",
    fontSize: fs(10.5),
    fontWeight: "700",
    color: COLORS.text,
  },

  listLoading: { paddingVertical: sp(40), alignItems: "center" },
  footerLoading: { paddingVertical: sp(16) },
  empty: { alignItems: "center", paddingVertical: sp(34), paddingHorizontal: sp(30) },
  emptyTitle: {
    fontSize: fs(13.5),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: sp(10),
    textAlign: "center",
  },
  emptyHint: {
    fontSize: fs(11.5),
    color: "#94A3B8",
    marginTop: sp(4),
    textAlign: "center",
  },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: sp(20),
    borderTopRightRadius: sp(20),
    paddingHorizontal: sp(16),
    paddingTop: sp(10),
    paddingBottom: sp(28),
  },
  sheetGrip: {
    alignSelf: "center",
    width: ms(38),
    height: ms(4),
    borderRadius: 99,
    backgroundColor: "#CBD5E1",
    marginBottom: sp(12),
  },
  sheetTitle: {
    fontSize: fs(14),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: sp(6),
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sp(13),
    paddingHorizontal: sp(10),
    borderRadius: sp(10),
  },
  sheetRowActive: { backgroundColor: "#EEF2FF" },
  sheetLabel: { fontSize: fs(13.5), color: COLORS.text, fontWeight: "600" },
  sheetLabelActive: { color: COLORS.primary, fontWeight: "800" },
});
