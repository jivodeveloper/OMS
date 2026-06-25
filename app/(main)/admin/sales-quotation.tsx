import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  orderService,
  type QuotationOverviewItem,
  type QuotationStatusLabel,
} from "@/src/services/order.service";
import { COLORS } from "@/constants/theme";

const STATUS_STYLES: Record<QuotationStatusLabel, { label: string; bg: string; color: string }> = {
  CANCELLED: { label: "Cancelled", bg: "#fee2e2", color: "#dc2626" },
  OPEN: { label: "Open", bg: "#dcfce7", color: "#16a34a" },
  CLOSED: { label: "Closed", bg: "#e2e8f0", color: "#475569" },
  UNKNOWN: { label: "Unknown", bg: "#fef3c7", color: "#d97706" },
};

const STATUS_FILTERS: Array<QuotationStatusLabel | "ALL"> = ["ALL", "CANCELLED", "OPEN", "CLOSED", "UNKNOWN"];

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function SalesQuotationScreen() {
  const [rows, setRows] = useState<QuotationOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatusLabel | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await orderService.getQuotationOverview();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error loading quotation overview:", error);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reset all filters when leaving the screen so returning starts fresh.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSearch("");
        setStatusFilter("ALL");
        setCategoryFilter("");
        setStatusPickerVisible(false);
        setCategoryPickerVisible(false);
      };
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Distinct categories present across all orders (OIL / BEVERAGES / MART), used
  // to populate the category filter chips.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      const cats =
        row.categories && row.categories.length
          ? row.categories
          : String(row.category || "").split(",");
      cats.forEach((c) => {
        const value = String(c || "").trim().toUpperCase();
        if (value) set.add(value);
      });
    });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.quotation_status !== statusFilter) return false;
      if (categoryFilter) {
        const cats =
          row.categories && row.categories.length
            ? row.categories.map((c) => String(c).trim().toUpperCase())
            : String(row.category || "")
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean);
        if (!cats.includes(categoryFilter)) return false;
      }
      if (!term) return true;
      return (
        String(row.order_number || "").toLowerCase().includes(term) ||
        String(row.card_code || "").toLowerCase().includes(term) ||
        String(row.card_name || "").toLowerCase().includes(term) ||
        String(row.doc_num ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter, categoryFilter]);

  const cancelledCount = useMemo(
    () => rows.filter((r) => r.quotation_status === "CANCELLED").length,
    [rows],
  );

  const renderItem = ({ item }: { item: QuotationOverviewItem }) => {
    const style = STATUS_STYLES[item.quotation_status] || STATUS_STYLES.UNKNOWN;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>{item.order_number}</Text>
          <View style={[styles.badge, { backgroundColor: style.bg }]}>
            <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
          </View>
        </View>

        <Text style={styles.cardName}>{item.card_name}</Text>
        <Text style={styles.cardCode}>{item.card_code}</Text>

        {item.category ? (
          <View style={styles.metaRow}>
            <Ionicons name="pricetag-outline" size={14} color={COLORS.primary} />
            <Text style={styles.metaText}>Category: {item.category}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="receipt-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>SAP Doc No: {item.doc_num ?? "-"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>Created: {formatDateTime(item.created_at)}</Text>
        </View>

        {item.quotation_cancelled && (
          <View style={styles.cancelledBox}>
            <Text style={styles.cancelledText}>
              Cancelled by {item.quotation_cancelled_by || "-"} on{" "}
              {formatDateTime(item.quotation_cancelled_at)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.summary}>
          Total: {filtered.length}  |  Cancelled: {cancelledCount}
        </Text>
        <TextInput
          style={styles.search}
          placeholder="Search order / party / SAP no..."
          placeholderTextColor={COLORS.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.dropdown, styles.dropdownHalf]}
            activeOpacity={0.85}
            onPress={() => setStatusPickerVisible(true)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.dropdownLabel}>Status</Text>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {statusFilter === "ALL" ? "All" : STATUS_STYLES[statusFilter].label}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {categoryOptions.length > 0 && (
            <TouchableOpacity
              style={[styles.dropdown, styles.dropdownHalf]}
              activeOpacity={0.85}
              onPress={() => setCategoryPickerVisible(true)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.dropdownLabel}>Category</Text>
                <Text style={styles.dropdownValue} numberOfLines={1}>
                  {categoryFilter || "All Categories"}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>No completed orders found</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            {["", ...categoryOptions].map((value) => {
              const selected = categoryFilter === value;
              return (
                <TouchableOpacity
                  key={value || "ALL"}
                  style={[styles.optionRow, selected && styles.optionSelected]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setCategoryFilter(value);
                    setCategoryPickerVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {value || "All Categories"}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.pickerCancel}
              activeOpacity={0.85}
              onPress={() => setCategoryPickerVisible(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={statusPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Status</Text>
            {STATUS_FILTERS.map((value) => {
              const selected = statusFilter === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.optionRow, selected && styles.optionSelected]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setStatusFilter(value);
                    setStatusPickerVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {value === "ALL" ? "All" : STATUS_STYLES[value].label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.pickerCancel}
              activeOpacity={0.85}
              onPress={() => setStatusPickerVisible(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  toolbar: { padding: 12, gap: 10, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  summary: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  search: {
    height: 42,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
    backgroundColor: "#fff",
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 50,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  dropdownHalf: { flex: 1 },
  dropdownLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600" },
  dropdownValue: { fontSize: 14, color: COLORS.text, fontWeight: "600", marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  pickerCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, gap: 4 },
  pickerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionSelected: { backgroundColor: "#eef2ff" },
  optionText: { fontSize: 15, color: COLORS.text },
  optionTextSelected: { color: COLORS.primary, fontWeight: "700" },
  pickerCancel: { marginTop: 10, paddingVertical: 12, alignItems: "center" },
  pickerCancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: "600" },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardName: { marginTop: 6, fontSize: 14, fontWeight: "600", color: COLORS.text },
  cardCode: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 13, color: COLORS.textSecondary },
  cancelledBox: { marginTop: 8, backgroundColor: "#fee2e2", borderRadius: 8, padding: 8 },
  cancelledText: { fontSize: 12, color: "#dc2626", fontWeight: "600" },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
