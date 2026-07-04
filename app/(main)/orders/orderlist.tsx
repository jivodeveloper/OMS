import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  TextInput,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  OrderItemList,
  orderService,
  productService,
} from "@/src/services/order.service";
import { COLORS } from "@/constants/theme";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import InlineOrderDateFilter, { type DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import { api } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import StateWrapper from "@/src/components/common/StateWrapper";
import { useAuth } from "@/src/context/AuthContext";
import Dropdown from "@/src/components/common/DropdownProps";

type OrderListTab = "pending" | "others";
type BillingDecisionFilter = "Billing Approved" | "Billing Rejected";
type BillingDecisionSummary = {
  decision: BillingDecisionFilter;
  performedByName: string;
};

const PENDING_STATUS_CODES = new Set([
  "BILLING",
  "BILLING_PENDING",
]);

const BILLING_DECISION_OPTIONS: Array<{ name: BillingDecisionFilter }> = [
  { name: "Billing Approved" },
  { name: "Billing Rejected" },
];

const normalizeText = (value: unknown) => String(value || "").trim().toLowerCase();

const isCompletedOrder = (
  item: Pick<OrderItemList, "status" | "status_name" | "status_display">,
) =>
  [item.status_display, item.status_name, item.status].some((value) =>
    normalizeText(value).includes("complete"),
  );

const getOrderDateValue = (value?: string) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
};

const getBillingDecisionFromLogs = (logs: any[]): BillingDecisionSummary | null => {
  const reversedLogs = [...logs].reverse();

  for (const log of reversedLogs) {
    const performedByName = String(log?.performed_by_name || "").trim();
    if (!performedByName) continue;

    const statusText = normalizeText(log?.status_name);
    const remarksText = normalizeText(log?.remarks);
    const combinedText = `${statusText} ${remarksText}`.trim();

    if (
      combinedText.includes("billing rejected") ||
      combinedText.includes("rejected by billing") ||
      (combinedText.includes("reject") && combinedText.includes("billing"))
    ) {
      return { decision: "Billing Rejected", performedByName };
    }

    if (
      combinedText.includes("accepted by billing") ||
      combinedText.includes("approved by billing") ||
      ((combinedText.includes("accept") || combinedText.includes("approv")) &&
        combinedText.includes("billing"))
    ) {
      return { decision: "Billing Approved", performedByName };
    }
  }

  return null;
};

const getBillingApprovalSuccessCopy = (status?: string | null, message?: string | null) => {
  const normalizedStatus = normalizeText(status);
  const normalizedMessage = normalizeText(message);
  const combined = `${normalizedStatus} ${normalizedMessage}`;

  if (combined.includes("auditor")) {
    return {
      title: "Sent To Auditor",
      subtitle: "Billing approval completed and forwarded to the auditor queue",
      message: message || "Order sent to auditor approval successfully",
    };
  }

  if (combined.includes("complete")) {
    return {
      title: "Order Completed",
      subtitle: "Billing approval completed and the order is now completed",
      message: message || "Order completed successfully",
    };
  }

  if (combined.includes("billing")) {
    return {
      title: "Billing Updated",
      subtitle: "Billing approval completed and moved to the next billing stage",
      message: message || "Billing status updated successfully",
    };
  }

  const displayStatus = String(status || "").trim();
  return {
    title: displayStatus ? `Sent To ${displayStatus}` : "Order Updated",
    subtitle: displayStatus
      ? `Billing approval completed and forwarded to ${displayStatus}`
      : "Billing approval completed successfully",
    message: message || "Order status updated successfully",
  };
};

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

export default function BillingOrderList() {
  const { tab, statusFilter, year, month, _t } = useLocalSearchParams<{ tab?: string; statusFilter?: string; year?: string; month?: string; _t?: string }>();
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || "";

  const [pendingActionType, setPendingActionType] = useState<
    "NEED_APPROVAL" | "BILLING_PENDING" | null
  >(null);

  const [orders, setOrders] = useState<OrderItemList[]>([]);
  const [billingDecisionByOrderId, setBillingDecisionByOrderId] = useState<
    Record<number, BillingDecisionSummary>
  >({});
  const [quotationLogByOrderId, setQuotationLogByOrderId] = useState<
    Record<number, { sap_doc_num?: string | number | null; sap_doc_entry?: number | null }>
  >({});
  const [rejectedByNameByOrderId, setRejectedByNameByOrderId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderListTab>(tab === "others" ? "others" : "pending");
  const [statusView, setStatusView] = useState<string>(
    statusFilter === "approved" ? "approved" : statusFilter === "rejected" ? "rejected" : "pending",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string | null>("ALL");
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [parties, setParties] = useState<any[]>([]);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [tempSelectedParties, setTempSelectedParties] = useState<string[]>([]);
  const [isPartyModalVisible, setIsPartyModalVisible] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [tempSelectedItems, setTempSelectedItems] = useState<string[]>([]);
  const [isItemModalVisible, setIsItemModalVisible] = useState(false);
  const [availableItems, setAvailableItems] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    statusFilter === "approved" ? ["Billing Approved"] :
    statusFilter === "rejected" ? ["Billing Rejected"] : []
  );
  const [tempSelectedStatuses, setTempSelectedStatuses] = useState<string[]>([]);
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);
  const [selectedOrderDate, setSelectedOrderDate] = useState<DateFilterValue>(() => {
    if (year && month) {
      return { mode: "month", value: `${year}-${String(month).padStart(2, "0")}` };
    }
    return null;
  });
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [loadingBillingDecisions, setLoadingBillingDecisions] = useState(false);
  const [actionLoading, setActionLoading] = useState<{
    id: number;
    type: "approve" | "reject" | "pending";
  } | null>(null);

  // Reject Modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [decisionType, setDecisionType] = useState<"approve" | "reject">("reject");

  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingReason, setPendingReason] = useState("");
  const [approvalSuccessModal, setApprovalSuccessModal] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{
    message: string;
    orderNumber: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const [focusKey, setFocusKey] = useState(0);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let data: OrderItemList[] = [];

      if (activeTab === "others") {
        const result = await api.get("/orders/status-tracking/?mode=billing");
        data = (Array.isArray(result) ? result : []).sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      } else {
        const result = await productService.getOrders(0, undefined, true);
        data = Array.isArray(result) ? result : [];
      }

      const normalized = data;
      let filtered = normalized;
      if (activeTab === "pending") {
        filtered = normalized.filter((order) => PENDING_STATUS_CODES.has(String(order.status || "").toUpperCase()));
      }

      console.log("datavalue" + JSON.stringify(filtered));
      setOrders(filtered);
    } catch (error) {
      console.log("Error loading orders:", error);
      setError("Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, focusKey]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const lastConsumedT = useRef<string | undefined>(undefined);
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      const hasNewParams = _t !== undefined && _t !== lastConsumedT.current;
      if (hasNewParams) lastConsumedT.current = _t;

      setActiveTab(hasNewParams && tab === "others" ? "others" : "pending");
      setSelectedFilter("ALL");
      setSelectedParties([]);
      setTempSelectedParties([]);
      setSelectedItems([]);
      setTempSelectedItems([]);
      setSelectedStatuses(
        hasNewParams && statusFilter === "approved" ? ["Billing Approved"] :
        hasNewParams && statusFilter === "rejected" ? ["Billing Rejected"] : []
      );
      setTempSelectedStatuses([]);
      if (hasNewParams && year && month) {
        setSelectedOrderDate({ mode: "month", value: `${year}-${String(month).padStart(2, "0")}` });
      } else {
        setSelectedOrderDate(null);
      }
      setIsFilterModalVisible(false);
      setIsPartyModalVisible(false);
      setIsItemModalVisible(false);
      setIsStatusModalVisible(false);
      setRejectModalVisible(false);
      setSelectedOrderId(null);
      setRejectReason("");
      setPendingModalVisible(false);
      setPendingReason("");
      setPendingActionType(null);
      setActionLoading(null);
      setApprovalSuccessModal(false);
      setApprovalResult(null);
      setFocusKey(k => k + 1);
    });
    return unsubscribe;
  }, [navigation, tab, statusFilter, year, month, _t]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };


  useEffect(() => {
    const loadStatuses = async () => {
      try {
        setLoadingStatuses(true);
        const token = await storage.getAccessToken();
        const statusRes = await api.get('/orders/status/', token || undefined);
        if (Array.isArray(statusRes)) {
          setStatuses(statusRes);
        }
      } catch (error) {
        console.log("Error loading statuses:", error);
      } finally {
        setLoadingStatuses(false);
      }
    };
    loadStatuses();
  }, []);

  useEffect(() => {
    const uniqueParties = new Map();
    const itemsSet = new Set<string>();

    orders.forEach((order: any) => {
      if (order.card_code) {
        uniqueParties.set(order.card_code, {
          label: `${order.card_name} (${order.card_code})`,
          value: order.card_code,
        });
      }
      const orderItems = order.items || order.order_items || order.orderItems || [];
      orderItems.forEach((i: any) => {
        const iName = String(i.item_name || i.itemName || "").trim();
        if (iName) itemsSet.add(iName);
      });
    });

    setParties(Array.from(uniqueParties.values()).sort((a, b) => a.label.localeCompare(b.label)));
    setAvailableItems(Array.from(itemsSet).sort());
  }, [orders]);

  useEffect(() => {
    let isActive = true;

    const loadQuotationLogs = async () => {
      const completedOrders = orders.filter((order) => isCompletedOrder(order));

      if (completedOrders.length === 0) {
        setQuotationLogByOrderId({});
        return;
      }

      const entries = await Promise.all(
        completedOrders.map(async (order) => {
          const fallback = {
            sap_doc_num: order.sap_doc_num ?? order.sap_doc_number ?? null,
            sap_doc_entry: order.sap_doc_entry ?? null,
          };

          if (fallback.sap_doc_num != null || fallback.sap_doc_entry != null) {
            return [order.id, fallback] as const;
          }

          try {
            const quotationLog = await orderService.getQuotationLog(order.id);
            return [
              order.id,
              {
                sap_doc_num: quotationLog?.sap_doc_num ?? null,
                sap_doc_entry: quotationLog?.sap_doc_entry ?? null,
              },
            ] as const;
          } catch (error) {
            console.log(`Error loading quotation log for order ${order.id}:`, error);
            return [order.id, fallback] as const;
          }
        }),
      );

      if (!isActive) return;

      setQuotationLogByOrderId(
        Object.fromEntries(
          entries.filter(
            ([, value]) => value.sap_doc_num != null || value.sap_doc_entry != null,
          ),
        ),
      );
    };

    loadQuotationLogs();

    return () => {
      isActive = false;
    };
  }, [orders]);

  const getStatusName = (item: any) => String((item as any).status_display || item?.status_name || item?.status || "").trim();
  const statusOptions = activeTab === "others" ? BILLING_DECISION_OPTIONS : statuses;
  const getBillingDecisionSummary = (
    item: any,
  ): BillingDecisionSummary | null => {
    const decisionType = normalizeText(item?.decision_type);
    if (decisionType === "accepted" || decisionType === "approved") {
      return {
        decision: "Billing Approved",
        performedByName: String(user?.name || user?.username || "Billing"),
      };
    }
    if (decisionType === "rejected") {
      return {
        decision: "Billing Rejected",
        performedByName: String(user?.name || user?.username || "Billing"),
      };
    }
    return billingDecisionByOrderId[item.id] || null;
  };

  useEffect(() => {
    let isActive = true;

    const loadBillingDecisionSummary = async () => {
      if (activeTab !== "others" || orders.length === 0) {
        setBillingDecisionByOrderId({});
        setLoadingBillingDecisions(false);
        return;
      }

      // Only fetch logs for orders that are missing decision_type
      const missingDecision = orders.filter(
        (order: any) => !normalizeText(order?.decision_type),
      );

      if (missingDecision.length === 0) {
        setBillingDecisionByOrderId({});
        setLoadingBillingDecisions(false);
        return;
      }

      try {
        setLoadingBillingDecisions(true);
        const entries = await Promise.all(
          missingDecision.map(async (order) => {
            try {
              const logsResponse = await orderService.getOrderLogs(order.id);
              const logs = Array.isArray(logsResponse) ? logsResponse : [];
              const billingDecision = getBillingDecisionFromLogs(logs);

              if (!billingDecision) return null;
              return [order.id, billingDecision] as const;
            } catch (decisionError) {
              console.log(`Error loading billing decision for order ${order.id}:`, decisionError);
              return null;
            }
          }),
        );

        if (!isActive) return;

        setBillingDecisionByOrderId(
          Object.fromEntries(
            entries.filter(Boolean) as Array<readonly [number, BillingDecisionSummary]>,
          ),
        );
      } finally {
        if (isActive) {
          setLoadingBillingDecisions(false);
        }
      }
    };

    loadBillingDecisionSummary();

    return () => {
      isActive = false;
    };
  }, [activeTab, orders]);

  let partyLabel = " Party";
  if (selectedParties.length > 0) {
    if (selectedParties.length === 1) {
      const p = parties.find((p: any) => p.value === selectedParties[0]);
      if (p) partyLabel = `Party: ${p.label}`;
    } else {
      partyLabel = `${selectedParties.length} Parties Selected`;
    }
  }

  let statusLabel = " Status";
  if (selectedStatuses.length > 0) {
    statusLabel = selectedStatuses.length === 1
      ? `Status: ${selectedStatuses[0]}`
      : `${selectedStatuses.length} Status Selected`;
  }

  const dropdownOptions = [
    { label: "All Orders", value: "ALL" },
    ...(activeTab === "others"
      ? [{ label: statusLabel, value: "__STATUS__" }]
      : []),
    { label: partyLabel, value: "__PARTY__" },
  ];

  const handleFilterChange = (val: string) => {
    setSelectedFilter(val);
    setIsFilterModalVisible(false);
    if (val === "__PARTY__") {
      setTempSelectedParties(selectedParties);
      setIsPartyModalVisible(true);
    } else if (val === "__ITEM__") {
      setTempSelectedItems(selectedItems);
      setIsItemModalVisible(true);
    } else if (val === "__STATUS__") {
      setTempSelectedStatuses(selectedStatuses);
      setIsStatusModalVisible(true);
    } else {
      setSelectedParties([]);
      setSelectedItems([]);
      setSelectedStatuses([]);
    }
  };

  const closePartyModal = () => {
    setIsPartyModalVisible(false);
    if (selectedParties.length === 0) setSelectedFilter("ALL");
  };

  const closeItemModal = () => {
    setIsItemModalVisible(false);
    if (selectedItems.length === 0) setSelectedFilter("ALL");
  };

  const closeStatusModal = () => {
    setIsStatusModalVisible(false);
    if (selectedStatuses.length === 0) setSelectedFilter("ALL");
  };

  const filteredOrders = orders.filter((item: any) => {
    const billingDecision =
      activeTab === "others" ? getBillingDecisionSummary(item) : null;

    if (activeTab === "others" && !billingDecision) {
      return false;
    }
    const normalizedSearch = searchQuery.trim().toUpperCase();
    if (normalizedSearch) {
      const searchableCustomer = `${item.card_name || ""} ${item.card_code || ""}`.toUpperCase();
      if (!searchableCustomer.includes(normalizedSearch)) return false;
    }

    if (selectedOrderDate) {
      const orderDate = getOrderDateValue(item.created_at);
      if (selectedOrderDate.mode === "date") {
        if (orderDate !== selectedOrderDate.value) return false;
      } else {
        // month mode: compare YYYY-MM prefix
        if (!orderDate.startsWith(selectedOrderDate.value)) return false;
      }
    }
    if (selectedParties.length > 0 && !selectedParties.includes(item.card_code)) return false;
    if (selectedStatuses.length > 0) {
      if (activeTab === "others") {
        if (!billingDecision || !selectedStatuses.includes(billingDecision.decision)) {
          return false;
        }
      } else if (!selectedStatuses.includes(getStatusName(item))) {
        return false;
      }
    }
    if (selectedItems.length > 0) {
      const orderItems = item.items || item.order_items || item.orderItems || [];
      const hasItem = orderItems.some((i: any) => {
        const iName = String(i.item_name || i.itemName || "").trim().toLowerCase();
        return selectedItems.some(si => String(si).trim().toLowerCase() === iName);
      });
      if (!hasItem) return false;
    }
    return true;
  });

  const getStatusBadgeText = (item: OrderItemList) => {
    if (activeTab === "others") {
      const billingDecision = getBillingDecisionSummary(item);
      if (billingDecision) {
        return `${billingDecision.decision}: ${billingDecision.performedByName}`;
      }
    }

    const status = getStatusName(item);
    const rejectedByName = rejectedByNameByOrderId[item.id];
    if (status.toLowerCase().includes("reject") && rejectedByName) {
      return `${status}: ${rejectedByName}`;
    }
    return status;
  };

  const getCardStatusBadge = (
    item: OrderItemList,
  ): { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] } => {
    if (activeTab === "others") {
      const decision = getBillingDecisionSummary(item);
      if (decision?.decision === "Billing Approved") {
        return { label: "Approved", color: COLORS.success, bg: "#ECFDF3", icon: "checkmark-circle-outline" };
      }
      if (decision?.decision === "Billing Rejected") {
        return { label: "Rejected", color: COLORS.error, bg: "#FEF2F2", icon: "close-circle-outline" };
      }
    }

    const raw = getStatusName(item).toLowerCase();
    if (raw.includes("reject")) {
      return { label: getStatusName(item) || "Rejected", color: COLORS.error, bg: "#FEF2F2", icon: "close-circle-outline" };
    }
    if (raw.includes("approv") || raw.includes("accept") || raw.includes("complete")) {
      return { label: getStatusName(item) || "Approved", color: COLORS.success, bg: "#ECFDF3", icon: "checkmark-circle-outline" };
    }
    if (activeTab === "pending" || raw.includes("pending") || raw.includes("billing")) {
      return { label: "Pending Approval", color: "#EA8C00", bg: "#FFF7ED", icon: "time-outline" };
    }
    return { label: getStatusName(item) || "Order", color: COLORS.primary, bg: COLORS.primaryLight, icon: "ellipse-outline" };
  };

  useEffect(() => {
    let isActive = true;

    const loadRejectedByNames = async () => {
      // "others" tab already shows billing decision info — no need for reject logs
      if (activeTab === "others") {
        setRejectedByNameByOrderId({});
        return;
      }

      const rejectedOrders = orders.filter((item) =>
        getStatusName(item).toLowerCase().includes("reject"),
      );

      if (rejectedOrders.length === 0) {
        setRejectedByNameByOrderId({});
        return;
      }

      // Batch in chunks of 5 to avoid flooding the server
      const BATCH_SIZE = 5;
      const result: Array<readonly [number, string]> = [];
      for (let i = 0; i < rejectedOrders.length; i += BATCH_SIZE) {
        if (!isActive) return;
        const batch = rejectedOrders.slice(i, i + BATCH_SIZE);
        const entries = await Promise.all(
          batch.map(async (order) => {
            try {
              const logsResponse = await orderService.getOrderLogs(order.id);
              const logs = Array.isArray(logsResponse) ? logsResponse : [];
              const rejectLog = [...logs]
                .reverse()
                .find((log: any) =>
                  String(log?.status_name || "").toLowerCase().includes("reject"),
                );
              const rejectedByName = String(
                rejectLog?.performed_by_name || "",
              ).trim();

              if (!rejectedByName) return null;
              return [order.id, rejectedByName] as const;
            } catch (error) {
              console.log(`Error loading rejected by name for order ${order.id}:`, error);
              return null;
            }
          }),
        );
        entries.filter(Boolean).forEach((e) => result.push(e!));
      }

      if (!isActive) return;

      setRejectedByNameByOrderId(
        Object.fromEntries(result),
      );
    };

    loadRejectedByNames();

    return () => {
      isActive = false;
    };
  }, [activeTab, orders]);

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const normalizedValue =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
        ? `${value}Z`
        : value;
    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB");
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const normalizedValue =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
        ? `${value}Z`
        : value;
    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) return value;

    const date = parsed.toLocaleDateString("en-GB");
    const time = parsed.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    return `${date} ${time}`;
  };

  const getCategoryText = (item: OrderItemList) => {
    const fromCategories = item.categories || [];
    const categories =
      fromCategories.length > 0
        ? fromCategories
        : Array.from(
            new Set(
              (item.items || (item as any).order_items || (item as any).orderItems || [])
                .map((it: any) => String(it?.category || "").trim())
                .filter(Boolean),
            ),
          );

    if (categories.length === 0) return "-";
    if (categories.length <= 2) return categories.join(", ");
    return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
  };

  const handleApprove = (order: OrderItemList, remarks = "") => {
    const approveAction = async () => {
      try {
        setActionLoading({ id: order.id, type: "approve" });
        const response: any = await productService.updatestatus(
          order.id,
          "10",
          remarks.trim() || "Accepted by billing",
        );
        const copy = getBillingApprovalSuccessCopy(response?.status, response?.message);
        setApprovalResult({
          ...copy,
          orderNumber: order.order_number,
        });
        setApprovalSuccessModal(true);
        loadOrders();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to approve order";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Error", msg);
        }
      } finally {
        setActionLoading(null);
      }
    };

    approveAction();
  };

  const openRejectModal = (orderId: number) => {
    setSelectedOrderId(orderId);
    setDecisionType("reject");
    setRejectReason("");
    setRejectModalVisible(true);
  };

  const openApproveModal = (orderId: number) => {
    setSelectedOrderId(orderId);
    setDecisionType("approve");
    setRejectReason("");
    setRejectModalVisible(true);
  };

  const handleReject = async () => {
    if (decisionType === "approve") {
      const order = orders.find((item) => item.id === selectedOrderId);
      if (!order) return;
      setRejectModalVisible(false);
      handleApprove(order, rejectReason);
      return;
    }
    if (!rejectReason.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter rejection reason");
      } else {
        Alert.alert("Error", "Please enter rejection reason");
      }
      return;
    }

    try {
      setActionLoading({ id: selectedOrderId!, type: "reject" });
      await productService.updatestatus(selectedOrderId!, "8", rejectReason);
      setRejectModalVisible(false);
      if (Platform.OS === "web") {
        window.alert("Order rejected");
      } else {
        Alert.alert("Success", "Order rejected");
      }
      loadOrders();
    } catch (error) {
      console.log("Error rejecting:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to reject order");
      } else {
        Alert.alert("Error", "Failed to reject order");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handlePending = async () => {
    if (!pendingReason.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please provide pending reason");
      } else {
        Alert.alert("Error", "Please provide pending reason");
      }
      return;
    }

    try {
      setActionLoading({ id: selectedOrderId!, type: "pending" });
      const statusCode = pendingActionType === "NEED_APPROVAL" ? "2" : "3";
      await productService.updatestatus(selectedOrderId!, statusCode, pendingReason);
      setPendingModalVisible(false);
      if (Platform.OS === "web") {
        window.alert("Order status updated");
      } else {
        Alert.alert("Success", "Order status updated");
      }
      loadOrders();
    } catch (error) {
      console.log("Error pending:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to update status");
      } else {
        Alert.alert("Error", "Failed to update status");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const renderOrder = ({ item }: { item: OrderItemList }) => {
    const quotationLog = quotationLogByOrderId[item.id];
    const sapDocNum = item.sap_doc_num ?? quotationLog?.sap_doc_num ?? item.sap_doc_number ?? null;
    const sapDocEntry = item.sap_doc_entry ?? quotationLog?.sap_doc_entry ?? null;

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/orders/orderdetails",
            params: { orderId: item.id, from: "orders/orderlist", sourceTab: activeTab },
          })
        }
        style={styles.orderCard}
        activeOpacity={0.85}
      >
      <View style={styles.orderHeader}>
        <View style={styles.orderNumberWrap}>
          <Text style={styles.orderNumber}>{item.order_number}</Text>
          <Text style={styles.createdText}>
            Created: {formatDateTime(item.created_at)}
          </Text>
        </View>
        {(() => {
          const badge = getCardStatusBadge(item);
          return (
            <View style={[styles.cardStatusBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon} size={13} color={badge.color} />
              <Text style={[styles.cardStatusText, { color: badge.color }]} numberOfLines={1}>
                {badge.label}
              </Text>
            </View>
          );
        })()}
      </View>

      <Text style={styles.cardName}>{item.card_name}</Text>
      <Text style={styles.cardCode}>{item.card_code}</Text>

      {userRole !== "manager" && isCompletedOrder(item) && (sapDocNum != null || sapDocEntry != null) && (
        <View style={styles.metaWrap}>
          {sapDocEntry != null && (
            <View style={styles.metaChip}>
              <Ionicons name="document-attach-outline" size={14} color={COLORS.primary} />
              <Text style={styles.metaText}>SAP Entry: {sapDocEntry}</Text>
            </View>
          )}
          {sapDocNum != null && (
            <View style={styles.metaChip}>
              <Ionicons name="receipt-outline" size={14} color={COLORS.primary} />
              <Text style={styles.metaText}>SAP Num: {sapDocNum}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.metaWrap}>
        <View style={styles.metaChip}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>
            Delivery: {formatDate(item.delivery_date)}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="cube-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>{item.items_count || 0} items</Text>
        </View>
        {item.is_foc && (
          <View style={[styles.metaChip, styles.focChip]}>
            <Ionicons name="gift-outline" size={14} color={styles.focText.color} />
            <Text style={[styles.metaText, styles.focText]}>FOC</Text>
          </View>
        )}
      </View>

      <View style={styles.metaWrap}>
        <View style={styles.metaChip}>
          <Ionicons name="pricetags-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>Category: {getCategoryText(item)}</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>PO: {item.po_number || "-"}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>₹{item.total_amount}</Text>
      </View>

      {activeTab === "pending" && (
        <>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => openRejectModal(item.id)}
              disabled={actionLoading !== null}
            >
              {actionLoading?.id === item.id && actionLoading.type === "reject" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => openApproveModal(item.id)}
              disabled={actionLoading !== null}
            >
              {actionLoading?.id === item.id && actionLoading.type === "approve" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    let msg = activeTab === "pending"
      ? "No pending orders"
      : "No orders found";
    if (selectedParties.length > 0 || selectedItems.length > 0 || selectedStatuses.length > 0) {
      msg = "No orders found for selected filters";
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name={activeTab === "pending" ? "checkmark-done-circle-outline" : "filter-outline"}
          size={64}
          color={COLORS.textLight}
        />
        <Text style={styles.emptyText}>{msg}</Text>
      </View>
    );
  };

  return (
    <StateWrapper
      loading={(
        loading ||
        loadingItems ||
        loadingStatuses ||
        (activeTab === "others" && loadingBillingDecisions)
      ) && !refreshing}
      error={error}
      onRetry={loadOrders}
    >
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={[
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "All Process", value: "all" },
            ]}
            value={statusView}
            onChange={(value) => {
              setStatusView(value);
              setActiveTab(value === "pending" ? "pending" : "others");
              setSelectedStatuses(
                value === "approved" ? ["Billing Approved"] :
                value === "rejected" ? ["Billing Rejected"] : [],
              );
            }}
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
              value={searchQuery}
              onChangeText={(value) => setSearchQuery(value.toUpperCase())}
              placeholder="NAME / CODE"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.dateFieldWrap}>
          <Text style={styles.fieldLabel}>Date</Text>
          <InlineOrderDateFilter
            value={selectedOrderDate}
            onChange={setSelectedOrderDate}
            variant="field"
          />
        </View>
      </View>

      {/* Orders Count + Filter */}
      {!loading && filteredOrders.length > 0 && (
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countBar}
        >
          <View style={styles.countBarLeft}>
            <View style={styles.countBarIcon}>
              <Ionicons name="receipt-outline" size={18} color="#fff" />
            </View>
            <View style={styles.countBarTextWrap}>
              <Text style={styles.countText} numberOfLines={1}>
                {filteredOrders.length} order{filteredOrders.length > 1 ? "s" : ""} found
              </Text>
              <Text style={styles.countSubText} numberOfLines={1}>Last updated just now</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.countBarFilterBtn}
            onPress={() => setIsFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="funnel-outline" size={14} color="#fff" />
            <Text style={styles.countBarFilterText}>Filter</Text>
            {(selectedParties.length > 0 || selectedStatuses.length > 0) && (
              <View style={styles.countBarFilterDot} />
            )}
          </TouchableOpacity>
        </LinearGradient>
      )}

      {/* Orders List */}
      <FlatList
        data={filteredOrders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />

      {/* Approve / Reject Dialog */}
      <ActionDialog
        visible={rejectModalVisible}
        type={decisionType}
        remark={rejectReason}
        onChangeRemark={(value) => setRejectReason(value.toUpperCase())}
        loading={actionLoading?.type === decisionType}
        onCancel={() => {
          if (actionLoading !== null) return;
          setRejectModalVisible(false);
        }}
        onConfirm={() => handleReject()}
      />

      <Modal
        visible={approvalSuccessModal && !!approvalResult}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setApprovalSuccessModal(false);
          setApprovalResult(null);
        }}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalBox}>
            <LinearGradient
              colors={["#1E3A5F", "#2563EB"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successModalHeader}
            >
              <View style={styles.successDecorCircle1} />
              <View style={styles.successDecorCircle2} />

              <View style={styles.successIconBadge}>
                <Ionicons name="checkmark-circle" size={48} color="#fff" />
              </View>

              <Text style={styles.successHeaderTitle}>{approvalResult?.title}</Text>
              <Text style={styles.successHeaderSub}>
                {approvalResult?.subtitle}
              </Text>
            </LinearGradient>

            <View style={styles.successModalBody}>
              <View style={styles.successInfoBox}>
                <Ionicons name="receipt-outline" size={14} color={COLORS.textSecondary} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.successInfoLabel}>Order Number</Text>
                  <Text style={styles.successInfoValue}>
                    {approvalResult?.orderNumber}
                  </Text>
                </View>
              </View>

              <Text style={styles.successMessage}>{approvalResult?.message}</Text>

              <TouchableOpacity
                style={styles.successPrimaryBtn}
                onPress={() => {
                  setApprovalSuccessModal(false);
                  setApprovalResult(null);
                }}
              >
                <LinearGradient
                  colors={["#1E3A5F", "#2563EB"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.successPrimaryGradient}
                >
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                  <Text style={styles.successPrimaryText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.successSecondaryBtn}
                onPress={() => {
                  setApprovalSuccessModal(false);
                  setApprovalResult(null);
                  loadOrders();
                }}
              >
                <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
                <Text style={styles.successSecondaryText}>Refresh Orders</Text>
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
                onPress={handlePending}
                disabled={actionLoading !== null}
              >
                {actionLoading?.type === "pending" ? (
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

      {/* Filter Selection Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalContent}>
            <Text style={styles.modalTitle}>Filter Orders</Text>
            {dropdownOptions.map((option) => {
              const isSelected = selectedFilter === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.modalListItem,
                    styles.filterOptionRow,
                    isSelected && styles.modalListItemSelected,
                  ]}
                  onPress={() => handleFilterChange(option.value)}
                >
                  <Text style={isSelected ? styles.modalListTextSelected : styles.modalListText}>
                    {option.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primaryDark} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.filterModalCloseBtn}
              onPress={() => setIsFilterModalVisible(false)}
            >
              <Text style={styles.filterModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Party Selection Modal */}
      <Modal visible={isPartyModalVisible} transparent animationType="slide" onRequestClose={closePartyModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Party</Text>
            <FlatList
              data={parties}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = tempSelectedParties.includes(item.value);
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalListItem,
                      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
                      isSelected && styles.modalListItemSelected,
                    ]}
                    onPress={() => {
                      const val = item.value;
                      setTempSelectedParties(prev => prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val]);
                    }}
                  >
                    <Text style={isSelected ? styles.modalListTextSelected : styles.modalListText}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primaryDark} />}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>No parties found</Text>
                </View>
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={closePartyModal}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => {
                  setSelectedParties(tempSelectedParties);
                  setIsPartyModalVisible(false);
                  if (tempSelectedParties.length === 0) setSelectedFilter("ALL");
                }}
              >
                <Text style={{ color: "white", textAlign: "center" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Item Selection Modal */}
      <Modal visible={isItemModalVisible} transparent animationType="slide" onRequestClose={closeItemModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Item</Text>
            <FlatList
              data={availableItems}
              keyExtractor={(item) => item as string}
              renderItem={({ item }) => {
                const isSelected = tempSelectedItems.includes(item as string);
                return (
                <TouchableOpacity
                  style={[
                    styles.modalListItem,
                    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
                    isSelected && styles.modalListItemSelected,
                  ]}
                  onPress={() => {
                    const val = item as string;
                    setTempSelectedItems(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
                  }}
                >
                  <Text style={isSelected ? styles.modalListTextSelected : styles.modalListText}>
                    {item}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primaryDark} />}
                </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>No items found</Text>
                </View>
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={closeItemModal}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => {
                  setSelectedItems(tempSelectedItems);
                  setIsItemModalVisible(false);
                  if (tempSelectedItems.length === 0) setSelectedFilter("ALL");
                }}
              >
                <Text style={{ color: "white", textAlign: "center" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Selection Modal */}
      <Modal visible={isStatusModalVisible} transparent animationType="slide" onRequestClose={closeStatusModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {activeTab === "others" ? "Select Billing Status" : "Select Status"}
            </Text>
            <FlatList
              data={statusOptions}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => {
                const isSelected = tempSelectedStatuses.includes(item.name);
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalListItem,
                      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
                      isSelected && styles.modalListItemSelected,
                    ]}
                    onPress={() => {
                      const val = item.name;
                      if (activeTab === "others") {
                        setTempSelectedStatuses((prev) => (prev[0] === val ? [] : [val]));
                        return;
                      }
                      setTempSelectedStatuses(prev => prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val]);
                    }}
                  >
                    <Text style={isSelected ? styles.modalListTextSelected : styles.modalListText}>
                      {item.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.primaryDark} />}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>
                    {activeTab === "others" ? "No billing statuses found" : "No statuses found"}
                  </Text>
                </View>
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={closeStatusModal}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => {
                  setSelectedStatuses(tempSelectedStatuses);
                  setIsStatusModalVisible(false);
                  if (tempSelectedStatuses.length === 0) setSelectedFilter("ALL");
                }}
              >
                <Text style={{ color: "white", textAlign: "center" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </StateWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 12,
    gap: 8,
  },
  tabGroup: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  statusDropdownWrap: {
    width: 126,
  },
  fieldWrap: {
    flex: 1,
    paddingTop: 8,
    position: "relative",
  },
  dateFieldWrap: {
    paddingTop: 8,
    position: "relative",
  },
  fieldLabel: {
    position: "absolute",
    top: 0,
    left: 12,
    zIndex: 2,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  searchWrap: {
    alignSelf: "stretch",
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBackground,
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 6,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerFilterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  headerBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  cardStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    maxWidth: 150,
  },
  cardStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 0,
  },
  tabActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  activePendingTab: {
    backgroundColor: COLORS.warning,
  },
  activeOthersTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: "#fff",
  },
  filterIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterActiveDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  countBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  countBarIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  countBarTextWrap: {
    flex: 1,
  },
  countText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  countSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    marginTop: 2,
  },
  countBarFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  countBarFilterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  countBarFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD166",
    marginLeft: 2,
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  orderNumberWrap: {
    flex: 1,
    paddingRight: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  createdText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
  },
  statusText: {
    color: COLORS.primaryDark,
    fontSize: 10,
    fontWeight: "700",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  cardPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  itemsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemsChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  metaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    marginBottom: 6,
  },
  metaCol: {
    flex: 1,
    paddingHorizontal: 10,
  },
  metaColDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  metaColHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  metaColLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  metaColValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  cardCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 10,
  },
  metaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  focChip: {
    backgroundColor: "#FFF7E6",
    borderColor: "#F59E0B",
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  focText: {
    color: "#B45309",
    fontWeight: "700",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  amountLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },

  approveBtn: {
    backgroundColor: COLORS.success,
  },

  pendingBtn: {
    backgroundColor: COLORS.warning,
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
  filterModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    width: "86%",
    maxWidth: 360,
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
  successModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  successModalBox: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: "100%",
    maxWidth: 420,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  successModalHeader: {
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  successDecorCircle1: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.07)",
    top: -50,
    right: -40,
  },
  successDecorCircle2: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -30,
    left: -20,
  },
  successIconBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  successHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  successHeaderSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 18,
  },
  successModalBody: {
    padding: 24,
    alignItems: "center",
  },
  successInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  successInfoLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  successInfoValue: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.primary,
  },
  successMessage: {
    fontSize: 15,
    color: COLORS.text,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 20,
  },
  successPrimaryBtn: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  successPrimaryGradient: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  successPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },
  successSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  successSecondaryText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
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
  confirmApproveBtn: {
    backgroundColor: COLORS.success,
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

  dropdownDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 14,
  },

  dropdownText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  modalListItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  modalListItemSelected: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  modalListText: {
    fontSize: 14,
    color: COLORS.text,
  },
  modalListTextSelected: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  filterModalCloseBtn: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  filterModalCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
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
