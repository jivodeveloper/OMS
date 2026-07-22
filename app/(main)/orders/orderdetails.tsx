import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  TextInput,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "@/constants/theme";
import { appAlert } from "@/src/components/common/AppDialog";
import StateWrapper from "@/src/components/common/StateWrapper";
import { orderService, productService } from "@/src/services/order.service";
import { useAuth, useUILabels } from "@/src/context/AuthContext";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";
import { refreshOrderData } from "@/src/cache";
import { fs, ms, sp } from "@/src/utils/responsive";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const toNumber = (value: string | number | null | undefined): number =>
  typeof value === "number" ? value : parseFloat(String(value ?? "")) || 0;

const stripCardCode = (name?: string, code?: string) => {
  if (!name) return "";
  if (!code) return name;
  return name.replace(`(${code})`, "").replace(/\s{2,}/g, " ").trim();
};

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

// Auto-generated remark text the system stores when a user takes an action
// WITHOUT typing a remark (e.g. tapping Approve with no note). These are not
// real comments, so we hide them — only genuinely typed remarks are shown.
const AUTO_REMARK_PHRASES = new Set([
  "approved",
  "rejected",
  "accepted",
  "completed",
  "accepted by billing",
  "approved by billing",
  "rejected by billing",
  "sent to auditor",
  "rejected by rate approver",
  "approved by rate approver",
  "sales quotation created by auditor",
  "rate approval pending",
  "order created",
  "billing",
  "auditor approval",
  "need approval",
  "rate approval",
]);

// Items are grouped by the backend's `variety_type` (PREMIUM / COMMODITY /
// OTHERS) — the same classification the web Rate Approver screen uses, so both
// apps bucket an order identically. Anything unrecognised falls into OTHERS so
// an item can never be filtered out of view entirely.
const VARIETY_ORDER = ["PREMIUM", "COMMODITY", "OTHERS"] as const;
type VarietyKey = (typeof VARIETY_ORDER)[number];

const VARIETY_LABEL: Record<VarietyKey, string> = {
  PREMIUM: "Premium",
  COMMODITY: "Commodity",
  OTHERS: "Others",
};

const varietyKeyOf = (item: any): VarietyKey => {
  const key = String(item?.variety_type || "").toUpperCase();
  return (VARIETY_ORDER as readonly string[]).includes(key)
    ? (key as VarietyKey)
    : "OTHERS";
};

const isRealUserRemark = (remark: unknown): boolean => {
  const text = String(remark ?? "").trim();
  if (!text) return false;
  return !AUTO_REMARK_PHRASES.has(text.toLowerCase());
};

// A reviewer's action is logged on two rows (the stage row + the action row)
// with the SAME remark, so a comment can appear twice for one person. Collapse
// to ONE entry per (author + remark text) across the whole list — so each
// workflow user shows their remark once, while different users (and a user's
// genuinely different remarks) are all preserved.
const dedupeRemarks = (logs: any[]): any[] => {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const log of logs) {
    const author = String(log?.performed_by_name ?? "").trim().toLowerCase();
    const text = String(log?.remarks ?? "").trim().toLowerCase();
    const key = `${author}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(log);
  }
  return result;
};

const REMARK_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const formatRemarkDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mon = REMARK_MONTHS[date.getMonth()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${dd} ${mon}, ${hh}:${mm}`;
};

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

// The creator of an order may edit it ONLY while the next approver has not
// acted on it yet (i.e. it is still sitting in the approver's pending queue).
// Returns whether the current user created the order and whether it is still
// awaiting that first approval.
const getCreatorEditState = (
  order: any,
  user: { id?: number; username?: string | null } | null | undefined,
) => {
  if (!order) return { isCreator: false, awaitingApprover: false };
  const statuses = getOrderStatusCodes(order);
  const awaitingApprover =
    hasStatusCode(statuses, "NEED_APPROVAL") ||
    hasStatusCode(statuses, "RATE_APPROVAL") ||
    statuses.includes("2") ||
    statuses.includes("4") ||
    hasStatusText(statuses, "need approval") ||
    hasStatusText(statuses, "rate approval") ||
    hasStatusText(statuses, "pending approval");
  const isCreator =
    (order?.created_by != null &&
      Number(order.created_by) === Number(user?.id)) ||
    (!!order?.created_by_name &&
      !!user?.username &&
      order.created_by_name === user.username);
  return { isCreator, awaitingApprover };
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
  const { t } = useUILabels();
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
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  // Remarks/comments left across the workflow stages (from the order timeline).
  const [remarkLogs, setRemarkLogs] = useState<any[]>([]);
  // Collapsed by default (like the Items card); tap the header to expand.
  const [remarksExpanded, setRemarksExpanded] = useState(false);

  const toggleItem = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Show the edit (pencil) action in two cases:
  //   1. The order's CREATOR, while the next approver hasn't acted yet.
  //   2. An APPROVER reviewing an order that is pending their action — so they
  //      can correct item details before confirming the approval. This is what
  //      makes every approval a "review (and optionally edit) then confirm"
  //      flow: the Approve button on the queue cards now opens this page, and
  //      the approver edits here via the same order-entry screen creators use.
  // Both paths navigate into create.tsx edit mode and return here on save.
  const { isCreator, awaitingApprover } = getCreatorEditState(order, user);
  const canCreatorEdit = isCreator && awaitingApprover;
  // Approver can edit only while the order is genuinely pending their action and
  // it wasn't opened read-only from the "others" tab (same gate as the action
  // bar's canActOnOrder).
  const canApproverEdit =
    !isCreator &&
    sourceTab !== "others" &&
    isPendingActionStatusForRole(order, userRole);
  const canEditOrder = canCreatorEdit || canApproverEdit;
  useEffect(() => {
    // Header is customised only when this user may edit; everyone else keeps the
    // default header (with the notification bell) untouched.
    if (!order) return;
    if (!canEditOrder) {
      // Creator whose approver has acted, or a viewer with no edit rights —
      // lock the order (no edit action). Leaving the creator branch explicit so
      // a locked creator order shows no pencil rather than the default header.
      if (isCreator) navigation.setOptions({ headerRight: () => null });
      return;
    }
    const parsedId = Number(
      order?.id ?? (Array.isArray(orderId) ? orderId[0] : orderId),
    );
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
          {/* Page-with-pencil: says "edit THIS document", which a bare pencil
              (or the compose glyph) doesn't. Ionicons has no equivalent, so
              this one comes from MaterialCommunityIcons. */}
          <MaterialCommunityIcons
            name="file-document-edit-outline"
            size={24}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isCreator, canEditOrder, order?.id, orderId]);

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
      const orderData = res?.data || res;
      setOrder(orderData);

      // Build the "Remarks & Comments" timeline so every reviewer sees remarks
      // left by previous users. It starts with the CREATOR's comment (the one
      // added on Create Order), followed by each approval-stage remark.
      try {
        const logsRes = await orderService.getOrderLogs(id);
        const logs = Array.isArray(logsRes)
          ? logsRes
          : logsRes?.data || logsRes?.results || [];
        // Only remarks a PERSON actually typed. Two filters:
        //  • isRealUserRemark  – drops auto action text ("Approved", …)
        //  • performed_by_name – drops system-authored rows (e.g. the generated
        //    rate-approval reason listing price-list vs basic rates). Those have
        //    no performer and rendered as "System", which means nothing to a user.
        const stageRemarks = (Array.isArray(logs) ? logs : []).filter(
          (log: any) =>
            isRealUserRemark(log?.remarks) &&
            String(log?.performed_by_name ?? "").trim().length > 0,
        );

        const creationComment = String(orderData?.remarks ?? "").trim();
        const creationEntry = creationComment
          ? [
              {
                id: "creation-comment",
                performed_by_name:
                  orderData?.created_by_name || orderData?.punched_by || "Creator",
                status_name: "Order Created",
                remarks: creationComment,
                created_at: orderData?.created_at,
              },
            ]
          : [];

        setRemarkLogs(dedupeRemarks([...creationEntry, ...stageRemarks]));
      } catch {
        // timeline is best-effort; the rest of the screen still works
        const creationComment = String(orderData?.remarks ?? "").trim();
        setRemarkLogs(
          creationComment
            ? [
                {
                  id: "creation-comment",
                  performed_by_name:
                    orderData?.created_by_name || orderData?.punched_by || "Creator",
                  status_name: "Order Created",
                  remarks: creationComment,
                  created_at: orderData?.created_at,
                },
              ]
            : [],
        );
      }
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

  // Re-fetch whenever the screen gains focus, not only when orderId changes.
  // This is what makes an edit auto-reflect: after "Update Order" navigates
  // here (with the SAME orderId), focus fires and we re-read the order. The
  // create screen invalidated this order's cache first, so the read is fresh.
  // A silent refresh (isRefresh=true) is used once the order is already loaded,
  // so returning to the screen updates in place instead of flashing a loader.
  const loadedOrderIdRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      const parsedOrderId = Number(
        Array.isArray(orderId) ? orderId[0] : orderId,
      );
      if (!parsedOrderId) {
        setOrder(null);
        setLoading(false);
        return;
      }
      const silent = loadedOrderIdRef.current === parsedOrderId;
      loadedOrderIdRef.current = parsedOrderId;
      fetchOrder(parsedOrderId, silent);
    }, [fetchOrder, orderId]),
  );

  const itemsList = order?.items || order?.order_items || order?.orderItems || [];

  // Bucket the order's items by variety, keeping Premium → Commodity → Others
  // order. Only buckets that actually have items become tabs.
  const varietyGroups = useMemo(() => {
    const buckets = new Map<VarietyKey, any[]>();
    (itemsList as any[]).forEach((item) => {
      const key = varietyKeyOf(item);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    });
    return VARIETY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
      key,
      label: VARIETY_LABEL[key],
      items: buckets.get(key)!,
    }));
  }, [itemsList]);

  const [activeVariety, setActiveVariety] = useState<VarietyKey | null>(null);

  // Default to the first available group (Premium wins by VARIETY_ORDER), and
  // re-point if the current tab disappears when a different order loads.
  useEffect(() => {
    if (varietyGroups.length === 0) {
      setActiveVariety(null);
      return;
    }
    setActiveVariety((current) =>
      current && varietyGroups.some((g) => g.key === current)
        ? current
        : varietyGroups[0].key,
    );
  }, [varietyGroups]);

  const visibleItems =
    varietyGroups.find((g) => g.key === activeVariety)?.items ?? itemsList;

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

  const onRefresh = useCallback(async () => {
    if (!parsedOrderId) return;
    // Explicit refresh: drop cached order detail/logs so this re-reads live.
    await refreshOrderData();
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
    appAlert("Success", message, [{ text: "OK", onPress: openPendingScreen }]);
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
        showSuccessAndOpenPending("Sales Order created successfully");
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
      appAlert("Error", err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      appAlert("Error", "Please enter a rejection reason");
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
      appAlert("Error", "Failed to reject order");
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
              <View style={styles.headerContent}>
                <View style={styles.headerTopRow}>
                  <Text style={styles.orderNo} numberOfLines={1}>
                    {order.order_number}
                  </Text>
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
                        ? "Pending"
                        : order.status_name || order.status_display || order.status || "Order"}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerSecondRow}>
                  <Text style={styles.partyName} numberOfLines={1}>
                    {stripCardCode(order.card_name, order.card_code)}
                  </Text>
                  {!!order.party_state && (
                    <View style={styles.stateRow}>
                      <Ionicons name="location" size={14} color="#4ADE80" />
                      <Text style={styles.party} numberOfLines={1}>
                        {order.party_state}
                      </Text>
                    </View>
                  )}
                </View>

                {/* No "editable"/"locked" chips: the header's edit action is
                    itself the signal — it is shown only while the order can be
                    edited and hidden once an approver has acted. */}
              </View>
            </LinearGradient>

            {/* ===== Order Info ===== */}
            <View style={styles.card}>
              <SectionTitle
                icon="information-circle-outline"
                title="Order Info"
                right={
                  !!order.card_code && (
                    <Text style={styles.sectionTitleCode}>{order.card_code}</Text>
                  )
                }
              />
              <InfoRow label="Party State" value={order.party_state} />
              <InfoRow label="Punched By" value={order.created_by_name} />
              <InfoRow label="Delivery Date" value={order.delivery_date} />
              <InfoRow label="PO Number" value={order.po_number} />
              <InfoRow label="Bill To" value={order.bill_to_address} />
              <InfoRow label="Ship To" value={order.ship_to_address} />
              {/* Comment moved to the "Remarks & Comments" section below. */}
            </View>

            {/* ===== Remarks & Comments (collapsed by default) ===== */}
            {remarkLogs.length > 0 && (
              <View style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setRemarksExpanded((v) => !v)}
                >
                  <SectionTitle
                    icon="chatbubbles-outline"
                    title="Remarks & Comments"
                    right={
                      <View style={styles.remarkToggle}>
                        <View style={styles.remarkCountPill}>
                          <Text style={styles.remarkCountText}>
                            {remarkLogs.length}
                          </Text>
                        </View>
                        <Ionicons
                          name={remarksExpanded ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={COLORS.textSecondary}
                        />
                      </View>
                    }
                  />
                </TouchableOpacity>
                {remarksExpanded &&
                  remarkLogs.map((log: any, index: number) => (
                  <View
                    key={log?.id ?? index}
                    style={[
                      styles.remarkItem,
                      index === remarkLogs.length - 1 && styles.remarkItemLast,
                    ]}
                  >
                    <View style={styles.remarkHeaderRow}>
                      <View style={styles.remarkAvatar}>
                        <Text style={styles.remarkAvatarText}>
                          {String(log?.performed_by_name || "?")
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.remarkAuthor} numberOfLines={1}>
                          {log?.performed_by_name || "System"}
                        </Text>
                        {!!log?.status_name && (
                          <Text style={styles.remarkStage} numberOfLines={1}>
                            {log.status_name}
                          </Text>
                        )}
                      </View>
                      {!!log?.created_at && (
                        <Text style={styles.remarkDate}>
                          {formatRemarkDate(log.created_at)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.remarkText}>{log.remarks}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ===== Items ===== */}
            <View style={styles.card}>
              <SectionTitle
                icon="cube-outline"
                title={`Items (${order.items_count || itemsList.length})`}
                right={
                  varietyGroups.length > 0 ? (
                    <View style={styles.varietyTabs}>
                      {varietyGroups.map((group) => {
                        const active = group.key === activeVariety;
                        return (
                          <TouchableOpacity
                            key={group.key}
                            activeOpacity={0.8}
                            onPress={() => setActiveVariety(group.key)}
                            style={[
                              styles.varietyTab,
                              active && styles.varietyTabActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.varietyTabText,
                                active && styles.varietyTabTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {group.label}
                            </Text>
                            <View
                              style={[
                                styles.varietyCount,
                                active && styles.varietyCountActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.varietyCountText,
                                  active && styles.varietyCountTextActive,
                                ]}
                              >
                                {group.items.length}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : undefined
                }
              />
              {visibleItems.map((item: any, index: number) => {
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
                const key = String(item.id ?? index);
                const expanded = !!expandedItems[key];

                return (
                  <View
                    key={key}
                    style={[styles.itemCard, isFlagged && styles.flaggedItemCard]}
                  >
                    <TouchableOpacity
                      style={styles.itemHeader}
                      activeOpacity={0.7}
                      onPress={() => toggleItem(key)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                    >
                      <View style={styles.itemIndexBadge}>
                        <Text style={styles.itemIndexText}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemHeaderName} numberOfLines={expanded ? 3 : 2}>
                          {item.item_name}
                        </Text>
                        {!!item.item_code && (
                          <Text style={styles.itemHeaderCode}>{item.item_code}</Text>
                        )}
                      </View>
                      {/* No warning icon: a rate below the price list is already
                          shown by the red Basic Price below, so the icon only
                          added noise. */}
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={ms(20)}
                        color={COLORS.primary}
                      />
                    </TouchableOpacity>

                    {expanded && (
                      <View style={styles.itemBody}>
                        <View style={styles.gridWrap}>
                          <View style={styles.gridCol}>
                            <GridCell label={t("price_list", "Price List (Basic)")} value={`₹${item.price_list_basic}`} />
                            <GridCell label="Basic Price" value={`₹${item.basic_price}`} danger={isFlagged} />
                            <GridCell label="Boxes" value={item.boxes} />
                            <GridCell label="PCS/Case" value={item.pcs} />
                          </View>
                          <View style={styles.gridColDivider} />
                          <View style={styles.gridCol}>
                            <GridCell label="Total PCS" value={item.qty} />
                            <GridCell label="Item Ltrs" value={itemLtrs} />
                            <GridCell label="Total Ltrs" value={totalLtrs} accent />
                            <GridCell label="Total" value={`₹${item.total}`} bold />
                          </View>
                        </View>

                        {itemSchemes.map((scheme: any, sIndex: number) => (
                          <View
                            key={`${scheme.id ?? scheme.scheme_id ?? scheme.scheme_name}-${sIndex}`}
                            style={styles.schemeBadge}
                          >
                            <Ionicons name="pricetag-outline" size={13} color="#7C3AED" />
                            <Text style={styles.schemeBadgeText}>
                              {scheme.scheme_name || scheme.scheme_id || `Scheme ${sIndex + 1}`}
                              {getSchemeQty(scheme) > 0 ? ` - Qty: ${formatDisplayNumber(getSchemeQty(scheme))}` : ""}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.subtotalBox}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalValue}>
                  Rs {formatCurrencyAmount(subtotalAmount)}
                </Text>
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
                <Ionicons name="close-circle-outline" size={24} color="#fff" />
                <Text style={styles.actionBtnTitle}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => setApproveModalVisible(true)}
                disabled={actionLoading !== null}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={24} color="#fff" />
                <Text style={styles.actionBtnTitle}>Approve</Text>
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

const SectionTitle = ({ icon, title, right }: any) => (
  <View style={styles.sectionTitleRow}>
    <Ionicons name={icon} size={ms(18)} color={COLORS.primary} />
    <Text style={styles.sectionTitle} numberOfLines={1}>
      {title}
    </Text>
    <View style={styles.sectionTitleSpacer} />
    {right}
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

const GridCell = ({ label, value, bold, accent, danger }: any) => {
  const display =
    value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <View style={styles.gridCell}>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text
        style={[
          styles.gridValue,
          bold && styles.gridValueBold,
          accent && styles.gridValueAccent,
          danger && styles.gridValueDanger,
        ]}
      >
        {display}
      </Text>
    </View>
  );
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
    width: ms(110),
    flexShrink: 0,
    fontSize: fs(13),
    color: COLORS.black,
  },
  infoColon: {
    marginHorizontal: 4,
    color: COLORS.textLight,
  },
  infoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(14),
    fontWeight: "600",
    color: COLORS.text,
  },
  boldInfoText: {
    fontWeight: "800",
  },
  container: { flex: 1, backgroundColor: "#F4F6FA" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    width: "100%",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  partyName: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginRight: 10,
  },
  headerSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderNo: {
    flex: 1,
    color: "#fff",
    opacity: 0.95,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginRight: 10,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 10,
  },
  party: {
    color: "#fff",
    opacity: 0.95,
    fontSize: 13,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: 160,
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
  remarkToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  remarkCountPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: COLORS.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  remarkCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
  remarkItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
    paddingVertical: 12,
  },
  remarkItemLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  remarkHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  remarkAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  remarkAvatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },
  remarkAuthor: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  remarkStage: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  remarkDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  remarkText: {
    fontSize: 13.5,
    color: COLORS.text,
    lineHeight: 19,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 42,
  },
  // Premium / Commodity tabs sit on this row, so it must be allowed to shrink.
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: sp(14),
    gap: sp(6),
  },
  varietyTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    flexShrink: 1,
  },
  varietyTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: sp(8),
    paddingVertical: sp(5),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E9F0",
    backgroundColor: "#F6F8FC",
  },
  varietyTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  varietyTabText: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  varietyTabTextActive: {
    color: "#fff",
  },
  varietyCount: {
    minWidth: ms(16),
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#E5E9F0",
    alignItems: "center",
    justifyContent: "center",
  },
  varietyCountActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  varietyCountText: {
    fontSize: fs(10),
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  varietyCountTextActive: {
    color: "#fff",
  },
  sectionTitle: {
    fontSize: fs(16),
    fontWeight: "700",
    color: COLORS.text,
    flexShrink: 1,
  },
  sectionTitleSpacer: {
    flex: 1,
    minWidth: sp(6),
  },
  sectionTitleCode: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  // ===== Item accordion =====
  itemCard: {
    borderWidth: 1,
    borderColor: "#EAEEF5",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#FCFDFF",
    overflow: "hidden",
  },
  flaggedItemCard: {
    borderColor: "#FBD5D5",
    backgroundColor: "#FFF7F7",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  itemIndexBadge: {
    width: ms(26),
    height: ms(26),
    borderRadius: 8,
    flexShrink: 0,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  itemIndexText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
  },
  itemHeaderName: {
    fontSize: fs(14),
    fontWeight: "700",
    color: COLORS.text,
  },
  itemHeaderCode: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemBody: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
  },
  gridWrap: {
    flexDirection: "row",
    marginTop: 10,
  },
  gridCol: {
    flex: 1,
  },
  gridColDivider: {
    width: 1,
    backgroundColor: "#EEF1F6",
    marginHorizontal: 12,
  },
  gridCell: {
    marginBottom: 12,
  },
  gridLabel: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  gridValue: {
    fontSize: fs(14),
    fontWeight: "600",
    color: COLORS.text,
  },
  gridValueBold: {
    fontWeight: "800",
  },
  gridValueAccent: {
    color: "#7C3AED",
    fontWeight: "800",
  },
  gridValueDanger: {
    color: COLORS.error,
    fontWeight: "800",
  },
  subtotalBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  subtotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6D28D9",
  },
  subtotalValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#6D28D9",
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
    gap: 8,
    paddingVertical: 15,
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
