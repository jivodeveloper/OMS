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
import { COLORS } from "@/src/constants/theme";
import {
  BACKDATE_COMPANIES,
  type BackDateRequest,
} from "@/src/services/backdate.service";
import { fs, ms, sp } from "@/src/utils/responsive";
import BackDateRequestCard from "../components/BackDateRequestCard";
import useBackDateTracking, {
  type StatusFilter,
} from "../hooks/useBackDateTracking";

/**
 * Every BackDate request this user is entitled to see.
 *
 * A requester sees what they raised; an approver sees only what is awaiting
 * their decision; somebody holding both sees both. The hook decides from the
 * permission keys — there is no mode to choose and no empty tab to explain.
 *
 * LAID OUT AS PAYMENT TRACKING, deliberately down to the geometry: the same
 * status-and-search header, the same gradient count bar carrying Filter and
 * the date control, the same card and the same bottom-sheet filter. A person
 * who has learnt one list has learnt both, and two lists sitting side by side
 * in one app should not each invent their own furniture.
 */
export default function BackDateTrackingScreen() {
  const {
    rows,
    actionable,
    loading,
    refreshing,
    error,
    status,
    setStatus,
    company,
    setCompany,
    dateFilter,
    setDateFilter,
    search,
    setSearch,
    activeFilterCount,
    clearFilters,
    onRefresh,
    reload,
    canApprove,
  } = useBackDateTracking();

  const [filterOpen, setFilterOpen] = useState(false);

  const openDetails = useCallback(
    (request: BackDateRequest) => {
      router.push({
        pathname: "/(main)/backdate/tracking-details",
        params: {
          id: String(request.id),
          // Whether this is the viewer's to decide. Passed from the list
          // because a request carries no `can_decide` of its own — only
          // membership of the approval queue answers it.
          actionable: actionable.has(request.id) ? "1" : "0",
          from: "backdate/tracking",
        },
      } as never);
    },
    [actionable],
  );

  const openProgress = useCallback((request: BackDateRequest) => {
    router.push({
      pathname: "/(main)/backdate/tracking-progress",
      params: { id: String(request.id), from: "backdate/tracking" },
    } as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: BackDateRequest }) => (
      <BackDateRequestCard
        request={item}
        awaitingMe={canApprove && actionable.has(item.id)}
        onDetails={() => openDetails(item)}
        onProgress={() => openProgress(item)}
      />
    ),
    [actionable, canApprove, openDetails, openProgress],
  );

  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={44} color={COLORS.error} />
          <Text style={styles.emptyTitle}>{error}</Text>
          <Text style={styles.emptyHint} onPress={reload}>
            Tap to try again
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Ionicons
          name="file-tray-outline"
          size={44}
          color={COLORS.textSecondary}
        />
        <Text style={styles.emptyTitle}>No BackDate requests</Text>
        <Text style={styles.emptyHint}>
          {status || company || dateFilter || search
            ? "Try widening the filters above."
            : canApprove
              ? "Nothing is waiting for your approval."
              : "Requests you raise will appear here."}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Status + Search — identical geometry to payment tracking. */}
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={STATUS_OPTIONS}
            value={status}
            onChange={(value: string) => setStatus(value as StatusFilter)}
            searchable={false}
            floatingLabel
            noBottomSpacing
          />
        </View>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Search</Text>
          <View style={styles.searchWrap}>
            <Ionicons
              name="search-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(value) => setSearch(value.toUpperCase())}
              placeholder="NO. / SAP USER"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!search && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={COLORS.textSecondary}
                />
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
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
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
          // These cards are tall — a header, chips, a two-column strip and two
          // buttons each — so the defaults mount far more than fits.
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
        />
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
              style={[styles.optionRow, !company && styles.optionRowActive]}
              onPress={() => setCompany("")}
            >
              <Text
                style={[styles.optionText, !company && styles.optionTextActive]}
              >
                All companies
              </Text>
              {!company && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
            {BACKDATE_COMPANIES.map((option) => {
              const active = company === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setCompany(option)}
                >
                  <Text
                    style={[styles.optionText, active && styles.optionTextActive]}
                  >
                    {titleCase(option)}
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

/**
 * `Completed` is not a flow status — it means approved AND the rights reached
 * SAP. It is a SUBSET of Approved, which is why both are offered: "who said
 * yes" and "who can actually post" are different questions, and they only
 * differ for the requests worth finding.
 */
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Rejected", value: "REJECTED" },
];

/** `BEVERAGES` to `Beverages`, for the filter sheet only. */
const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header: matches payment tracking exactly.
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

  // Gradient count bar.
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

  // List.
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

  // Filter sheet.
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
