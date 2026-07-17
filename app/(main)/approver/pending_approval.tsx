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
  TextInput,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  OrderItemList,
  orderService,
  productService,
} from "@/src/services/order.service";
import { COLORS } from "@/constants/theme";
import InlineOrderDateFilter, { type DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import Dropdown from "@/src/components/common/DropdownProps";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { api } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { refreshOrderData } from "@/src/cache";
import { fs, ms, sp } from "@/src/utils/responsive";

// "all" shows the approver's whole queue — pending AND already-decided —
// so the Status filter's "All" is genuinely everything, not just decided.
type ApprovalTab = "pending" | "others" | "all";
type RateApproverDecisionFilter =
  | "Rate Approver Approved"
  | "Rate Approver Rejected";
type RateApproverDecisionSummary = {
  decision: RateApproverDecisionFilter;
  performedByName: string;
};

const PENDING_APPROVAL_STATUS_CODE = "RATE_APPROVAL";
const OTHER_APPROVAL_STATUS_CODES = [
  "CREATED",
  "RATE_APPROVAL",
  "BILLING",
  "NEED_APPROVAL",
  "BILLING_PENDING",
  "APPROVED",
  "REJECTED",
  "BILLING_REJECTED",
  "COMPLETED",
  "AUDITOR_APPROVAL",
];

const OTHER_STATUS_OPTIONS = [
  { label: "Approved by Rate Approver", value: "6" },
  { label: "Rejected by Rate Approver", value: "7" },
];

const RATE_APPROVER_DECISION_OPTIONS: Array<{
  name: RateApproverDecisionFilter;
}> = [
  { name: "Rate Approver Approved" },
  { name: "Rate Approver Rejected" },
];

const normalizeText = (value: unknown) =>
  String(value || "").trim().toLowerCase();

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

const getRateApproverDecisionFromLogs = (
  logs: any[],
  currentUserKeys: string[],
): RateApproverDecisionSummary | null => {
  const reversedLogs = [...logs].reverse();

  for (const log of reversedLogs) {
    const performedByName = String(log?.performed_by_name || "").trim();
    if (!performedByName) continue;
    if (!currentUserKeys.includes(normalizeText(performedByName))) continue;

    const statusId = Number(log?.status_id || 0);

    if (statusId === 7) {
      return {
        decision: "Rate Approver Rejected",
        performedByName,
      };
    }

    if (statusId === 6) {
      return {
        decision: "Rate Approver Approved",
        performedByName,
      };
    }
  }

  return null;
};

export default function PendingApprovalScreen() {
  const { tab, statusFilter, year, month, _t } = useLocalSearchParams<{ tab?: string; statusFilter?: string; year?: string; month?: string; _t?: string }>();
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || "";
  const currentRateApproverUserKeys = [user?.username, user?.name]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const currentRateApproverUserKeySignature =
    currentRateApproverUserKeys.join("|");
  const [orders, setOrders] = useState<OrderItemList[]>([]);
  const [rateApproverDecisionByOrderId, setRateApproverDecisionByOrderId] =
    useState<Record<number, RateApproverDecisionSummary>>({});
  const [quotationLogByOrderId, setQuotationLogByOrderId] = useState<
    Record<number, { sap_doc_num?: string | number | null; sap_doc_entry?: number | null }>
  >({});
  const [rejectedByNameByOrderId, setRejectedByNameByOrderId] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ApprovalTab>(tab === "others" ? "others" : "pending");
  // Status dropdown value (mirrors the Order List screen's header). It maps to
  // the pending/others tab + rate-approver decision filter under the hood.
  const [statusView, setStatusView] = useState<string>(
    statusFilter === "approved"
      ? "approved"
      : statusFilter === "rejected"
        ? "rejected"
        : tab === "others"
          ? "all"
          : "pending",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<{
    id: number;
    type: "approve" | "reject";
  } | null>(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
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
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);
  const [orderItemNamesByOrderId, setOrderItemNamesByOrderId] = useState<
    Record<number, string[]>
  >({});
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    statusFilter === "approved" ? ["Rate Approver Approved"] :
    statusFilter === "rejected" ? ["Rate Approver Rejected"] : []
  );
  const [tempSelectedStatuses, setTempSelectedStatuses] = useState<string[]>(
    [],
  );
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);
  const [selectedOrderDate, setSelectedOrderDate] = useState<DateFilterValue>(() => {
    if (year && month) {
      return { mode: "month", value: `${year}-${String(month).padStart(2, "0")}` };
    }
    return null;
  });
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [loadingRateApproverDecisions, setLoadingRateApproverDecisions] =
    useState(false);
  const [approvalSuccessModal, setApprovalSuccessModal] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{
    message: string;
    orderNumber: string;
  } | null>(null);

  useEffect(() => {
    setActiveTab(tab === "others" ? "others" : "pending");
    setStatusView(
      statusFilter === "approved"
        ? "approved"
        : statusFilter === "rejected"
          ? "rejected"
          : tab === "others"
            ? "all"
            : "pending",
    );
    setSelectedStatuses(
      statusFilter === "approved" ? ["Rate Approver Approved"] :
      statusFilter === "rejected" ? ["Rate Approver Rejected"] : []
    );
  }, [tab, statusFilter]);

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
              (item.items || [])
                .map((it: any) => String(it?.category || "").trim())
                .filter(Boolean),
            ),
          );

    if (categories.length === 0) return "-";
    if (categories.length <= 2) return categories.join(", ");
    return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
  };

  const [focusKey, setFocusKey] = useState(0);

  const loadOrders = useCallback(async () => {
    try {
      setOrders([]);
      setLoading(true);

      let loadedOrders: OrderItemList[] = [];
      if (activeTab === "pending") {
        const data = await productService.getOrders(
          0,
          PENDING_APPROVAL_STATUS_CODE,
          false,
          true,
        );
        loadedOrders = Array.isArray(data) ? data : [];
      } else {
        // "others" = already decided. "all" additionally pulls the pending
        // feed, because pending orders are only returned by the
        // approval_pending call — without it "All" could never show them.
        const requests: Promise<any>[] = OTHER_APPROVAL_STATUS_CODES.map(
          (statusCode) => productService.getOrders(0, statusCode),
        );
        if (activeTab === "all") {
          requests.push(
            productService.getOrders(0, PENDING_APPROVAL_STATUS_CODE, false, true),
          );
        }
        const results = await Promise.all(requests);

        const orderMap = new Map<number, OrderItemList>();
        results.forEach((result) => {
          const ordersForStatus = Array.isArray(result) ? result : [];
          ordersForStatus.forEach((order) => {
            orderMap.set(order.id, order);
          });
        });

        loadedOrders = Array.from(orderMap.values()).sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      }

      setOrders(loadedOrders);
    } catch (error) {
      console.log("Error loading orders:", error);
      Alert.alert("Error", "Failed to load orders");
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
      setStatusView(
        hasNewParams && statusFilter === "approved"
          ? "approved"
          : hasNewParams && statusFilter === "rejected"
            ? "rejected"
            : hasNewParams && tab === "others"
              ? "all"
              : "pending",
      );
      setSearchQuery("");
      setSelectedFilter("ALL");
      setSelectedParties([]);
      setTempSelectedParties([]);
      setSelectedItems([]);
      setTempSelectedItems([]);
      setSelectedStatuses(
        hasNewParams && statusFilter === "approved" ? ["Rate Approver Approved"] :
        hasNewParams && statusFilter === "rejected" ? ["Rate Approver Rejected"] : []
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
      setActionLoading(null);
      setApprovalSuccessModal(false);
      setApprovalResult(null);
      setFocusKey(k => k + 1);
    });
    return unsubscribe;
  }, [navigation, tab, statusFilter, year, month, _t]);

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        setLoadingStatuses(true);
        const token = await storage.getAccessToken();
        const statusRes = await api.get("/orders/status/", token || undefined);
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

  const onRefresh = async () => {
    setRefreshing(true);
    // Explicit refresh: bypass the cache so the network is the source of truth.
    await refreshOrderData();
    await loadOrders();
  };

  useEffect(() => {
    const uniqueParties = new Map<string, { label: string; value: string }>();

    orders.forEach((order) => {
      if (order.card_code) {
        uniqueParties.set(order.card_code, {
          label: `${order.card_name} (${order.card_code})`,
          value: order.card_code,
        });
      }
    });

    setParties(
      Array.from(uniqueParties.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    );
  }, [orders]);

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

        // First extract items from orders that already have them inline
        const nextOrderItemsById: Record<number, string[]> = {};
        const allAvailableItems = new Set<string>();
        const needsFetch: typeof orders = [];

        orders.forEach((order) => {
          const inlineItems = (order as any).items || (order as any).order_items || [];
          if (Array.isArray(inlineItems) && inlineItems.length > 0) {
            const names = Array.from(new Set<string>(
              inlineItems
                .map((item: any) => String(item?.item_name || item?.itemName || "").trim())
                .filter(Boolean),
            ));
            nextOrderItemsById[order.id] = names;
            names.forEach((n) => allAvailableItems.add(n));
          } else {
            needsFetch.push(order);
          }
        });

        // Batch fetch the rest
        const BATCH_SIZE = 5;
        for (let i = 0; i < needsFetch.length; i += BATCH_SIZE) {
          if (!isActive) return;
          const batch = needsFetch.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (order) => {
              try {
                const response = await orderService.getOrderDetails(order.id);
                const detail = response?.data || response;
                const detailItems = Array.isArray(detail?.items) ? detail.items : [];
                const itemNames: string[] = Array.from(
                  new Set<string>(
                    detailItems
                      .map((item: any) =>
                        String(item?.item_name || item?.itemName || "").trim(),
                      )
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
          results.forEach(([orderId, itemNames]) => {
            nextOrderItemsById[orderId] = itemNames;
            itemNames.forEach((n) => allAvailableItems.add(n));
          });
        }

        if (!isActive) return;

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

      const needsFetch = completedOrders.filter((order) => {
        const docNum = order.sap_doc_num ?? order.sap_doc_number ?? null;
        const docEntry = order.sap_doc_entry ?? null;
        return docNum == null && docEntry == null;
      });

      const localEntries = completedOrders
        .filter((order) => {
          const docNum = order.sap_doc_num ?? order.sap_doc_number ?? null;
          const docEntry = order.sap_doc_entry ?? null;
          return docNum != null || docEntry != null;
        })
        .map((order) => [order.id, {
          sap_doc_num: order.sap_doc_num ?? order.sap_doc_number ?? null,
          sap_doc_entry: order.sap_doc_entry ?? null,
        }] as const);

      const BATCH_SIZE = 5;
      const fetchedEntries: Array<readonly [number, { sap_doc_num: any; sap_doc_entry: any }]> = [];
      for (let i = 0; i < needsFetch.length; i += BATCH_SIZE) {
        if (!isActive) return;
        const batch = needsFetch.slice(i, i + BATCH_SIZE);
        const entries = await Promise.all(
          batch.map(async (order) => {
            try {
              const quotationLog = await orderService.getQuotationLog(order.id);
              return [order.id, {
                sap_doc_num: quotationLog?.sap_doc_num ?? null,
                sap_doc_entry: quotationLog?.sap_doc_entry ?? null,
              }] as const;
            } catch (error) {
              console.log(`Error loading quotation log for order ${order.id}:`, error);
              return [order.id, { sap_doc_num: null, sap_doc_entry: null }] as const;
            }
          }),
        );
        entries.forEach((e) => fetchedEntries.push(e));
      }

      if (!isActive) return;

      setQuotationLogByOrderId(
        Object.fromEntries(
          [...localEntries, ...fetchedEntries].filter(
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

  const getStatusName = (item: any) =>
    String(
      (item as any).status_display || item?.status_name || item?.status || "",
    ).trim();
  const statusOptions =
    activeTab === "others" ? RATE_APPROVER_DECISION_OPTIONS : statuses;
  const isCurrentRateApproverUser = (name?: string) =>
    currentRateApproverUserKeys.includes(normalizeText(name));

  let partyLabel = " Party";
  if (selectedParties.length > 0) {
    if (selectedParties.length === 1) {
      const party = parties.find((item: any) => item.value === selectedParties[0]);
      if (party) partyLabel = `Party: ${party.label}`;
    } else {
      partyLabel = `${selectedParties.length} Parties Selected`;
    }
  }

  let itemLabel = " Item";
  if (selectedItems.length > 0) {
    itemLabel =
      selectedItems.length === 1
        ? `Item: ${selectedItems[0]}`
        : `${selectedItems.length} Items Selected`;
  }

  let statusLabel = " Status";
  if (selectedStatuses.length > 0) {
    statusLabel =
      selectedStatuses.length === 1
        ? `Status: ${selectedStatuses[0]}`
        : `${selectedStatuses.length} Status Selected`;
  }

  const dropdownOptions = [
    { label: "All Orders", value: "ALL" },
    ...(activeTab === "others"
      ? [{ label: statusLabel, value: "__STATUS__" }]
      : []),
    { label: partyLabel, value: "__PARTY__" },
    { label: itemLabel, value: "__ITEM__" },
  ];

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    setIsFilterModalVisible(false);
    if (value === "__PARTY__") {
      setTempSelectedParties(selectedParties);
      setIsPartyModalVisible(true);
    } else if (value === "__ITEM__") {
      setTempSelectedItems(selectedItems);
      setIsItemModalVisible(true);
    } else if (value === "__STATUS__") {
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

  const resetFilters = () => {
    setSelectedFilter("ALL");
    setSelectedParties([]);
    setSelectedItems([]);
    setSelectedStatuses([]);
    setTempSelectedParties([]);
    setTempSelectedItems([]);
    setTempSelectedStatuses([]);
  };

  useEffect(() => {
    let isActive = true;

    const loadRateApproverDecisionSummary = async () => {
      if (activeTab === "pending" || orders.length === 0) {
        setRateApproverDecisionByOrderId({});
        setLoadingRateApproverDecisions(false);
        return;
      }

      try {
        setLoadingRateApproverDecisions(true);
        const currentUserKeys = currentRateApproverUserKeySignature
          .split("|")
          .filter(Boolean);
        const BATCH_SIZE = 5;
        const allEntries: Array<readonly [number, RateApproverDecisionSummary]> = [];
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
          if (!isActive) return;
          const batch = orders.slice(i, i + BATCH_SIZE);
          const entries = await Promise.all(
            batch.map(async (order) => {
              try {
                const logsResponse = await orderService.getOrderLogs(order.id);
                const logs = Array.isArray(logsResponse) ? logsResponse : [];
                const decisionSummary = getRateApproverDecisionFromLogs(
                  logs,
                  currentUserKeys,
                );

                if (!decisionSummary) return null;
                return [order.id, decisionSummary] as const;
              } catch (decisionError) {
                console.log(
                  `Error loading rate approver decision for order ${order.id}:`,
                  decisionError,
                );
                return null;
              }
            }),
          );
          entries.forEach((e) => {
            if (e) allEntries.push(e);
          });
        }

        if (!isActive) return;

        setRateApproverDecisionByOrderId(Object.fromEntries(allEntries));
      } finally {
        if (isActive) {
          setLoadingRateApproverDecisions(false);
        }
      }
    };

    loadRateApproverDecisionSummary();

    return () => {
      isActive = false;
    };
  }, [activeTab, currentRateApproverUserKeySignature, orders]);

  const filteredOrders = orders.filter((item) => {
    const rateApproverDecisionSummary =
      activeTab === "pending" ? null : rateApproverDecisionByOrderId[item.id];

    // "others" is the decided-only view, so an order this approver hasn't acted
    // on is excluded. "all" keeps them — that is the whole point of All.
    if (activeTab === "others" && !rateApproverDecisionSummary) {
      return false;
    }

    const normalizedSearch = searchQuery.trim().toUpperCase();
    if (normalizedSearch) {
      const searchable = `${item.order_number || ""} ${item.card_name || ""} ${item.card_code || ""}`.toUpperCase();
      if (!searchable.includes(normalizedSearch)) return false;
    }

    if (selectedOrderDate) {
      const orderDate = getOrderDateValue(item.created_at);
      if (selectedOrderDate.mode === "date") {
        if (orderDate !== selectedOrderDate.value) return false;
      } else {
        if (!orderDate.startsWith(selectedOrderDate.value)) return false;
      }
    }

    if (
      selectedParties.length > 0 &&
      !selectedParties.includes(item.card_code)
    ) {
      return false;
    }

    if (selectedStatuses.length > 0) {
      if (activeTab === "others") {
        if (!isCurrentRateApproverUser(rateApproverDecisionSummary?.performedByName)) {
          return false;
        }
        if (
          !rateApproverDecisionSummary ||
          !selectedStatuses.includes(rateApproverDecisionSummary.decision)
        ) {
          return false;
        }
      } else if (!selectedStatuses.includes(getStatusName(item))) {
        return false;
      }
    }

    if (selectedItems.length > 0) {
      const itemNames = orderItemNamesByOrderId[item.id] || [];
      const hasItem = itemNames.some((name) =>
        selectedItems.some(
          (selectedItem) =>
            String(selectedItem).trim().toLowerCase() ===
            String(name).trim().toLowerCase(),
        ),
      );
      if (!hasItem) return false;
    }

    return true;
  });

  const getStatusBadgeText = (item: OrderItemList) => {
    const status = getStatusName(item);
    const rejectedByName = rejectedByNameByOrderId[item.id];
    if (status.toLowerCase().includes("reject") && rejectedByName) {
      return `${status}: ${rejectedByName}`;
    }
    return status;
  };

  // Colored status tag shown on every card: red = rejected, green = approved,
  // amber = still awaiting a decision.
  const getCardStatusBadge = (
    item: OrderItemList,
  ): {
    label: string;
    color: string;
    bg: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
  } => {
    // Driven by THIS approver's recorded decision — the only reliable signal.
    // The stage name is literally "Rate Approval", which contains "approv", so
    // matching on status text would paint every pending order green.
    const decision = rateApproverDecisionByOrderId[item.id];
    if (decision?.decision === "Rate Approver Approved") {
      return { label: "Approved", color: COLORS.success, bg: "#ECFDF3", icon: "checkmark-circle-outline" };
    }
    if (decision?.decision === "Rate Approver Rejected") {
      return { label: "Rejected", color: COLORS.error, bg: "#FEF2F2", icon: "close-circle-outline" };
    }

    // A rejected/cancelled order still reads as Rejected even with no decision
    // recorded against this approver (e.g. someone else rejected it).
    const raw = getStatusName(item).toLowerCase();
    if (raw.includes("reject") || raw.includes("cancel")) {
      return { label: "Rejected", color: COLORS.error, bg: "#FEF2F2", icon: "close-circle-outline" };
    }

    // No decision yet -> still awaiting action.
    return { label: "Pending", color: "#EA8C00", bg: "#FFF7ED", icon: "time-outline" };
  };

  useEffect(() => {
    let isActive = true;

    const loadRejectedByNames = async () => {
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

      setRejectedByNameByOrderId(Object.fromEntries(result));
    };

    loadRejectedByNames();

    return () => {
      isActive = false;
    };
  }, [activeTab, orders]);

  const handleApprove = (orderId: number, orderNumber: string) => {
    const approveAction = async () => {
      try {
        setActionLoading({ id: orderId, type: "approve" });
        const response: any = await productService.updatestatus(
          orderId,
          OTHER_STATUS_OPTIONS[0].value,
          "Approved",
        );
        setApprovalResult({
          message: response?.message || "Order approved successfully",
          orderNumber,
        });
        setApprovalSuccessModal(true);
        loadOrders();
      } catch (error) {
        console.log("Error approving:", error);
        Alert.alert("Error", "Failed to approve order");
      } finally {
        setActionLoading(null);
      }
    };

    approveAction();
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
      setActionLoading({ id: selectedOrderId!, type: "reject" });
      await productService.updatestatus(
        selectedOrderId!,
        OTHER_STATUS_OPTIONS[1].value,
        rejectReason,
      );
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

  const renderOrder = ({ item }: { item: OrderItemList }) => {
    const quotationLog = quotationLogByOrderId[item.id];
    const sapDocNum = item.sap_doc_num ?? quotationLog?.sap_doc_num ?? item.sap_doc_number ?? null;
    const sapDocEntry = item.sap_doc_entry ?? quotationLog?.sap_doc_entry ?? null;

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/orders/orderdetails",
            params: { orderId: item.id, from: "approver/pending_approval", sourceTab: activeTab },
          })
        }
        style={styles.orderCard}
        activeOpacity={0.85}
      >
      <View style={styles.orderHeader}>
        <View style={styles.orderNumberWrap}>
          <Text style={styles.orderNumber} numberOfLines={1}>
            {item.order_number}
          </Text>
          <Text style={styles.createdText} numberOfLines={1}>
            Created: {formatDateTime(item.created_at)}
          </Text>
        </View>
        {(() => {
          const badge = getCardStatusBadge(item);
          return (
            <View style={[styles.cardStatusBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon} size={ms(13)} color={badge.color} />
              <Text
                style={[styles.cardStatusText, { color: badge.color }]}
                numberOfLines={1}
              >
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
          <Ionicons
            name="document-text-outline"
            size={14}
            color={COLORS.primary}
          />
          <Text style={styles.metaText}>PO: {item.po_number || "-"}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>₹{item.total_amount}</Text>
      </View>

      {/* Actionable while this approver hasn't decided yet — so pending orders
          keep Approve/Reject in the "All" view, and decided ones don't. */}
      {(activeTab === "pending" ||
        (activeTab === "all" && !rateApproverDecisionByOrderId[item.id])) && (
        <View style={styles.actionRow}>
          {(() => {
            const isRejectLoading =
              actionLoading?.id === item.id && actionLoading.type === "reject";
            const isApproveLoading =
              actionLoading?.id === item.id && actionLoading.type === "approve";
            return (
              <>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => openRejectModal(item.id)}
            disabled={actionLoading !== null}
          >
            {isRejectLoading ? (
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
            onPress={() => handleApprove(item.id, item.order_number)}
            disabled={actionLoading !== null}
          >
            {isApproveLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
              </>
            );
          })()}
        </View>
      )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    let message =
      activeTab === "pending" ? "No pending orders" : "No orders found";

    if (
      selectedParties.length > 0 ||
      selectedItems.length > 0 ||
      selectedStatuses.length > 0
    ) {
      message = "No orders found for selected filters";
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name={activeTab === "pending" ? "hourglass-outline" : "filter-outline"}
          size={52}
          color={COLORS.textSecondary}
        />
        <Text style={styles.emptyText}>{message}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={[
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
              { label: "All", value: "all" },
            ]}
            value={statusView}
            onChange={(value) => {
              setStatusView(value);
              const nextTab =
                value === "pending" ? "pending" : value === "all" ? "all" : "others";
              if (nextTab !== activeTab) setLoading(true);
              setActiveTab(nextTab);
              setSelectedStatuses(
                value === "approved"
                  ? ["Rate Approver Approved"]
                  : value === "rejected"
                    ? ["Rate Approver Rejected"]
                    : [],
              );
              setSelectedParties([]);
              setSelectedItems([]);
              setSelectedFilter("ALL");
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
        {/* Date moved into the count bar below so Search can use the rest of
            the row and long text stays fully visible. */}
      </View>

      {/* Always rendered once loading finishes, even with zero results: this bar
            holds the Filter control, so hiding it on an empty list would leave the
            user unable to change the filter that emptied it. */}
        {!loading && (
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countBar}
        >
          {/* 1) Filter · 2) result count · 3) Date — each sized so they never
              collide on narrow screens. */}
          <TouchableOpacity
            style={styles.countBarFilterBtn}
            onPress={() => setIsFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="funnel-outline" size={14} color="#fff" />
            <Text style={styles.countBarFilterText}>Filter</Text>
            {(selectedParties.length > 0 ||
              selectedItems.length > 0 ||
              selectedStatuses.length > 0) && (
              <View style={styles.countBarFilterDot} />
            )}
          </TouchableOpacity>

          <View style={styles.countBarTextWrap}>
            <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
              {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"} found
            </Text>
            <Text style={styles.countSubText} numberOfLines={1}>
              Last updated just now
            </Text>
          </View>

          <View style={styles.countBarDateWrap}>
            <InlineOrderDateFilter
              value={selectedOrderDate}
              onChange={setSelectedOrderDate}
              variant="onDark"
            />
          </View>
        </LinearGradient>
      )}

      {(
        loading ||
        loadingOrderItems ||
        loadingStatuses ||
        (activeTab !== "pending" && loadingRateApproverDecisions)
      ) && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
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
      )}

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
                onPress={handleReject}
                disabled={actionLoading !== null}
              >
                {actionLoading?.type === "reject" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmRejectText}>Reject Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      <Modal
        visible={isPartyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closePartyModal}
      >
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
                      {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      },
                      isSelected && styles.modalListItemSelected,
                    ]}
                    onPress={() => {
                      const value = item.value;
                      setTempSelectedParties((prev) =>
                        prev.includes(value)
                          ? prev.filter((party) => party !== value)
                          : [...prev, value],
                      );
                    }}
                  >
                    <Text
                      style={
                        isSelected
                          ? styles.modalListTextSelected
                          : styles.modalListText
                      }
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={COLORS.primaryDark}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>
                    No parties found
                  </Text>
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
                }}
              >
                <Text style={{ color: "#fff", textAlign: "center" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

              <Text style={styles.successHeaderTitle}>Approved Successfully</Text>
              <Text style={styles.successHeaderSub}>
                Approval completed and the order has moved to the next stage
              </Text>
            </LinearGradient>

            <View style={styles.successModalBody}>
              <View style={styles.successInfoBox}>
                <Ionicons
                  name="receipt-outline"
                  size={14}
                  color={COLORS.textSecondary}
                />
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
                  <Ionicons
                    name="checkmark-done-outline"
                    size={18}
                    color="#fff"
                  />
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
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.successSecondaryText}>Refresh Orders</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isItemModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeItemModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Item</Text>
            <FlatList
              data={availableItems}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = tempSelectedItems.includes(item);
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalListItem,
                      {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      },
                      isSelected && styles.modalListItemSelected,
                    ]}
                    onPress={() => {
                      setTempSelectedItems((prev) =>
                        prev.includes(item)
                          ? prev.filter((selectedItem) => selectedItem !== item)
                          : [...prev, item],
                      );
                    }}
                  >
                    <Text
                      style={
                        isSelected
                          ? styles.modalListTextSelected
                          : styles.modalListText
                      }
                    >
                      {item}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={COLORS.primaryDark}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>
                    No items found
                  </Text>
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
                }}
              >
                <Text style={{ color: "#fff", textAlign: "center" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isStatusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeStatusModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {activeTab === "others"
                ? "Select Rate Approver Status"
                : "Select Status"}
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
                      {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      },
                      isSelected && styles.modalListItemSelected,
                    ]}
                    onPress={() => {
                      if (activeTab === "others") {
                        setTempSelectedStatuses((prev) =>
                          prev[0] === item.name ? [] : [item.name],
                        );
                        return;
                      }

                      setTempSelectedStatuses((prev) =>
                        prev.includes(item.name)
                          ? prev.filter((status) => status !== item.name)
                          : [...prev, item.name],
                      );
                    }}
                  >
                    <Text
                      style={
                        isSelected
                          ? styles.modalListTextSelected
                          : styles.modalListText
                      }
                    >
                      {item.name}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={COLORS.primaryDark}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textSecondary }}>
                    {activeTab === "others"
                      ? "No rate approver statuses found"
                      : "No statuses found"}
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
                }}
              >
                <Text style={{ color: "#fff", textAlign: "center" }}>OK</Text>
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
    alignItems: "center",
    backgroundColor: COLORS.white,
    paddingHorizontal: sp(12),
    paddingVertical: sp(12),
    gap: sp(8),
  },
  // Fixed width: the Status box must not grow/shrink when a value is picked,
  // and must be wide enough to keep the longest option on one line.
  statusDropdownWrap: {
    width: ms(124),
    flexGrow: 0,
    flexShrink: 0,
  },
  // Search takes every remaining pixel (~3/4 of the row); minWidth:0 lets it
  // shrink rather than push Status off-screen.
  fieldWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: sp(8),
    position: "relative",
  },
  fieldLabel: {
    position: "absolute",
    top: 0,
    left: 12,
    zIndex: 2,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 4,
    fontSize: fs(12),
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  searchWrap: {
    alignSelf: "stretch",
    height: ms(56),
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: sp(10),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(12),
    backgroundColor: COLORS.inputBackground,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(12),
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 0,
  },
  tabGroup: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
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
  filterWrap: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  filterControlRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  filterDropdownWrap: {
    flex: 1,
  },
  filterDateWrap: {
    marginBottom: 8,
  },
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: sp(16),
    marginTop: sp(12),
    paddingVertical: sp(12),
    paddingHorizontal: sp(12),
    borderRadius: sp(16),
    gap: sp(10),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  // Middle column: the only flexible one, so Filter and Date keep their size
  // and the count text absorbs whatever width is left.
  countBarTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  countBarDateWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  countText: {
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "800",
  },
  countSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fs(11),
    marginTop: 2,
  },
  countBarFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
  },
  countBarFilterText: {
    color: "#fff",
    fontSize: fs(12),
    fontWeight: "700",
  },
  countBarFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: sp(16),
    flexGrow: 1,
  },
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: sp(14),
    padding: sp(16),
    marginBottom: sp(12),
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
    marginBottom: sp(8),
    gap: sp(8),
  },
  orderNumberWrap: {
    flex: 1,
    minWidth: 0,
  },
  orderNumber: {
    fontSize: fs(16),
    fontWeight: "700",
    color: COLORS.text,
  },
  createdText: {
    fontSize: fs(12),
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Background/text colour applied inline per status (see getCardStatusBadge).
  // The pill must stay on ONE line: `nowrap` + a non-shrinking label stop the
  // icon and text from stacking, `alignSelf` keeps it hugging its content, and
  // no maxWidth means it is never measured narrower than the label needs.
  cardStatusBadge: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 999,
    flexGrow: 0,
    flexShrink: 0,
  },
  cardStatusText: {
    fontSize: fs(11),
    fontWeight: "700",
    flexShrink: 0,
    includeFontPadding: false,
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
    fontSize: fs(14),
    fontWeight: "600",
    color: COLORS.text,
  },
  cardCode: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    marginBottom: sp(10),
  },
  metaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sp(8),
    marginBottom: sp(8),
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: sp(14),
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
  },
  focChip: {
    backgroundColor: "#FFF7E6",
    borderColor: "#F59E0B",
  },
  metaText: {
    fontSize: fs(12),
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
    gap: sp(8),
    marginTop: 4,
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  amountLabel: {
    fontSize: fs(14),
    color: COLORS.textSecondary,
  },
  amountValue: {
    fontSize: fs(20),
    flexShrink: 1,
    fontWeight: "700",
    color: COLORS.text,
  },
  actionRow: {
    flexDirection: "row",
    gap: sp(12),
    marginTop: sp(16),
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: sp(12),
    borderRadius: 8,
    gap: 6,
  },
  approveBtn: {
    backgroundColor: COLORS.success,
  },
  rejectBtn: {
    backgroundColor: COLORS.error,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: fs(16),
    color: COLORS.textSecondary,
    marginTop: 6,
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
    color: COLORS.textSecondary,
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
    color: COLORS.text,
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
    marginLeft: 6,
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
});
