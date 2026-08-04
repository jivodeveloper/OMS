import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import Dropdown from "@/src/components/common/DropdownProps";
import InlineOrderDateFilter, {
  type DateFilterValue,
} from "@/src/components/common/InlineOrderDateFilter";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
  type Company,
  type PaymentReceipt,
} from "@/src/services/payments.service";
import { useCompanies } from "./usePaymentMasters";

/**
 * Tracking list for payments and deposits.
 *
 * The layout deliberately mirrors orders/ordertracking.tsx — same status
 * dropdown width, floating-label search, and gradient count bar — so the two
 * feel like one app rather than two. Only the data differs.
 *
 * Creators use this to follow their own entries through the approval chain,
 * which is why `mine` defaults to true for anyone who is not an approver.
 */

export type TrackingKind = "PAYMENT" | "DEPOSIT";

/** One row, normalised so the card renders either document type. */
interface TrackRow {
  id: number;
  docNo: string;
  party: string;
  subtitle: string;
  amount: number;
  status: string;
  statusLabel: string;
  date: string;
  createdBy: string;
  company: string;
  level: string;
  chips: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}

/**
 * Status options, in the creator's language rather than the database's.
 *
 * "Completed" means the entry cleared every approval level AND posted to SAP —
 * the only state a creator considers finished. APPROVED and POSTING_TO_SAP are
 * folded into "Pending" rather than offered separately: an entry in either is
 * still in flight, and listing them invited the reading that APPROVED was the
 * end of the road.
 *
 * DRAFT is absent because the app submits on create — a draft never persists.
 */
const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "PENDING_APPROVAL,APPROVED,POSTING_TO_SAP" },
  { label: "Completed", value: "POSTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Pending Error", value: "PENDING_ERROR" },
  { label: "Awaiting SAP Check", value: "SAP_UNKNOWN" },
];

/** Status -> pill colour. Anything unmapped falls back to neutral grey. */
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_APPROVAL: { bg: "#FFF7E6", fg: "#B45309" },
  APPROVED: { bg: "#EEF2FF", fg: "#4338CA" },
  POSTING_TO_SAP: { bg: "#EEF2FF", fg: "#4338CA" },
  SAP_UNKNOWN: { bg: "#FFF7E6", fg: "#B45309" },
  POSTED: { bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { bg: "#FEF2F2", fg: "#B91C1C" },
  CANCELLED: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_ERROR: { bg: "#FEF2F2", fg: "#B91C1C" },
};

/**
 * Pill wording, matching the filter options above.
 *
 * The server's own display names leak internals ("Queued for SAP") — a creator
 * only needs to know whether it is still moving, done, or needs attention.
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  APPROVED: "In Progress",
  POSTING_TO_SAP: "Posting to SAP",
  SAP_UNKNOWN: "Awaiting SAP check",
  POSTED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  PENDING_ERROR: "Pending Error",
};

/**
 * Turn the date picker's value into an inclusive from/to window.
 *
 * The picker speaks in three granularities (a day, a month, a year) but the API
 * takes a plain range, so the widening happens here rather than needing three
 * separate query shapes on the server.
 */
const dateWindow = (value: DateFilterValue): { from: string; to: string } | null => {
  if (!value?.value) return null;
  if (value.mode === "date") return { from: value.value, to: value.value };
  if (value.mode === "month") {
    const [y, m] = value.value.split("-").map(Number);
    // Day 0 of the NEXT month is the last day of this one — no month-length table.
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${value.value}-01`,
      to: `${value.value}-${String(last).padStart(2, "0")}`,
    };
  }
  return { from: `${value.value}-01-01`, to: `${value.value}-12-31` };
};

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const receiptToRow = (r: PaymentReceipt): TrackRow => ({
  id: r.id,
  docNo: r.receipt_no,
  party: r.card_name || r.card_code,
  subtitle: r.card_code,
  amount: Number(r.total_amount) || 0,
  status: r.status,
  statusLabel: STATUS_LABEL[r.status] ?? r.status_display ?? r.status,
  date: r.created_at,
  createdBy: r.created_by_name || "—",
  company: r.company,
  level: r.approval?.level_label ?? "",
  chips: [
    { icon: "calendar-outline", text: `Date: ${(r.payment_date || "").slice(0, 10) || "—"}` },
    { icon: "business-outline", text: r.company },
  ],
});

const depositToRow = (d: BankDeposit): TrackRow => ({
  id: d.id,
  docNo: d.deposit_no,
  party: d.bank_account_name || "Bank deposit",
  subtitle: `${d.lines?.length ?? 0} receipt${(d.lines?.length ?? 0) === 1 ? "" : "s"}`,
  amount: Number(d.deposit_amount) || 0,
  status: d.status,
  statusLabel: STATUS_LABEL[d.status] ?? d.status_display ?? d.status,
  date: d.created_at,
  createdBy: d.created_by_name || "—",
  company: d.company,
  level: d.approval?.level_label ?? "",
  chips: [
    { icon: "calendar-outline", text: `Date: ${(d.deposit_date || "").slice(0, 10) || "—"}` },
    { icon: "wallet-outline", text: d.deposit_type },
  ],
});

interface Props {
  kind: TrackingKind;
  /** When true the list is scoped to documents this user raised. */
  mine?: boolean;
}

export default function PaymentTrackingScreen({ kind, mine = true }: Props) {
  const isPayment = kind === "PAYMENT";

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [statusView, setStatusView] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<Company | "">("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  const companies = useCompanies();

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        const params: Record<string, string> = {};
        if (statusView !== "all") params.status = statusView;
        if (companyFilter) params.company = companyFilter;
        if (mine) params.mine = "true";
        const window = dateWindow(dateFilter);
        if (window) {
          params.date_from = window.from;
          params.date_to = window.to;
        }

        if (isPayment) {
          const data = await paymentsService.listReceipts(params);
          setRows(data.map(receiptToRow));
        } else {
          const data = await paymentsService.listDeposits(params);
          setRows(data.map(depositToRow));
        }
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 403
            ? "You do not have permission to view these entries."
            : "Could not load. Pull down to try again.",
        );
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isPayment, statusView, companyFilter, dateFilter, mine],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onRefresh = useCallback(() => void load("refresh"), [load]);

  // Search is local so typing never re-queries; status and company are server
  // filters, applied in `load` above.
  const visible = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.docNo.toLowerCase().includes(term) ||
        r.party.toLowerCase().includes(term) ||
        r.createdBy.toLowerCase().includes(term),
    );
  }, [rows, searchQuery]);

  const openDetails = useCallback(
    (row: TrackRow) => {
      router.push({
        pathname: "/(main)/payments/tracking-details",
        params: { id: String(row.id), kind },
      } as never);
    },
    [kind],
  );

  const renderItem = useCallback(
    ({ item }: { item: TrackRow }) => {
      const tone = STATUS_TONE[item.status] ?? { bg: "#F3F4F6", fg: "#6B7280" };
      return (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.docNo} numberOfLines={1}>
              {item.docNo}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.statusPillText, { color: tone.fg }]} numberOfLines={1}>
                {item.statusLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.createdAt}>Created: {formatDate(item.date)}</Text>

          <Text style={styles.party} numberOfLines={2}>
            {item.party}
          </Text>
          {!!item.subtitle && <Text style={styles.partyCode}>{item.subtitle}</Text>}

          <View style={styles.chipRow}>
            {item.chips.map((chip) => (
              <View key={chip.text} style={styles.chip}>
                <Ionicons name={chip.icon} size={13} color={COLORS.primary} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {chip.text}
                </Text>
              </View>
            ))}
            {!!item.level && (
              <View style={styles.chip}>
                <Ionicons name="git-branch-outline" size={13} color={COLORS.primary} />
                <Text style={styles.chipText}>{item.level}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{formatMoney(item.amount)}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => openDetails(item)}
              activeOpacity={0.85}
            >
              <Ionicons name="eye-outline" size={17} color="#fff" />
              <Text style={styles.detailsBtnText}>View Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [openDetails],
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons
          name={error ? "alert-circle-outline" : "file-tray-outline"}
          size={44}
          color={error ? COLORS.error : COLORS.textSecondary}
        />
        <Text style={styles.emptyTitle}>
          {error || (isPayment ? "No payments found" : "No deposits found")}
        </Text>
        {!error && (
          <Text style={styles.emptyHint}>
            {statusView !== "all" || companyFilter || dateFilter || searchQuery
              ? "Try widening the filters above."
              : mine
                ? "Entries you create will appear here."
                : "Nothing has been recorded yet."}
          </Text>
        )}
      </View>
    );
  };

  const activeFilterCount =
    (companyFilter ? 1 : 0) +
    (statusView !== "all" ? 1 : 0) +
    (dateFilter ? 1 : 0);

  return (
    <View style={styles.container}>
      {/* Status + Search — identical geometry to the order tracking header. */}
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={STATUS_OPTIONS}
            value={statusView}
            onChange={setStatusView}
            searchable={false}
            floatingLabel
            noBottomSpacing
          />
        </View>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Search</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(value) => setSearchQuery(value.toUpperCase())}
              placeholder="NO. / PARTY"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Count bar — holds Filter, so it stays visible on an empty result set;
          hiding it would leave the user unable to widen the filter that
          emptied the list. */}
      {!loading && (
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countBar}
        >
          <TouchableOpacity
            style={styles.countBarFilterBtn}
            onPress={() => setIsFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="funnel-outline" size={14} color="#fff" />
            <Text style={styles.countBarFilterText}>Filter</Text>
            {activeFilterCount > 0 && <View style={styles.countBarFilterDot} />}
          </TouchableOpacity>

          <View style={styles.countBarTextWrap}>
            <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
              {visible.length} {isPayment ? "payment" : "deposit"}
              {visible.length === 1 ? "" : "s"} found
            </Text>
            <Text style={styles.countSubText} numberOfLines={1}>
              Last updated just now
            </Text>
          </View>

          <View style={styles.countBarDateWrap}>
            <InlineOrderDateFilter
              value={dateFilter}
              onChange={setDateFilter}
              variant="onDark"
            />
          </View>
        </LinearGradient>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Filter sheet — company only; status lives in the header dropdown. */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Company</Text>
            <TouchableOpacity
              style={[styles.optionRow, !companyFilter && styles.optionRowActive]}
              onPress={() => setCompanyFilter("")}
            >
              <Text
                style={[
                  styles.optionText,
                  !companyFilter && styles.optionTextActive,
                ]}
              >
                All companies
              </Text>
              {!companyFilter && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
            {companies.data.map((c) => {
              const active = companyFilter === c.company;
              return (
                <TouchableOpacity
                  key={c.company}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setCompanyFilter(c.company)}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {c.display_name || c.company}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalClear}
                onPress={() => {
                  setCompanyFilter("");
                  setStatusView("all");
                  setDateFilter(null);
                }}
              >
                <Text style={styles.modalClearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApply}
                onPress={() => setIsFilterModalVisible(false)}
              >
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Header: matches ordertracking.tsx exactly ──────────────────────────
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(12),
    paddingVertical: sp(12),
    gap: sp(8),
  },
  statusDropdownWrap: {
    width: ms(124),
    flexGrow: 0,
    flexShrink: 0,
  },
  fieldWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: sp(8),
    position: "relative",
  },
  fieldLabel: {
    position: "absolute",
    top: 0,
    left: 12,
    zIndex: 2,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 4,
    fontSize: fs(12),
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  searchWrap: {
    alignSelf: "stretch",
    height: ms(56),
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: sp(10),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(12),
    backgroundColor: COLORS.inputBackground,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(12),
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 0,
  },

  // ── Gradient count bar ────────────────────────────────────────────────
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: sp(16),
    marginTop: sp(12),
    paddingVertical: sp(12),
    paddingHorizontal: sp(12),
    borderRadius: sp(16),
    gap: sp(10),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  countBarFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
  },
  countBarFilterText: { color: "#fff", fontSize: fs(12), fontWeight: "700" },
  countBarFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD166",
    marginLeft: 2,
  },
  countBarTextWrap: { flex: 1, minWidth: 0 },
  countBarDateWrap: { flexGrow: 0, flexShrink: 0 },
  countText: { color: "#fff", fontSize: fs(14), fontWeight: "800" },
  countSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fs(11),
    marginTop: 2,
  },

  // ── Cards ─────────────────────────────────────────────────────────────
  listContent: { padding: sp(16), paddingBottom: sp(40) },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(8),
  },
  docNo: {
    flex: 1,
    fontSize: fs(15),
    fontWeight: "800",
    color: COLORS.text,
  },
  statusPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontSize: fs(11), fontWeight: "700" },
  createdAt: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    marginTop: sp(4),
  },
  party: {
    fontSize: fs(14),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: sp(10),
  },
  partyCode: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(8),
    marginTop: sp(10),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
  },
  chipText: { fontSize: fs(11), color: COLORS.textSecondary, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: sp(12),
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: fs(13), color: COLORS.textSecondary, fontWeight: "600" },
  totalValue: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
  actionRow: { flexDirection: "row", gap: sp(10), marginTop: sp(14) },
  detailsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: sp(12),
    paddingVertical: sp(12),
  },
  detailsBtnText: { color: "#fff", fontSize: fs(14), fontWeight: "700" },

  // ── States ────────────────────────────────────────────────────────────
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", paddingVertical: sp(60), gap: sp(8) },
  emptyTitle: {
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: sp(24),
  },
  emptyHint: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: sp(32),
  },

  // ── Filter sheet ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: sp(20),
    borderTopRightRadius: sp(20),
    padding: sp(20),
    maxHeight: "75%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sp(16),
  },
  modalTitle: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
  modalLabel: {
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(8),
    textTransform: "uppercase",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sp(13),
    paddingHorizontal: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: sp(8),
  },
  optionRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  optionText: { fontSize: fs(14), color: COLORS.text, fontWeight: "600" },
  optionTextActive: { color: COLORS.primary, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: sp(12), marginTop: sp(10) },
  modalClear: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalClearText: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  modalApply: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  modalApplyText: { fontSize: fs(14), fontWeight: "700", color: "#fff" },
});
