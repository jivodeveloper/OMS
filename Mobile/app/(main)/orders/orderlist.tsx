import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ApproveOr,
  OrderItemList,
  orderService,
  productService,
} from "@/src/services/order.service";
import { COLORS } from "@/constants/theme";

const STATUS_TABS = [
  { key: "6", label: "Pending", color: "#FF9800" },
  { key: "2", label: "Approved", color: "#4CAF50" },
  { key: "4", label: "Rejected", color: "#F44336" },
];

export default function BillingOrderList() {
  const [pendingActionType, setPendingActionType] = useState<
    "NEED_APPROVAL" | "BILLING_PENDING" | null
  >(null);

  const [orders, setOrders] = useState<OrderItemList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("3");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState<number | null>(
    null,
  );

  // Reject Modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingReason, setPendingReason] = useState("");

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const openPendingModal = (orderId: number) => {
    setSelectedOrderId(orderId);
    setPendingReason("");
    setPendingModalVisible(true);
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await productService.getOrders(0, activeTab);

      console.log("datavalue" + JSON.stringify(data));
      setOrders(data);
    } catch (error) {
      console.log("Error loading orders:", error);
      Alert.alert("Error", "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleApprove = (order: OrderItemList) => {
    console.log("Approve order:", order.id);
    Alert.alert("Approve Order", `Approve order ${order.order_number}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          try {
            setActionLoading(order.id);

            const payload: ApproveOr = {
              order_id: order.id,
              card_code: order.card_code,
              created_at: order.created_at,
              po_number: order.order_number,
              ship_to_address: order.ship_to_address,
              bill_to_address: order.bill_to_address,
              dispatch_from_id: order.dispatch_from_id,
              items: order.items || [],
            };

            // const ap_res = await productService.updatestatus(
            //   order.id,
            //   "6",
            //   "Approved",
            // );

            const res = await productService.sapApproveOrder(payload);
            console.log("Approval response:", JSON.stringify(res));

            Alert.alert("Success", "Order approved");
            loadOrders();
          } catch (err) {
            console.log(err);
            Alert.alert("Error", "Approval failed");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const openRejectModal = (orderId: number) => {
    setSelectedOrderId(orderId);
    setRejectReason("");
    setRejectModalVisible(true);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Error", "Please enter rejection reason");
      return;
    }

    try {
      setActionLoading(selectedOrderId);
      await productService.updatestatus(selectedOrderId!, "7", rejectReason);
      setRejectModalVisible(false);
      Alert.alert("Success", "Order rejected");
      loadOrders();
    } catch (error) {
      console.log("Error rejecting:", error);
      Alert.alert("Error", "Failed to reject order");
    } finally {
      setActionLoading(null);
    }
  };

  const renderOrder = ({ item }: { item: OrderItemList }) => (
    <View style={styles.orderCard}>
      {/* Header */}
      <View style={styles.orderHeader}>
        <Text style={styles.orderNumber}>{item.order_number}</Text>
        {/* <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                STATUS_TABS.find((t) => t.key === item.status)?.color || "#666",
            },
          ]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View> */}
      </View>

      {/* Party Info */}
      <Text style={styles.cardName}>{item.card_name}</Text>
      <Text style={styles.cardCode}>{item.card_code}</Text>

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="cube-outline" size={16} color={COLORS.textLight} />
          <Text style={styles.detailText}>{item.items_count} items</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons
            name="calendar-outline"
            size={16}
            color={COLORS.textLight}
          />
          <Text style={styles.detailText}>{item.created_at}</Text>
        </View>
      </View>

      {/* Amount */}
      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>₹{item.total_amount}</Text>
      </View>

      {/* Action Buttons - Only for Pending */}
      {activeTab === "3" && (
        <>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => openRejectModal(item.id)}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleApprove(item)}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.moreBtn]}
              onPress={() =>
                setActionMenuVisible(
                  actionMenuVisible === item.id ? null : item.id,
                )
              }
            >
              <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>More</Text>
            </TouchableOpacity>
          </View>
          <View>
            {/* Dropdown should be here */}
            {actionMenuVisible === item.id && (
              <View style={styles.dropdownMenu}>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setActionMenuVisible(null);
                    setPendingActionType("NEED_APPROVAL");
                    openPendingModal(item.id);
                  }}
                >
                  <Text style={styles.dropdownText}>Need Approval</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setActionMenuVisible(null);
                    setPendingActionType("BILLING_PENDING");
                    openPendingModal(item.id);
                  }}
                >
                  <Text style={styles.dropdownText}>Billing Pending</Text>
                </TouchableOpacity>

                {/* <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setActionMenuVisible(null);
                    openPendingModal(item.id);
                  }}
                >
                  <Text style={styles.dropdownText}>Pending</Text>
                </TouchableOpacity> */}
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name={
          activeTab === "3"
            ? "checkmark-done-circle-outline"
            : "document-text-outline"
        }
        size={64}
        color={COLORS.textLight}
      />
      <Text style={styles.emptyText}>
        {activeTab === "3" ? "No pending orders" : `No ${activeTab} orders`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Orders Count */}
      {!loading && orders.length > 0 && (
        <View style={styles.countBar}>
          <Text style={styles.countText}>
            {orders.length} order{orders.length > 1 ? "s" : ""} found
          </Text>
        </View>
      )}
      
      {/* Orders List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Reject Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Order</Text>
            <Text style={styles.modalSubtitle}>
              Please provide a reason for rejection:
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmRejectBtn]}
                onPress={() => handleReject()}
                disabled={actionLoading !== null}
              >
                {actionLoading !== null ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmRejectText}>Reject Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pending Modal */}
      <Modal
        visible={pendingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ color: "#000", fontWeight: "600" }}>
              {pendingActionType?.toUpperCase() === "NEED_APPROVAL"
                ? "Mark as Need Approval"
                : "Mark as Billing Pending"}
            </Text>

            <Text style={styles.modalSubtitle}>
              Please provide pending reason:
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason..."
              value={pendingReason}
              onChangeText={setPendingReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setPendingModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.pendingBtn]}
                onPress={handleReject}
                disabled={actionLoading !== null}
              >
                {actionLoading !== null ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    Mark Pending
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    padding: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textLight,
  },
  activeTabText: {
    color: "#fff",
  },
  countBar: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  countText: {
    color: "#fff",
    fontWeight: "500",
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  cardName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  cardCode: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  amountLabel: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },

  approveBtn: {
    backgroundColor: COLORS.success,
  },

  pendingBtn: {
    backgroundColor: COLORS.pending,
  },

  needapproveBtn: {
    backgroundColor: COLORS.warning,
  },

  rejectBtn: {
    backgroundColor: COLORS.error,
  },

  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textLight,
    marginTop: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },

  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 16,
  },

  reasonInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 16,
  },

  modalActions: {
    flexDirection: "row",
    gap: 12,
  },

  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  cancelBtn: {
    backgroundColor: COLORS.background,
  },

  cancelBtnText: {
    color: COLORS.text,
    fontWeight: "600",
  },

  confirmRejectBtn: {
    backgroundColor: COLORS.error,
  },

  confirmRejectText: {
    color: "#fff",
    fontWeight: "600",
  },
  moreBtn: {
    backgroundColor: "#607D8B",
  },

  dropdownMenu: {
    backgroundColor: "#fff",
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  dropdownText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
});
