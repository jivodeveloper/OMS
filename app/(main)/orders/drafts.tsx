import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { orderService } from "@/src/services/order.service";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import StateWrapper from "@/src/components/common/StateWrapper";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    try {
      setError(null);
      const data = await orderService.getDrafts();
      setDrafts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("Error loading drafts:", err);
      setError("Failed to load drafts.");
      setDrafts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDrafts();
    }, [loadDrafts]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDrafts();
  };

  const handleContinue = (order: any) => {
    router.navigate({
      pathname: "/(main)/orders/create",
      params: {
        orderId: order.id,
        mode: "edit",
        from: "orders/drafts",
        fromOrderId: order.id,
      },
    });
  };

  const handleDelete = (order: any) => {
    Alert.alert(
      "Delete draft",
      `Delete draft ${order.order_number}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingId(order.id);
              await orderService.deleteDraft(order.id);
              setDrafts((prev) => prev.filter((d) => d.id !== order.id));
            } catch (err) {
              console.log("Error deleting draft:", err);
              Alert.alert("Error", "Unable to delete this draft.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const itemCount = Array.isArray(item.items) ? item.items.length : 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>{item.order_number}</Text>
          <View style={styles.draftBadge}>
            <Text style={styles.draftBadgeText}>DRAFT</Text>
          </View>
        </View>

        <Text style={styles.party}>{item.card_name || item.card_code || "No party selected"}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{itemCount} item{itemCount === 1 ? "" : "s"}</Text>
          <Text style={styles.meta}>₹ {Number(item.total_amount || 0).toFixed(2)}</Text>
        </View>
        <Text style={styles.savedAt}>Last saved: {formatDateTime(item.created_at)}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.continueBtn} onPress={() => handleContinue(item)}>
            <Ionicons name="create-outline" size={16} color={COLORS.textLight} />
            <Text style={styles.continueBtnText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            disabled={deletingId === item.id}
          >
            {deletingId === item.id ? (
              <ActivityIndicator size="small" color="#ca1111" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#ca1111" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <StateWrapper loading={loading} error={error} onRetry={loadDrafts}>
      <FlatList
        data={drafts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>No saved drafts</Text>
            <Text style={styles.emptySub}>
              Use "Draft" on the Create Order screen to save an order for later.
            </Text>
          </View>
        }
      />
    </StateWrapper>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: SPACING.md,
    gap: SPACING.md,
    flexGrow: 1,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderNumber: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  draftBadge: {
    backgroundColor: COLORS.primaryLighter,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  draftBadgeText: { color: COLORS.primary, fontWeight: "700", fontSize: 10 },
  party: { fontSize: 14, color: COLORS.textSecondary },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  meta: { fontSize: 13, color: COLORS.text, fontWeight: "600" },
  savedAt: { fontSize: 12, color: COLORS.textSecondary },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  continueBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  continueBtnText: { color: COLORS.textLight, fontWeight: "600" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#ca1111",
    backgroundColor: COLORS.surface,
  },
  deleteBtnText: { color: "#ca1111", fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { fontSize: 16, fontWeight: "600", color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
});
