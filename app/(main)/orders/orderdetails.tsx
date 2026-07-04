import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "@/constants/theme";
import StateWrapper from "@/src/components/common/StateWrapper";
import { orderService, productService } from "@/src/services/order.service";
import { useAuth } from "@/src/context/AuthContext";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";

const toNumber = (value: string | number | null | undefined): number =>
  typeof value === "number" ? value : parseFloat(String(value ?? "")) || 0;

const formatDisplayNumber = (value: string | number | null | undefined) => {
  const numericValue = toNumber(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.?0+$/, "");
};

const formatCurrencyAmount = (value: string | number | null | undefined) =>
  toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getItemSchemes = (item: any) => {
  const schemes = Array.isArray(item?.schemes) ? item.schemes : [];
  if (schemes.length) return schemes;
  if (item?.scheme_name || item?.scheme_id || toNumber(item?.qty_scheme) > 0) {
    return [
      {
        id: item.scheme_id ?? "legacy",
        scheme_id: item.scheme_id,
        scheme_name: item.scheme_name,
        scheme_qty: item.qty_scheme,
        qty_scheme: item.qty_scheme,
      },
    ];
  }
  return [];
};

const getSchemeQty = (scheme: any) =>
  toNumber(scheme?.scheme_qty ?? scheme?.qty_scheme ?? scheme?.qty);

const normalizeStatusText = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const getOrderStatusCodes = (order: any) =>
  [
    order?.status_id,
    order?.status?.id,
    order?.status_code,
    order?.status?.code,
    order?.status,
    order?.status_name,
    order?.status_display,
  ].map(normalizeStatusText);

const hasStatusCode = (statuses: string[], code: string) =>
  statuses.includes(code.toLowerCase());

const hasStatusText = (statuses: string[], text: string) =>
  statuses.some((status) => status === text || status.includes(text));

const isPendingActionStatusForRole = (order: any, userRole: string) => {
  if (!order) return false;

  const statuses = getOrderStatusCodes(order);

  if (userRole === "approver") {
    return (
      hasStatusCode(statuses, "RATE_APPROVAL") ||
      hasStatusCode(statuses, "NEED_APPROVAL") ||
      statuses.includes("2") ||
      statuses.includes("4") ||
      hasStatusText(statuses, "rate approval") ||
      hasStatusText(statuses, "need approval")
    );
  }

  if (userRole === "billing") {
    return (
      hasStatusCode(statuses, "BILLING") ||
      hasStatusCode(statuses, "BILLING_PENDING") ||
      statuses.includes("3") ||
      statuses.includes("5") ||
      hasStatusText(statuses, "billing pending")
    );
  }

  if (userRole === "auditor") {
    return (
      hasStatusCode(statuses, "AUDITOR_APPROVAL") ||
      statuses.includes("10") ||
      hasStatusText(statuses, "auditor approval")
    );
  }

  return false;
};

const getBillingApprovalMessage = (response: any) => {
  const status = String(response?.status || "").trim();
  const message = String(response?.message || "").trim();
  const combined = `${status} ${message}`.toLowerCase();

  if (message) return message;
  if (combined.includes("auditor")) return "Order sent to auditor approval successfully";
  if (combined.includes("complete")) return "Order completed successfully";
  if (status) return `Order moved to ${status}`;
  return "Order approved successfully";
};

export default function OrderDetailsScreen() {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || "";
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { orderId, from, sourceTab } = useLocalSearchParams<{
    orderId?: string;
    from?: string;
    sourceTab?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{ type: "approve" | "reject" } | null>(null);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [approveRemark, setApproveRemark] = useState("");

  useEffect(() => {
    if (userRole !== "billing") return;
    const parsedId = Number(Array.isArray(orderId) ? orderId[0] : orderId);
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() =>
            router.navigate({
              pathname: "/(main)/orders/create",
              params: {
                orderId: parsedId,
                mode: "edit",
                from: "orders/orderdetails",
                fromOrderId: parsedId,
              },
            })
          }
          style={{ marginRight: 16 }}
        >
          <Ionicons name="create-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, userRole, orderId]);

  const fetchOrder = useCallback(async (id: number, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setOrder(null);
      }
      setError(null);

      const res = await orderService.getorderdetailsbyid(id);
      console.log("Fetching details for order ID:", JSON.stringify(res));
      setOrder(res?.data || res);
    } catch (error) {
      console.error("Error fetching order details:", error);
      setError("Failed to load order details.");
      if (!isRefresh) {
        setOrder(null);
      }
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const parsedOrderId = Number(Array.isArray(orderId) ? orderId[0] : orderId);
    if (!parsedOrderId) {
      setOrder(null);
      setLoading(false);
      return;
    }
    fetchOrder(parsedOrderId);
  }, [fetchOrder, orderId]);

  const itemsList = order?.items || order?.order_items || order?.orderItems || [];
  const parsedOrderId = Number(Array.isArray(orderId) ? orderId[0] : orderId);
  const subtotalAmount = itemsList.reduce(
    (sum: number, item: any) => sum + toNumber(item?.total),
    0,
  );
  const calculatedTaxAmount = itemsList.reduce(
    (sum: number, item: any) =>
      sum + (toNumber(item?.total) * toNumber(item?.tax_rate)) / 100,
    0,
  );
  const grandTotalAmount =
    order?.grand_total ?? subtotalAmount + calculatedTaxAmount;
  const totalSubLabelText =
    calculatedTaxAmount > 0
      ? `Includes tax of ₹${formatCurrencyAmount(calculatedTaxAmount)}`
      : "Inclusive of tax amount";

  const onRefresh = useCallback(() => {
    if (!parsedOrderId) return;
    fetchOrder(parsedOrderId, true);
  }, [fetchOrder, parsedOrderId]);

  useAndroidBackOverride(
    useCallback(() => {
      if (!from || typeof from !== "string") {
        return false;
      }
      navigation.navigate(from as never);
      return true;
    }, [from, navigation]),
  );

  const isOpenedFromOthersTab = sourceTab === "others";
  const canActOnOrder =
    !isOpenedFromOthersTab && isPendingActionStatusForRole(order, userRole);

  const openPendingScreen = () => {
    const params = { tab: "pending", _t: String(Date.now()) };
    const sourceScreen = typeof from === "string" ? from : "";
    const navigate = (screen: string) =>
      (navigation as any).navigate(screen, params);

    if (sourceScreen === "approver/pending_approval") {
      navigate("approver/pending_approval");
      return;
    }

    if (sourceScreen === "orders/auditorapproval") {
      navigate("orders/auditorapproval");
      return;
    }

    if (sourceScreen === "orders/orderlist") {
      navigate("orders/orderlist");
      return;
    }

    if (userRole === "approver") {
      navigate("approver/pending_approval");
      return;
    }

    if (userRole === "auditor") {
      navigate("orders/auditorapproval");
      return;
    }

    if (userRole === "billing") {
      navigate("orders/orderlist");
    }
  };

  const showSuccessAndOpenPending = (message: string) => {
    Alert.alert("Success", message, [{ text: "OK", onPress: openPendingScreen }]);
  };

  const handleApprove = async () => {
    const remark = approveRemark.trim();
    try {
      setActionLoading({ type: "approve" });
      if (userRole === "auditor") {
        const res = await productService.sapApproveOrder({ order_id: parsedOrderId });
        if (!res?.success) {
          let msg = "Sales quotation creation failed";
          try {
            const sapError = JSON.parse(res?.data?.error || "{}");
            msg = sapError?.error?.message || res?.message || res?.data?.error || msg;
          } catch {
            msg = res?.message || res?.data?.error || msg;
          }
          throw new Error(msg);
        }
        await productService.updatestatus(parsedOrderId, "9", remark || "Sales quotation created by auditor");
        setApproveModalVisible(false);
        setApproveRemark("");
        showSuccessAndOpenPending("Sales quotation created successfully");
      } else if (userRole === "billing") {
        const response = await productService.updatestatus(
          parsedOrderId,
          "10",
          remark || "Accepted by billing",
        );
        setApproveModalVisible(false);
        setApproveRemark("");
        showSuccessAndOpenPending(getBillingApprovalMessage(response));
      } else {
        await productService.updatestatus(parsedOrderId, "6", remark || "Approved");
        setApproveModalVisible(false);
        setApproveRemark("");
        showSuccessAndOpenPending("Order approved successfully");
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Error", "Please enter a rejection reason");
      return;
    }
    try {
      setActionLoading({ type: "reject" });
      const rejectStatus = userRole === "billing" ? "8" : "7";
      await productService.updatestatus(parsedOrderId, rejectStatus, rejectReason);
      setRejectModalVisible(false);
      setRejectReason("");
      showSuccessAndOpenPending("Order rejected");
    } catch {
      Alert.alert("Error", "Failed to reject order");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <StateWrapper loading={loading} error={error} onRetry={() => fetchOrder(parsedOrderId)}>
      {loading && !order ? (
        <View style={styles.loader} />
      ) : !order ? (
        <View style={styles.loader}>
          <Text>Order not found</Text>
        </View>
      ) : (
        <View style={styles.screenWrap}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: canActOnOrder ? 24 : insets.bottom + 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
          >
            {/* ===== Header ===== */}
            <LinearGradient
              colors={[COLORS.primaryDark, COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderNo}>{order.order_number}</Text>
                  <View style={styles.partyRow}>
                    <Text style={styles.party}>{order.card_name}</Text>
                    {!!order.party_state && (
                      <>
                        <View style={styles.greenDot} />
                        <Text style={styles.party}>{order.party_state}</Text>
                      </>
                    )}
                  </View>
                </View>
                <View style={[styles.statusPill, canActOnOrder && styles.statusPillPending]}>
                  <Ionicons
                    name={canActOnOrder ? "time-outline" : "checkmark-circle-outline"}
                    size={14}
                    color={canActOnOrder ? "#EA8C00" : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: canActOnOrder ? "#EA8C00" : COLORS.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {canActOnOrder
                      ? "Pending Approval"
                      : order.status_name || order.status_display || order.status || "Order"}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* ===== Order Info ===== */}
            <View style={styles.card}>
              <SectionTitle icon="information-circle-outline" title="Order Info" />
              <InfoRow label="Party State" value={order.party_state} />
              <InfoRow label="Punched By" value={order.created_by_name} />
              <InfoRow label="Delivery Date" value={order.delivery_date} />
              <InfoRow label="PO Number" value={order.po_number} />
              <InfoRow label="Bill To" value={order.bill_to_address} />
              <InfoRow label="Ship To" value={order.ship_to_address} />
              <InfoRow label="Comment" value={order.remarks} />
            </View>

            {/* ===== Items ===== */}
            <View style={styles.card}>
              <SectionTitle
                icon="cube-outline"
                title={`Items (${order.items_count || itemsList.length})`}
              />
              <FlatList
                data={itemsList}
                keyExtractor={(i) => i.id.toString()}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const bp = parseFloat(item.price_list_basic) || 0;
                  const mp = parseFloat(item.basic_price) || 0;
                  const isFlagged = mp > 0 && mp < bp;
                  const itemLtrs = formatDisplayNumber(item.ltrs);
                  const itemSchemes = getItemSchemes(item);
                  const totalSchemeQty = itemSchemes.reduce(
                    (sum: number, scheme: any) => sum + getSchemeQty(scheme),
                    0,
                  );
                  const totalLtrs = formatDisplayNumber(
                    toNumber(item.ltrs) + totalSchemeQty,
                  );

                  return (
                    <View style={[styles.itemRow, isFlagged && styles.flaggedItem]}>
                      <View style={{ flex: 1 }}>
                        <InfoRow label="Item Name" value={item.item_name} />
                        <InfoRow label="Item Code" value={item.item_code} />
                        <InfoRow label="Price List (Basic)" value={`₹${item.price_list_basic}`} />
                        <InfoRow label="Basic Price" value={`₹${item.basic_price}`} highlight={isFlagged} />
                        <InfoRow label="Boxes" value={item.boxes} />
                        <InfoRow label="PCS/Case" value={item.pcs} />
                        <InfoRow label="Total PCS" value={item.qty} />
                        <InfoRow label="Item Ltrs" value={itemLtrs} />
                        <InfoRow label="Total Ltrs" value={totalLtrs} bold />
                        <InfoRow label="Total" value={`₹${item.total}`} />
                        {false && !!item.scheme_name && (
                          <View style={styles.schemeBadge}>
                            <Ionicons name="pricetag-outline" size={13} color="#7C3AED" />
                            <Text style={styles.schemeBadgeText}>
                              {item.scheme_name}
                              {item.qty_scheme > 0 ? `  ·  Qty: ${item.qty_scheme}` : ""}
                            </Text>
                          </View>
                        )}
                        {itemSchemes.map((scheme: any, index: number) => (
                          <View
                            key={`${scheme.id ?? scheme.scheme_id ?? scheme.scheme_name}-${index}`}
                            style={styles.schemeBadge}
                          >
                            <Ionicons name="pricetag-outline" size={13} color="#7C3AED" />
                            <Text style={styles.schemeBadgeText}>
                              {scheme.scheme_name || scheme.scheme_id || `Scheme ${index + 1}`}
                              {getSchemeQty(scheme) > 0 ? ` - Qty: ${formatDisplayNumber(getSchemeQty(scheme))}` : ""}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                }}
              />
              <View style={styles.subtotalRow}>
                <InfoRow
                  label="Subtotal"
                  value={`Rs ${formatCurrencyAmount(subtotalAmount)}`}
                />
              </View>
            </View>

            {/* ===== Total ===== */}
            <LinearGradient
              colors={[COLORS.primaryDark, COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.totalCard}
            >
              <View style={styles.totalInfo}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.totalSubLabel}>{totalSubLabelText}</Text>
              </View>
              <View style={styles.totalAmountWrap}>
                <Text style={styles.totalValue}>₹{formatCurrencyAmount(grandTotalAmount)}</Text>
                <Text style={styles.totalAmountHint}>Final payable</Text>
              </View>
            </LinearGradient>
          </ScrollView>

          {/* ===== Fixed bottom action bar ===== */}
          {canActOnOrder && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => setRejectModalVisible(true)}
                disabled={actionLoading !== null}
                activeOpacity={0.85}
              >
                <Ionicons name="close-circle-outline" size={26} color="#fff" />
                <View>
                  <Text style={styles.actionBtnTitle}>Reject</Text>
                  <Text style={styles.actionBtnSub}>Decline this order</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => setApproveModalVisible(true)}
                disabled={actionLoading !== null}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={26} color="#fff" />
                <View>
                  <Text style={styles.actionBtnTitle}>Approve</Text>
                  <Text style={styles.actionBtnSub}>Approve this order</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== Approve Dialog ===== */}
          <ActionDialog
            visible={approveModalVisible}
            type="approve"
            remark={approveRemark}
            onChangeRemark={setApproveRemark}
            loading={actionLoading?.type === "approve"}
            onCancel={() => {
              if (actionLoading !== null) return;
              setApproveModalVisible(false);
            }}
            onConfirm={handleApprove}
          />

          {/* ===== Reject Dialog ===== */}
          <ActionDialog
            visible={rejectModalVisible}
            type="reject"
            remark={rejectReason}
            onChangeRemark={setRejectReason}
            loading={actionLoading?.type === "reject"}
            onCancel={() => {
              if (actionLoading !== null) return;
              setRejectModalVisible(false);
            }}
            onConfirm={handleReject}
          />
        </View>
      )}
    </StateWrapper>
  );
}

/* ---------------- Components ---------------- */

const SectionTitle = ({ icon, title }: any) => (
  <View style={styles.sectionTitleRow}>
    <Ionicons name={icon} size={18} color={COLORS.primary} />
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const InfoRow = ({ label, value, highlight, bold }: any) =>
  value ? (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, bold && styles.boldInfoText]}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          bold && styles.boldInfoText,
          highlight && { color: COLORS.error, fontWeight: "800" },
        ]}
      >
        {value}
      </Text>
    </View>
  ) : null;

type ActionDialogProps = {
  visible: boolean;
  type: "approve" | "reject";
  remark: string;
  onChangeRemark: (value: string) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ActionDialog = ({
  visible,
  type,
  remark,
  onChangeRemark,
  loading,
  onCancel,
  onConfirm,
}: ActionDialogProps) => {
  const progress = useSharedValue(0);
  const isApprove = type === "approve";
  const accent = isApprove ? COLORS.success : COLORS.error;

  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, { damping: 15, stiffness: 180, mass: 0.7 });
    } else {
      progress.value = withTiming(0, { duration: 140 });
    }
  }, [visible, progress]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.88 + progress.value * 0.12 }, { translateY: (1 - progress.value) * 24 }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View style={[styles.dialogOverlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.dialogKav}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.dialogCard, cardStyle]}>
            <View style={[styles.dialogIconWrap, { backgroundColor: isApprove ? "#DCFCE7" : "#FEE2E2" }]}>
              <Ionicons name={isApprove ? "checkmark-done" : "close"} size={30} color={accent} />
            </View>
            <Text style={styles.dialogTitle}>{isApprove ? "Approve Order" : "Reject Order"}</Text>
            <Text style={styles.dialogMessage}>
              {isApprove
                ? "Confirm approval for this order. You can add an optional remark below."
                : "Please provide a reason for rejecting this order."}
            </Text>

            <Text style={styles.dialogRemarkLabel}>
              {isApprove ? "Remarks (optional)" : "Rejection reason"}
            </Text>
            <TextInput
              style={styles.dialogInput}
              placeholder={isApprove ? "Add a remark..." : "Enter reason..."}
              placeholderTextColor="#94A3B8"
              value={remark}
              onChangeText={onChangeRemark}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!loading}
            />

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={[styles.dialogBtn, styles.dialogCancelBtn]}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: accent }]}
                onPress={onConfirm}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.dialogConfirmText}>{isApprove ? "Approve" : "Reject"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  infoLabel: {
    width: 110,
    fontSize: 13,
    color: COLORS.black,
  },
  infoColon: {
    marginHorizontal: 4,
    color: COLORS.textLight,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  boldInfoText: {
    fontWeight: "800",
  },
  container: { flex: 1, backgroundColor: "#F4F6FA" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    padding: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  orderNo: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },
  party: {
    color: "#fff",
    opacity: 0.92,
    fontSize: 13,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
    marginHorizontal: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginLeft: 12,
    maxWidth: 150,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusPillPending: {
    backgroundColor: "#FFF7ED",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    margin: 16,
    marginBottom: 0,
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  flaggedItem: {
    backgroundColor: "#FFF3F3",
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
    paddingLeft: 10,
    borderRadius: 6,
  },
  itemName: { fontWeight: "700", fontSize: 14 },
  itemCode: { fontSize: 12, color: COLORS.textLight },
  itemQty: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  priceWrap: { alignItems: "flex-end" },
  price: { fontWeight: "700", fontSize: 14 },
  lineTotal: { fontSize: 12, color: COLORS.textLight },
  subtotalRow: {
    marginTop: 10,
  },
  totalCard: {
    margin: 16,
    borderRadius: 20,
    padding: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  totalInfo: {
    flex: 1,
    paddingRight: 16,
  },
  totalLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  totalSubLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  totalAmountWrap: {
    alignItems: "flex-end",
  },
  totalValue: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  totalAmountHint: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  schemeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F3FF",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    marginTop: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  schemeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },

  // ===== Fixed bottom action bar =====
  bottomBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    borderRadius: 16,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rejectBtn: {
    backgroundColor: COLORS.error,
    shadowColor: COLORS.error,
  },
  approveBtn: {
    backgroundColor: COLORS.success,
    shadowColor: COLORS.success,
  },
  actionBtnTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  actionBtnSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    marginTop: 1,
  },

  // ===== Approve / Reject Dialog =====
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialogKav: {
    width: "100%",
    alignItems: "center",
  },
  dialogCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  dialogIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 6,
  },
  dialogMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 18,
  },
  dialogRemarkLabel: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  dialogInput: {
    width: "100%",
    borderWidth: 1.4,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    minHeight: 84,
    color: COLORS.text,
    backgroundColor: "#F8FAFC",
    marginBottom: 18,
  },
  dialogActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogCancelBtn: {
    backgroundColor: "#F1F5F9",
  },
  dialogCancelText: {
    fontWeight: "700",
    color: COLORS.text,
    fontSize: 15,
  },
  dialogConfirmText: {
    fontWeight: "800",
    color: "#fff",
    fontSize: 15,
  },
});
