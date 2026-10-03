import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Dropdown from "@/src/components/common/DropdownProps";
import { can } from "@/src/constants/permissions";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";
import { useAuth } from "@/src/context/AuthContext";
import InlineOrderDateFilter from "@/src/components/common/InlineOrderDateFilter";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";

import { useAssignments } from "../assignments";
import AdvanceRequestCard from "../components/AdvanceRequestCard";
import AssignedList from "../components/AssignedList";

import {
  useAdvanceRequests,
  type RequestListScope,
} from "../hooks/useAdvanceRequests";
import type { AdvanceRequestEntry } from "../logic/approvalData";
import { COMPANIES } from "../logic/constants";
import {
  DESK_STATUS_OPTIONS,
  STATUS_LABEL,
  type DeskFilter,
  type StatusFilter,
} from "../logic/requestLabels";

/**
 * Every Advance Payment request this user can see — theirs, their desk's, or
 * both.
 *
 * THE PAYMENT TRACKING LAYOUT, deliberately identical: the same status dropdown
 * and floating-label search header, the same gradient count bar carrying Filter
 * and the date control, the same cards and the same bottom-sheet company filter.
 * Two lists sitting side by side in one app should not each invent their own
 * furniture — the geometry here is copied from `PaymentTrackingScreen`.
 *
 * NO CREATE BUTTON. Raising a request is the footer's "+" and the drawer's New
 * Advance Payment entry, exactly as a receipt is raised: a list is for following
 * work, and a second door to the same form only makes the list noisier.
 *
 * ONE SCREEN, TWO PAGES. `scope` is what makes Advance Payments and Advance
 * Payment Approval separate entries in the drawer for somebody holding both
 * keys: the first is what they raised, the second is what is theirs to decide.
 * A user with one key sees one page and the scope makes no difference — the
 * hook reads whichever side they are entitled to.
 */
export default function AdvanceListScreen({ scope }: { scope?: RequestListScope }) {
  /**
   * WHICH SIDE THIS PAGE IS SHOWING.
   *
   * The route sets where it starts — Advance Payments on "mine", Advance
   * Approvals on "desk" — and somebody holding BOTH keys can switch here.
   * Without the switch the desk is reachable only from the drawer, and the
   * drawer hides this module's entries for anyone whose home page IS this
   * module: they would have no way to their own approval queue at all.
   */
  const { user } = useAuth();
  /**
   * THE DESK FIRST for anyone who holds the approval key: work waiting on them
   * outranks the requests they raised themselves. A user with one key only ever
   * sees theirs.
   */
  const defaultView: ListView = can(user, "Advance_Payment_Approval") ? "desk" : "mine";
  const [listView, setListView] = useState<RequestListScope>(
    scope ?? (defaultView === "desk" ? "desk" : "mine"),
  );

  /**
   * WHICH OF THE THREE IS SHOWING.
   *
   * "assigned" is not a scope of the requests endpoint at all — it is the
   * documents somebody sent for a request to be raised — so it is held apart
   * from the scope the list reads, and switching back to either list does not
   * re-read it.
   */
  const [view, setView] = useState<ListView>(scope ?? defaultView);

  /**
   * BACK LEAVES THE VIEW BEFORE IT LEAVES THE PAGE.
   *
   * The dropdown changes what the page is showing without navigating, so a
   * Back from "Assigned to me" that went straight to the dashboard would throw
   * away the step the user actually took. The first Back returns to the view
   * this page opens on; the next one leaves, through the same history the
   * header arrow follows.
   */
  useAndroidBackOverride(
    useCallback(() => {
      if (view === (scope ?? defaultView)) return false;
      setView(scope ?? defaultView);
      return true;
    }, [view, scope, defaultView]),
  );

  /** The requests list always reads a real scope, whatever is on screen. */
  const listScope: RequestListScope = view === "assigned" ? listView : view;

  const {
    rows,
    loading,
    refreshing,
    error,
    filters,
    patchFilters,
    clearFilters,
    dateFilter,
    setDateFilter,
    activeFilterCount,
    onRefresh,
    canApprove,
    holdsMine,
    holdsDesk,
  } = useAdvanceRequests(listScope);

  const [filterOpen, setFilterOpen] = useState(false);

  /**
   * Preselect what the home page's card counted.
   *
   * The card sends the STATUS itself, because this list filters on exactly that
   * field — so a card reading "Pending 4" opens the same four rows. Applied
   * once: re-applying it would undo the next filter the user chose.
   */
  const { status: statusParam } = useLocalSearchParams<{ status?: string }>();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !statusParam) return;
    applied.current = true;
    patchFilters({ status: statusParam as StatusFilter });
  }, [statusParam, patchFilters]);

  const openDetails = (entry: AdvanceRequestEntry) =>
    router.push({
      pathname: "/(main)/advance-payments/details",
      params: { id: String(entry.serverId) },
    } as never);

  /** The bills and POs sent to this user and still waiting. */
  const assigned = useAssignments("mine", "OPEN");

  /**
   * The views this user may choose between, in the order they matter.
   *
   * ASSIGNED TO ME IS ALWAYS THERE: anyone who may raise a request may be sent
   * a document to raise it from, so the answer is "none yet" rather than "not
   * for you" — and the count on the option says which before it is opened.
   */
  const viewOptions = [
    ...(holdsDesk ? [{ label: VIEW_LABEL.desk, value: "desk" as ListView }] : []),
    ...(holdsMine ? [{ label: VIEW_LABEL.mine, value: "mine" as ListView }] : []),
    {
      label: assigned.rows.length
        ? `${VIEW_LABEL.assigned} (${assigned.rows.length})`
        : VIEW_LABEL.assigned,
      value: "assigned" as ListView,
    },
  ];

  const openProgress = (entry: AdvanceRequestEntry) =>
    router.push({
      pathname: "/(main)/advance-payments/tracking-progress",
      params: { id: String(entry.serverId) },
    } as never);

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
          {error ||
            (view === "desk" ? "Nothing on your desk" : "No advance payment requests")}
        </Text>
        {!error && (
          <Text style={styles.emptyHint}>
            {filters.status || filters.company || dateFilter || filters.search
              ? "Try widening the filters above."
              : view === "desk" || canApprove
                ? "Nothing is waiting for your approval."
                : "Requests you raise will appear here."}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* WHOSE WORK AM I LOOKING AT? Three answers, one control, and the
          options are only the ones this user has: an approver's desk, their own
          requests, and the documents somebody sent them to raise. With a single
          permission the dropdown still shows, because "Assigned to me" is
          always one of the answers. */}
      <View style={styles.viewRow}>
        <Dropdown
          label="Show"
          data={viewOptions}
          value={view}
          onChange={(picked: string) => {
            const next = picked as ListView;
            setView(next);
            if (next !== "assigned") {
              setListView(next);
              // The two lists filter on different things — an approver's
              // "Pending" is what waits AT THEIR STAGE, a requester's is the
              // document's own status — so each side opens on its own
              // pending rather than carrying a bucket across.
              patchFilters({ status: "PENDING" });
            }
          }}
          searchable={false}
          floatingLabel
          noBottomSpacing
        />
      </View>

      {view === "assigned" ? (
        <AssignedList
          rows={assigned.rows}
          loading={assigned.loading}
          error={assigned.error}
          onChanged={() => void assigned.reload()}
        />
      ) : (
        <>
      {/* Status + Search — identical geometry to payment tracking. */}
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={view === "desk" ? DESK_OPTIONS : STATUS_OPTIONS}
            value={filters.status}
            onChange={(status: string) => patchFilters({ status: status as StatusFilter })}
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
              value={filters.search}
              onChangeText={(value) => patchFilters({ search: value.toUpperCase() })}
              placeholder="NO. / PARTNER"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!filters.search && (
              <TouchableOpacity
                onPress={() => patchFilters({ search: "" })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
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
            onPress={() => setFilterOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="funnel-outline" size={14} color="#fff" />
            <Text style={styles.countBarFilterText}>Filter</Text>
            {activeFilterCount > 0 && <View style={styles.countBarFilterDot} />}
          </TouchableOpacity>

          <View style={styles.countBarTextWrap}>
            <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
              {rows.length} request{rows.length === 1 ? "" : "s"} found
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

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.serverId)}
          renderItem={({ item }) => (
            <AdvanceRequestCard
              entry={item}
              onDetails={() => openDetails(item)}
              onProgress={() => openProgress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          // These cards are tall — a header, chips, a money strip and two
          // buttons each — so the defaults mount far more than fits.
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
        />
      )}

        </>
      )}

      {/* Filter sheet — company only; status lives in the header dropdown and
          the date on the bar, exactly as on payment tracking. */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Company</Text>
            <TouchableOpacity
              style={[styles.optionRow, !filters.company && styles.optionRowActive]}
              onPress={() => patchFilters({ company: "" })}
            >
              <Text
                style={[styles.optionText, !filters.company && styles.optionTextActive]}
              >
                All companies
              </Text>
              {!filters.company && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
            {COMPANIES.map((company) => {
              const active = filters.company === company;
              return (
                <TouchableOpacity
                  key={company}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => patchFilters({ company })}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {titleCase(company)}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalClear} onPress={clearFilters}>
                <Text style={styles.modalClearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApply}
                onPress={() => setFilterOpen(false)}
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

/** The two sides of the module, for the switch. */
/** The three views one page offers. "assigned" is not a requests scope. */
export type ListView = RequestListScope | "assigned";

const VIEW_LABEL: Record<ListView, string> = {
  desk: "To Approve",
  mine: "My Requests",
  assigned: "Assigned to me",
};

const DESK_LABEL: Record<DeskFilter, string> = {
  "": "All",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Reject",
  RETURNED: "Returned",
};

const DESK_OPTIONS: { label: string; value: DeskFilter }[] = DESK_STATUS_OPTIONS.map(
  (option) => ({ label: DESK_LABEL[option.value] ?? option.label, value: option.value }),
);

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "" },
  { label: STATUS_LABEL.PENDING, value: "PENDING" },
  { label: STATUS_LABEL.RETURNED, value: "RETURNED" },
  { label: STATUS_LABEL.APPROVED, value: "APPROVED" },
  { label: STATUS_LABEL.REJECTED, value: "REJECTED" },
  { label: STATUS_LABEL.CANCELLED, value: "CANCELLED" },
];

/** `BEVERAGES` to `Beverages`, for the filter sheet only. */
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/** Copied from `PaymentTrackingScreen.styles` — the two lists must not drift. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // The view dropdown's own row, with the breathing space the tab row had.
  viewRow: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
  },
  scopeRow: {
    flexDirection: "row",
    gap: sp(8),
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(12),
    paddingTop: sp(12),
  },
  scopeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: sp(9),
    borderRadius: sp(10),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBackground,
  },
  scopeTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  scopeText: { fontSize: fs(12), fontWeight: "700", color: COLORS.textSecondary },
  scopeTextActive: { color: COLORS.primary },

  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(12),
    paddingVertical: sp(12),
    gap: sp(8),
  },
  statusDropdownWrap: { width: ms(124), flexGrow: 0, flexShrink: 0 },
  fieldWrap: { flex: 1, minWidth: 0, paddingTop: sp(8), position: "relative" },
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

  listContent: { padding: sp(16), paddingBottom: sp(40) },
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
