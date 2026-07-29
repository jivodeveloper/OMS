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

export default function ApprovalListScreen() {
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
  } = useApprovalList();

  const [dateFilter, setDateFilter] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleViewDetails = useCallback((request: ApprovalRequest) => {
    // Only the identifier travels; the details screen loads its own payload, so
    // a deep link into it works the same as arriving from this list.
    router.push({
      pathname: "/(main)/approval/approval-details",
      params: { requestNo: request.requestNo },
    } as never);
  }, []);

  const handleReject = useCallback((request: ApprovalRequest) => {
    // UI-only: the reject flow (remark dialog + API) comes with the next phase.
    console.log("Reject requested for", request.requestNo);
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
