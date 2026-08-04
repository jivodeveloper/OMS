import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { ms } from "@/src/utils/responsive";
import Dropdown from "@/src/components/common/DropdownProps";
import type { ApprovalStatusFilter } from "../types";

interface ApprovalFilterBarProps {
  status: ApprovalStatusFilter;
  search: string;
  onChangeStatus: (value: ApprovalStatusFilter) => void;
  onChangeSearch: (value: string) => void;
}

const STATUS_OPTIONS: { label: string; value: ApprovalStatusFilter }[] = [
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
  { label: "All", value: "All" },
];

/** Status dropdown + search, laid out as one row like the Order List filters. */
function ApprovalFilterBar({
  status,
  search,
  onChangeStatus,
  onChangeSearch,
}: ApprovalFilterBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.statusCol}>
        <Text style={styles.label}>Status</Text>
        <Dropdown
          label=""
          data={STATUS_OPTIONS}
          value={status}
          onChange={onChangeStatus}
          placeholder="Status"
          searchable={false}
          iconColor={COLORS.textSecondary}
          noBottomSpacing
        />
      </View>

      <View style={styles.searchCol}>
        <Text style={styles.label}>Search</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={onChangeSearch}
            placeholder="Request No. / Party Name"
            placeholderTextColor={COLORS.textSecondary}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity
              onPress={() => onChangeSearch("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default React.memo(ApprovalFilterBar);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statusCol: {
    // A quarter of the row: the status values are short ("All", "Pending"),
    // so the space is better spent on the search field.
    flex: 1,
  },
  searchCol: {
    // Three quarters — party names and request numbers are long.
    flex: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  searchWrap: {
    alignSelf: "stretch",
    height: ms(56),
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBackground,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
});
