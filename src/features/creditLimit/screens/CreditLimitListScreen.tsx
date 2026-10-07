import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
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
import InlineOrderDateFilter from "@/src/components/common/InlineOrderDateFilter";
import { can } from "@/src/constants/permissions";
import { COLORS } from "@/src/constants/theme";
import { useAuth } from "@/src/context/AuthContext";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  CREDIT_LIMIT_COMPANIES,
  type CreditLimitRequest,
  type CreditLimitStatus,
} from "@/src/services/creditLimit.service";

import CreditLimitCard from "../components/CreditLimitCard";
import { useCreditLimitRequests, type CreditLimitScope } from "../useCreditLimit";

/**
 * Credit Limit — one page, two sides.
 *
 * THE ADVANCE PAYMENTS LIST, in geometry and not merely in spirit: the status
 * dropdown and floating-label search header, the gradient count bar carrying
 * Filter, the count sentence and the date control, and the bottom-sheet company
 * filter. The styles below are copied from `AdvanceListScreen`, which copied
 * them from `PaymentTrackingScreen`; three lists in one app must not each
 * invent their own furniture.
 *
 * THE VIEW SWITCH IS ONLY FOR SOMEBODY WITH BOTH KEYS. `Credit_Limit` raises
 * requests and reads their own; `Credit_Limit_Approval` opens the desk. With
 * one key there is one list and no question to ask, so the page lands on it
 * directly — a switch with a dead half is worse than no switch.
 */

type ListView = CreditLimitScope;

const VIEW_LABEL: Record<ListView, string> = {
  desk: "To Approve",
  mine: "My Requests",
};

const STATUS_OPTIONS: { label: string; value: CreditLimitStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

export default function CreditLimitListScreen({ scope }: { scope?: ListView }) {
  const { user } = useAuth();
  const holdsMine = can(user, "Credit_Limit");
  const holdsDesk = can(user, "Credit_Limit_Approval");
  /** Both keys, and only then: one key means one list and no switch. */
  const canSwitch = holdsMine && holdsDesk;

  /**
   * THE DESK FIRST for anyone who holds the approval key: work waiting on them
   * outranks the requests they raised themselves. With a single key the page
   * opens on whichever side that key entitles them to.
   */
  const defaultView: ListView = holdsDesk ? "desk" : "mine";
  const [picked, setPicked] = useState<ListView>(scope ?? defaultView);
  /**
   * WHAT IS ACTUALLY SHOWING. Without both keys the dropdown is not there, so
   * the chosen value cannot be anything but the one list that key opens — and
   * the empty state and the requester column must say the same.
   */
  const view: ListView = canSwitch ? picked : defaultView;

  const {
    rows,
    loading,
    refreshing,
    error,
    filters,
    dateFilter,
    setDateFilter,
    activeFilterCount,
    patchFilters,
    clearFilters,
    onRefresh,
    reload,
  } = useCreditLimitRequests(view);

  useRefreshOnFocus(() => void reload());

  const [filterOpen, setFilterOpen] = useState(false);

  /**
   * BACK LEAVES THE VIEW BEFORE IT LEAVES THE PAGE: the dropdown changes what
   * the page shows without navigating, so the first Back undoes that.
   */
  useAndroidBackOverride(
    useCallback(() => {
      if (view === (scope ?? defaultView)) return false;
      setPicked(scope ?? defaultView);
      return true;
    }, [view, scope, defaultView]),
  );

  const viewOptions = [
    ...(holdsDesk ? [{ label: VIEW_LABEL.desk, value: "desk" as ListView }] : []),
    ...(holdsMine ? [{ label: VIEW_LABEL.mine, value: "mine" as ListView }] : []),
  ];

  const openDetails = (request: CreditLimitRequest) =>
    router.push({
      pathname: "/(main)/credit-limit/details",
      params: { id: String(request.id) },
    } as never);

  const openProgress = (request: CreditLimitRequest) =>
    router.push({
      pathname: "/(main)/credit-limit/progress",
      params: { id: String(request.id) },
    } as never);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons
          name={error ? "alert-circle-outline" : "card-outline"}
          size={44}
          color={error ? COLORS.error : COLORS.textSecondary}
        />
        <Text style={styles.emptyTitle}>
          {error || (view === "desk" ? "Nothing on your desk" : "No credit limit requests")}
        </Text>
        {!error ? (
          <Text style={styles.emptyHint}>
            {filters.status || filters.company || dateFilter || filters.search
              ? "Try widening the filters above."
              : view === "desk"
                ? "Nothing is waiting for your approval."
                : "Requests you raise will appear here."}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* WHOSE WORK AM I LOOKING AT? Only asked of somebody who holds both
          keys — with one key there is one list, and a switch with a dead half
          is worse than none. */}
      {canSwitch ? (
        <View style={styles.viewRow}>
          <Dropdown
            label="Show"
            data={viewOptions}
            value={view}
            onChange={(next: string) => {
              setPicked(next as ListView);
              // The two sides filter on different things — an approver's
              // "Pending" is what waits AT THEIR STAGE, a requester's is the
              // request's own status — so each opens on its own pending
              // rather than carrying a bucket across.
              patchFilters({ status: "PENDING" });
            }}
            searchable={false}
            floatingLabel
            noBottomSpacing
          />
        </View>
      ) : null}

      {/* Status + Search — identical geometry to advance payments. */}
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={STATUS_OPTIONS}
            value={filters.status}
            onChange={(status: string) =>
              patchFilters({ status: status as CreditLimitStatus | "" })
            }
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
              placeholder="NO. / CUSTOMER"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {filters.search ? (
              <TouchableOpacity
                onPress={() => patchFilters({ search: "" })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* Count bar — holds Filter, so it stays visible on an empty result set;
          hiding it would leave the user unable to widen the filter that
          emptied the list. */}
      {!loading ? (
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
            {activeFilterCount > 0 ? <View style={styles.countBarFilterDot} /> : null}
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
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CreditLimitCard
              request={item}
              showRequester={view === "desk"}
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

      {/* Filter sheet — company only; status lives in the header dropdown and
          the date on the bar, exactly as on advance payments. */}
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
              <Text style={[styles.optionText, !filters.company && styles.optionTextActive]}>
                All companies
              </Text>
              {!filters.company ? (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              ) : null}
            </TouchableOpacity>
            {CREDIT_LIMIT_COMPANIES.map((company) => {
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
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  ) : null}
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

/** `BEVERAGES` to `Beverages`, for the filter sheet only. */
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/** Copied from `AdvanceListScreen.styles` — the two lists must not drift. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  viewRow: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
  },

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
  countSubText: { color: "rgba(255,255,255,0.8)", fontSize: fs(11), marginTop: 2 },

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
