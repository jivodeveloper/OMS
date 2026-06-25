import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
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

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.quotation_status !== statusFilter) return false;
      if (!term) return true;
      return (
        String(row.order_number || "").toLowerCase().includes(term) ||
        String(row.card_code || "").toLowerCase().includes(term) ||
        String(row.card_name || "").toLowerCase().includes(term) ||
        String(row.doc_num ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

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
          {STATUS_FILTERS.map((value) => {
            const active = statusFilter === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {value === "ALL" ? "All" : STATUS_STYLES[value].label}
                </Text>
              </TouchableOpacity>
            );
          })}
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
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
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
