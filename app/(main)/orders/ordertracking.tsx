import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { OrderItemList, orderService, productService, type QuotationStatus } from "@/src/services/order.service";
import { COLORS } from "@/constants/theme";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import InlineOrderDateFilter, { type DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import { LinearGradient } from "expo-linear-gradient";
import Dropdown from "@/src/components/common/DropdownProps";
import { useAuth } from "@/src/context/AuthContext";
import StateWrapper from "@/src/components/common/StateWrapper";
import { refreshOrderData } from "@/src/cache";

type TrackingStatusFilter = "Completed" | "Rejected";

const TRACKING_STATUS_OPTIONS: Array<{ name: TrackingStatusFilter }> = [
  { name: "Completed" },
  { name: "Rejected" },
];

const normalizeText = (value: unknown) =>
  String(value || "").trim().toLowerCase();

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

const getTrackingStatusFilter = (item: any): TrackingStatusFilter | null => {
  const statusName = normalizeText(
    `${item?.status_display || ""} ${item?.status_name || ""} ${item?.status || ""}`,
  );

  if (statusName.includes("complete")) {
    return "Completed";
  }

  if (statusName.includes("reject")) {
    return "Rejected";
  }

  return null;
};

const isCompletedOrder = (
  item: Pick<OrderItemList, "status" | "status_name" | "status_display">,
) =>
  [item.status_display, item.status_name, item.status].some((value) =>
    normalizeText(value).includes("complete"),
  );

// Drafts are not part of the order flow yet, so they are excluded from the
// Order Tracking list.
const isDraftOrder = (
  item: Pick<OrderItemList, "status" | "status_name" | "status_display">,
) =>
  [item.status_display, item.status_name, item.status].some(
    (value) => normalizeText(value) === "draft",
  );

const isSettledOrder = (
  item: Pick<OrderItemList, "status" | "status_name" | "status_display">,
) => {
  const values = [item.status_display, item.status_name, item.status].map(normalizeText);
  return values.some(
    (v) =>
      v.includes("approved") ||
      v.includes("completed") ||
      v.includes("delivered") ||
      v.includes("accepted") ||
      v.includes("reject") ||
      v.includes("cancel"),
  );
};

const isCompletedOrRejectedOrder = (
  item: Pick<OrderItemList, "status" | "status_name" | "status_display">,
) => {
  const values = [item.status_display, item.status_name, item.status].map(normalizeText);
  return values.some((v) => v.includes("complete") || v.includes("reject"));
};

export default function OrderTrackingScreen() {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || "";
  const { tab, statusFilter, year, month, _t } = useLocalSearchParams<{ tab?: string; statusFilter?: string; year?: string; month?: string; _t?: string }>();

  const initStatuses = (): string[] => {
    const f = statusFilter?.toLowerCase();
    if (f === "rejected") return ["Rejected"];
    if (f === "approved") return ["Completed"];
    if (f === "pending") return ["__PENDING__"];
    // "Total" card (tab=others) shows everything; otherwise default to Pending.
    if (tab === "others") return [];
    return ["__PENDING__"];
  };

  const [orders, setOrders] = useState<OrderItemList[]>([]);
  const [quotationLogByOrderId, setQuotationLogByOrderId] = useState<
    Record<number, { sap_doc_num?: string | number | null; sap_doc_entry?: number | null }>
  >({});
  const [quotationStatusByOrderId, setQuotationStatusByOrderId] = useState<
    Record<string, QuotationStatus>
  >({});
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [rejectedByNameByOrderId, setRejectedByNameByOrderId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(
    statusFilter?.toLowerCase() === "rejected" || statusFilter?.toLowerCase() === "approved" || statusFilter?.toLowerCase() === "pending"
      ? "__STATUS__"
      : null,
  );
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusView, setStatusView] = useState<string>(() => {
    const f = statusFilter?.toLowerCase();
    if (f === "rejected") return "rejected";
    if (f === "approved") return "completed";
    if (f === "pending") return "pending";
    if (tab === "others") return "all";
    return "pending";
  });
  const router = useRouter();

  const [parties, setParties] = useState<any[]>([]);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [tempSelectedParties, setTempSelectedParties] = useState<string[]>([]);
  const [isPartyModalVisible, setIsPartyModalVisible] = useState(false);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [tempSelectedItems, setTempSelectedItems] = useState<string[]>([]);
  const [isItemModalVisible, setIsItemModalVisible] = useState(false);

  const [availableItems, setAvailableItems] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);
  const [orderItemNamesByOrderId, setOrderItemNamesByOrderId] = useState<Record<number, string[]>>({});

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initStatuses);
  const [tempSelectedStatuses, setTempSelectedStatuses] = useState<string[]>([]);
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);
  const [selectedOrderDate, setSelectedOrderDate] = useState<DateFilterValue>(() => {
    if (year && month && month !== "0") {
      return { mode: "month", value: `${year}-${String(month).padStart(2, "0")}` };
    }
    if (year) {
      return { mode: "year", value: String(year) };
    }
    return null;
  });

  const [assignedParties, setAssignedParties] = useState<any[]>([]);

  const lastConsumedT = useRef<string | undefined>(undefined);
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      const hasNewParams = _t !== undefined && _t !== lastConsumedT.current;
      if (hasNewParams) lastConsumedT.current = _t;

      const f = hasNewParams ? statusFilter?.toLowerCase() : undefined;
      // Default the Status filter to Pending (unless a specific status was
      // requested, or the "Total" card opened this with tab=others).
      const nextView =
        f === "rejected" ? "rejected" :
        f === "approved" ? "completed" :
        f === "pending" ? "pending" :
        hasNewParams && tab === "others" ? "all" :
        "pending";
      setStatusView(nextView);
      setSelectedStatuses(
        nextView === "rejected" ? ["Rejected"] :
        nextView === "completed" ? ["Completed"] :
        nextView === "pending" ? ["__PENDING__"] : []
      );
      setSelectedStatus(nextView !== "all" ? "__STATUS__" : null);
      setSelectedParties([]);
      setTempSelectedParties([]);
      setSelectedItems([]);
      setTempSelectedItems([]);
      setTempSelectedStatuses([]);
      if (hasNewParams && year && month && month !== "0") {
        setSelectedOrderDate({ mode: "month", value: `${year}-${String(month).padStart(2, "0")}` });
      } else if (hasNewParams && year) {
        setSelectedOrderDate({ mode: "year", value: String(year) });
      } else {
        setSelectedOrderDate(null);
      }
      setIsFilterModalVisible(false);
      setIsPartyModalVisible(false);
      setIsItemModalVisible(false);
      setIsStatusModalVisible(false);
      loadOrders();
    });
    return unsubscribe;
  }, [navigation, tab, statusFilter, year, month, _t]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data =
        userRole === "admin"
          ? await productService.getOrders(0, undefined, false, false, true)
          : await orderService.getOrderbyuserid();

      console.log("datavalue" + JSON.stringify(data));
      // Hide drafts from Order Tracking — they aren't in the order flow yet.
      const list = Array.isArray(data) ? data.filter((o) => !isDraftOrder(o)) : [];
      setOrders(list);
    } catch (error) {
      console.log("Error loading orders:", error);
      setError("Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const loadAssignedData = async () => {
      if (!user?.id) return;
      setLoadingItems(true);
      try {
        // Load user's assigned parties for the party filter.
        const partiesData = await orderService.getParties().catch(() => []);
        const formattedParties = Array.isArray(partiesData) ? partiesData : [];
        setAssignedParties(formattedParties);
      } catch (error) {
        console.log("Error loading assigned data:", error);
      } finally {
        setLoadingItems(false);
      }
    };
    loadAssignedData();
  }, [user?.id]);

  useEffect(() => {
    const uniqueParties = new Map();

    // Include explicitly assigned parties first
    assignedParties.forEach((p: any) => {
      if (p.value) {
        uniqueParties.set(p.value, {
          label: p.label,
          value: p.value,
        });
      }
    });

    setParties(Array.from(uniqueParties.values()).sort((a, b) => a.label.localeCompare(b.label)));
  }, [assignedParties]);

  useEffect(() => {
    let isActive = true;

    const loadOrderItems = async () => {
      if (orders.length === 0) {
        setOrderItemNamesByOrderId({});
        setAvailableItems([]);
        return;
      }

      try {
        setLoadingOrderItems(true);

        const results = await Promise.all(
          orders.map(async (order) => {
            try {
              const response = await orderService.getOrderDetails(order.id);
              const detail = response?.data || response;
              const detailItems = Array.isArray(detail?.items) ? detail.items : [];
              const itemNames: string[] = Array.from(
                new Set(
                  detailItems
                    .map((item: any) => String(item?.item_name || item?.itemName || "").trim())
                    .filter(Boolean),
                ),
              );
              return [order.id, itemNames] as const;
            } catch (error) {
              console.log(`Error loading order items for ${order.id}:`, error);
              return [order.id, [] as string[]] as const;
            }
          }),
        );

        if (!isActive) return;

        const nextOrderItemsById: Record<number, string[]> = {};
        const allAvailableItems = new Set<string>();

        results.forEach(([orderId, itemNames]) => {
          nextOrderItemsById[orderId] = itemNames;
          itemNames.forEach((itemName: string) => allAvailableItems.add(itemName));
        });

        setOrderItemNamesByOrderId(nextOrderItemsById);
        setAvailableItems(Array.from(allAvailableItems).sort((a, b) => a.localeCompare(b)));
      } finally {
        if (isActive) {
          setLoadingOrderItems(false);
        }
      }
    };

    loadOrderItems();

    return () => {
      isActive = false;
    };
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

  // For completed orders that aren't already cancelled, look up whether their
  // SAP quotation is still open so the cancel action only shows where allowed.
  useEffect(() => {
    let isActive = true;

    const loadQuotationStatuses = async () => {
      const completedIds = orders
        .filter((order) => isCompletedOrder(order) && !order.quotation_cancelled)
        .map((order) => order.id);

      if (completedIds.length === 0) {
        setQuotationStatusByOrderId({});
        return;
      }

      try {
        const statuses = await orderService.getQuotationStatuses(completedIds);
        if (isActive) setQuotationStatusByOrderId(statuses);
      } catch (error) {
        console.log("Error loading quotation statuses:", error);
      }
    };

    loadQuotationStatuses();

    return () => {
      isActive = false;
    };
  }, [orders]);

  const handleCancelQuotation = (order: OrderItemList) => {
    Alert.alert(
      "Cancel Sales Quotation",
      `Cancel the SAP sales quotation for order ${order.order_number}? This cannot be undone.`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setCancellingId(order.id);
              const result = await orderService.cancelQuotation(order.id);
              if (result?.success) {
                setOrders((prev) =>
                  prev.map((o) =>
                    o.id === order.id ? { ...o, quotation_cancelled: true } : o,
                  ),
                );
                setQuotationStatusByOrderId((prev) => {
                  const next = { ...prev };
                  delete next[String(order.id)];
                  return next;
                });
                Alert.alert("Success", result.message || "Sales quotation cancelled");
              } else {
                Alert.alert("Error", result?.message || "Could not cancel the quotation");
              }
            } catch (error: any) {
              Alert.alert(
                "Error",
                error?.message || "Failed to cancel the quotation",
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Explicit refresh: bypass the cache so the network is the source of truth.
    await refreshOrderData();
    loadOrders();
  };

  const getStatusName = (item: any) =>
    String(item?.status_display || item?.status_name || item?.status || "").trim();
  const getStatusBadgeText = (item: OrderItemList) => {
    const status = getStatusName(item);
    const rejectedByName = rejectedByNameByOrderId[item.id];
    if (status.toLowerCase().includes("reject") && rejectedByName) {
      return `${status}: ${rejectedByName}`;
    }
    return status;
  };

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB");
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
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
    const categories = item.categories || [];
    if (categories.length === 0) return "-";
    if (categories.length <= 2) return categories.join(", ");
    return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
  };

  let partyLabel = " Party";
  if (selectedParties.length > 0) {
    if (selectedParties.length === 1) {
      const p = parties.find((p: any) => p.value === selectedParties[0]);
      if (p) partyLabel = `Party: ${p.label}`;
    } else {
      partyLabel = `${selectedParties.length} Parties Selected`;
    }
  }

  let itemLabel = " Item";
  if (selectedItems.length > 0) {
    itemLabel = selectedItems.length === 1
      ? `Item: ${selectedItems[0]}`
      : `${selectedItems.length} Items Selected`;
  }

  let statusLabel = " Status";
  if (selectedStatuses.length > 0) {
    statusLabel = selectedStatuses.length === 1
      ? `Status: ${selectedStatuses[0]}`
      : `${selectedStatuses.length} Status Selected`;
  }

  const dropdownOptions = [
    { label: "All Orders", value: "ALL" },
    { label: statusLabel, value: "__STATUS__" },
    { label: partyLabel, value: "__PARTY__" },
    { label: itemLabel, value: "__ITEM__" },
  ];

  const handleFilterChange = (val: string) => {
    setSelectedStatus(val);
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
    if (selectedParties.length === 0) setSelectedStatus("ALL");
  };

  const closeItemModal = () => {
    setIsItemModalVisible(false);
    if (selectedItems.length === 0) setSelectedStatus("ALL");
  };

  const closeStatusModal = () => {
    setIsStatusModalVisible(false);
    if (selectedStatuses.length === 0) setSelectedStatus("ALL");
  };

  const extractOrderItemNames = (item: OrderItemList) => {
    const cachedItemNames = orderItemNamesByOrderId[item.id];
    if (Array.isArray(cachedItemNames)) {
      return cachedItemNames;
    }

    const rawItems = Array.isArray(item.items)
      ? item.items
      : Array.isArray((item as any).order_items)
        ? (item as any).order_items
        : Array.isArray((item as any).orderItems)
          ? (item as any).orderItems
          : [];

    return rawItems
      .map((orderItem: any) => String(orderItem?.item_name || orderItem?.itemName || "").trim())
      .filter(Boolean);
  };

  const filteredOrders = orders.filter((item: OrderItemList) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const haystack = `${item.order_number || ""} ${item.card_name || ""} ${item.card_code || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (selectedOrderDate) {
      const orderDate = getOrderDateValue(item.created_at);
      if (selectedOrderDate.mode === "date") {
        if (orderDate !== selectedOrderDate.value) return false;
      } else if (selectedOrderDate.mode === "month") {
        if (!orderDate.startsWith(selectedOrderDate.value)) return false;
      } else {
        if (!orderDate.startsWith(selectedOrderDate.value)) return false;
      }
    }
    if (selectedParties.length > 0 && !selectedParties.includes(item.card_code)) return false;
    if (selectedStatuses.length > 0) {
      if (selectedStatuses.includes("__PENDING__")) {
        if (userRole === "admin") {
          if (isCompletedOrRejectedOrder(item)) return false;
        } else if (isSettledOrder(item)) return false;
      } else {
        const trackingStatus = getTrackingStatusFilter(item);
        if (!trackingStatus || !selectedStatuses.includes(trackingStatus)) {
          return false;
        }
      }
    }
    if (selectedItems.length > 0) {
      const orderItemNames = extractOrderItemNames(item);
      const hasItem = orderItemNames.some((itemName: string) =>
        selectedItems.some(
          (selectedItem) => String(selectedItem).trim().toLowerCase() === itemName.toLowerCase(),
        ),
      );
      if (!hasItem) return false;
    }
    return true;
  });

  useEffect(() => {
    let isActive = true;

    const loadRejectedByNames = async () => {
      const rejectedOrders = orders.filter((item) =>
        getStatusName(item).toLowerCase().includes("reject"),
      );

      if (rejectedOrders.length === 0) {
        setRejectedByNameByOrderId({});
        return;
      }

      const entries = await Promise.all(
        rejectedOrders.map(async (order) => {
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

      if (!isActive) return;

      setRejectedByNameByOrderId(
        Object.fromEntries(entries.filter(Boolean) as Array<readonly [number, string]>),
      );
    };

    loadRejectedByNames();

    return () => {
      isActive = false;
    };
  }, [orders]);

  const renderOrder = ({ item }: { item: OrderItemList }) => {
    const quotationLog = quotationLogByOrderId[item.id];
    const sapDocNum = item.sap_doc_num ?? quotationLog?.sap_doc_num ?? item.sap_doc_number ?? null;
    const sapDocEntry = item.sap_doc_entry ?? quotationLog?.sap_doc_entry ?? null;

    const canManageQuotation = userRole === "manager" || userRole === "admin";
    const quotationStatus = quotationStatusByOrderId[String(item.id)];
    const showCancelledChip =
      canManageQuotation && isCompletedOrder(item) && Boolean(item.quotation_cancelled);
    const canCancelQuotation =
      canManageQuotation &&
      isCompletedOrder(item) &&
      !item.quotation_cancelled &&
      // Show unless SAP explicitly says the quotation is closed. When the SAP
      // status is unknown (e.g. lookup unreachable) we still show it; the
      // backend re-checks and rejects if it can't actually be cancelled.
      (quotationStatus?.is_open ?? true);

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.8}
      // onPress={() =>
      //   // router.push({
      //   //   pathname: "/orders/orderflow",
      //   //   params: { orderId: item.id },
      //   // })
      // }
      >
      {/* Header */}
      <View style={styles.orderHeader}>
        <View style={styles.orderNumberWrap}>
          <Text style={styles.orderNumber}>{item.order_number}</Text>
          <Text style={styles.createdText}>
            Created: {formatDateTime(item.created_at)}
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{getStatusBadgeText(item)}</Text>
        </View>
      </View>

      {/* Party Info */}
      <Text style={styles.cardName}>{item.card_name}</Text>
      <Text style={styles.cardCode}>{item.card_code}</Text>

      {userRole !== "manager" && isCompletedOrder(item) && (sapDocNum != null || sapDocEntry != null) && (
        <View style={styles.metaWrap}>
          {sapDocEntry != null && (
            <View style={styles.metaChip}>
              <Ionicons
                name="document-attach-outline"
                size={14}
                color={COLORS.primary}
              />
              <Text style={styles.metaText}>SAP Entry: {sapDocEntry}</Text>
            </View>
          )}
          {sapDocNum != null && (
            <View style={styles.metaChip}>
              <Ionicons
                name="receipt-outline"
                size={14}
                color={COLORS.primary}
              />
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

      {/* Amount */}
      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>₹{item.total_amount}</Text>
      </View>
      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.detailsBtn]}
          onPress={() => {
            router.push({
              pathname: "/orders/orderdetails",
              params: { orderId: item.id, from: "orders/ordertracking" },
            });
          }}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>View Details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.progressBtn]}
          onPress={() => {
            router.push({
              pathname: "/orders/orderprogress",
              params: { orderId: item.id, from: "orders/ordertracking" },
            });
          }}
        >
          <Ionicons name="git-branch-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>View Progress</Text>
        </TouchableOpacity>
      </View>

      {userRole !== "admin" && getStatusName(item).toLowerCase().includes("reject") && (
        <View style={[styles.actionRow, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.error }]}
            onPress={() => {
              router.push({
                pathname: "/orders/create",
                params: {
                  orderId: item.id,
                  mode: "edit",
                  from: "orders/ordertracking",
                },
              });
            }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Edit / Re-order</Text>
          </TouchableOpacity>
        </View>
      )}

      {showCancelledChip && (
        <View style={[styles.metaWrap, { marginTop: 8 }]}>
          <View style={[styles.metaChip, styles.cancelledChip]}>
            <Ionicons name="close-circle-outline" size={14} color="#dc2626" />
            <Text style={[styles.metaText, styles.cancelledText]}>Quotation Cancelled</Text>
          </View>
        </View>
      )}

      {canCancelQuotation && (
        <View style={[styles.actionRow, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.cancelQuotationBtn,
              cancellingId === item.id && { opacity: 0.6 },
            ]}
            disabled={cancellingId === item.id}
            onPress={() => handleCancelQuotation(item)}
          >
            {cancellingId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="ban-outline" size={18} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>Cancel Quotation</Text>
          </TouchableOpacity>
        </View>
      )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    let msg = "No orders found";
    if (
      selectedParties.length > 0 ||
      selectedItems.length > 0 ||
      selectedStatuses.length > 0 ||
      selectedOrderDate
    ) {
      msg = "No orders found for selected filters";
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="filter-outline" size={52} color={COLORS.textSecondary} />
        <Text style={styles.emptyText}>{msg}</Text>
      </View>
    );
  };

  return (
    <StateWrapper loading={(loading || loadingItems) && !refreshing} error={error} onRetry={loadOrders}>
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          <View style={styles.statusDropdownWrap}>
            <Dropdown
              label="Status"
              data={[
                { label: "All", value: "all" },
                { label: "Pending", value: "pending" },
                { label: "Completed", value: "completed" },
                { label: "Rejected", value: "rejected" },
              ]}
              value={statusView}
              onChange={(value) => {
                setStatusView(value);
                setSelectedStatuses(
                  value === "pending"
                    ? ["__PENDING__"]
                    : value === "completed"
                      ? ["Completed"]
                      : value === "rejected"
                        ? ["Rejected"]
                        : [],
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
                <Text style={styles.countSubText} numberOfLines={1}>
                  Last updated just now
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.countBarFilterBtn}
              onPress={() => setIsFilterModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="funnel-outline" size={14} color="#fff" />
              <Text style={styles.countBarFilterText}>Filter</Text>
              {(selectedParties.length > 0 || selectedItems.length > 0 || selectedStatuses.length > 0) && (
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
                const isSelected = selectedStatus === option.value;
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
                    if (tempSelectedParties.length === 0) setSelectedStatus("ALL");
                  }}
                >
                  <Text style={{ color: "white" }}>OK</Text>
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
                    {loadingOrderItems ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={{ color: COLORS.textSecondary }}>No items found</Text>
                    )}
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
                    if (tempSelectedItems.length === 0) setSelectedStatus("ALL");
                  }}
                >
                  <Text style={{ color: "white" }}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Status Selection Modal */}
        <Modal visible={isStatusModalVisible} transparent animationType="slide" onRequestClose={closeStatusModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Status</Text>
              <FlatList
                data={TRACKING_STATUS_OPTIONS}
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
                        setTempSelectedStatuses((prev) =>
                          prev[0] === val ? [] : [val],
                        );
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
                    <Text style={{ color: COLORS.textSecondary }}>No statuses found</Text>
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
                    if (tempSelectedStatuses.length === 0) setSelectedStatus("ALL");
                  }}
                >
                  <Text style={{ color: "white" }}>OK</Text>
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
  actionRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
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

  detailsBtn: {
    backgroundColor: COLORS.primary,
  },

  progressBtn: {
    backgroundColor: "#4CAF50",
  },

  cancelQuotationBtn: {
    backgroundColor: "#dc2626",
  },

  cancelledChip: {
    backgroundColor: "#fee2e2",
  },

  cancelledText: {
    color: "#dc2626",
    fontWeight: "700",
  },

  actionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Filter bar (Status dropdown + Search + Date) — matches the Order List page.
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 12,
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
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 0,
  },
  // Gradient count bar with Filter action — matches the Order List page.
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
  filterWrap: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: "flex-end",
  },
  filterActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  countText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
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
  cardName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  cardCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
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

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
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
    maxHeight: "80%",
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
    marginBottom: 16,
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
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: COLORS.background,
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
});
