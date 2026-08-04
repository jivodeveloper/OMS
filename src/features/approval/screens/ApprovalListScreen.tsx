import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { COLORS } from "@/src/constants/theme";
import ApprovalCard from "../components/ApprovalCard";
import ApprovalFilterBar from "../components/ApprovalFilterBar";
import ApprovalSummaryCard from "../components/ApprovalSummaryCard";
import ApprovalSkeleton from "../components/ApprovalSkeleton";
import EmptyApprovalState from "../components/EmptyApprovalState";
import { useApprovalList } from "../hooks/useApprovalList";
import type { ApprovalRequest } from "../types";

interface ApprovalListScreenProps {
  /**
   * Scopes the queue to one document type. Payment and Deposit requests are
   * separate screens so an approver only ever sees what they can act on.
   */
  documentType?: "PAYMENT" | "DEPOSIT";
}

export default function ApprovalListScreen({
  documentType,
}: ApprovalListScreenProps = {}) {
  const {
    requests,
    loading,
    refreshing,
    error,
    search,
    status,
    setSearch,
    setStatus,
    onRefresh,
    retry,
  } = useApprovalList(documentType);

  const [dateFilter, setDateFilter] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleViewDetails = useCallback((request: ApprovalRequest) => {
    // `id` is the API primary key and `requestNo` the human-readable document
    // number. Both travel: the details screen fetches by id, and shows the
    // number immediately so the header is not blank while loading.
    router.push({
      pathname: "/(main)/approval/approval-details",
      params: { id: request.id, requestNo: request.requestNo },
    } as never);
  }, []);

  /**
   * Reject from the list.
   *
   * Remarks are MANDATORY server-side, so this cannot be a one-tap action —
   * it opens the details screen, where the reject dialog collects a reason.
   * Rejecting blind from a list row would only produce a 400.
   */
  const handleReject = useCallback((request: ApprovalRequest) => {
    router.push({
      pathname: "/(main)/approval/approval-details",
      params: {
        id: request.id,
        requestNo: request.requestNo,
        action: "reject",
      },
    } as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ApprovalRequest }) => (
      <ApprovalCard
        request={item}
        onViewDetails={handleViewDetails}
        onReject={handleReject}
      />
    ),
    [handleViewDetails, handleReject],
  );

  const keyExtractor = useCallback((item: ApprovalRequest) => item.id, []);

  // Filters are "active" whenever they'd hide something, which drives both the
  // summary dot and the wording of the empty state.
  const filtersActive = status !== "All" || search.trim().length > 0;

  return (
    <View style={styles.container}>
      <ApprovalFilterBar
        status={status}
        search={search}
        onChangeStatus={setStatus}
        onChangeSearch={setSearch}
      />

      {/* Rendered even when the list is empty — it holds the Filter control, so
          hiding it would strand the user with no way to undo the filter. */}
      <ApprovalSummaryCard
        count={requests.length}
        filterActive={filtersActive}
        dateLabel={dateFilter || "Date"}
        onPressFilter={() => setStatus(status === "All" ? "Pending" : "All")}
        onPressDate={() => setShowDatePicker(true)}
      />

      {showDatePicker ? (
        <DateTimePicker
          value={dateFilter ? new Date(dateFilter) : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setDateFilter(selectedDate.toISOString().split("T")[0]);
            }
          }}
        />
      ) : null}

      {loading ? (
        <ApprovalSkeleton />
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyApprovalState
              error={error}
              filtered={filtersActive}
              onRetry={retry}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          // Windowing keeps memory flat as the list grows past the dummy 18.
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
});
