import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TouchableOpacity,
  Text,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dropdown } from "react-native-element-dropdown";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { api } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import { DashboardChartsData, TopPartyEntry } from "@/src/types/dashboard";
import MonthPicker from "@/src/components/dashboard/MonthPicker";
import SalesLineChart from "@/src/components/dashboard/SalesLineChart";
import TopPartiesChart from "@/src/components/dashboard/TopPartiesChart";
import StatusPieChart from "@/src/components/dashboard/StatusPieChart";
import CategorySalesChart from "@/src/components/dashboard/CategorySalesChart";
import StatewiseBarChart from "@/src/components/dashboard/StateWiseBarChart";
import AnimatedCard from "@/src/components/dashboard/AnimatedCard";
import AnimatedNumber from "@/src/components/dashboard/AnimatedNumber";
import StateWrapper from "@/src/components/common/StateWrapper";
import {
  OrderItemList,
  productService,
  orderService,
} from "@/src/services/order.service";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2023 }, (_, i) => ({
  label: String(2024 + i),
  value: 2024 + i,
}));
const REPORT_OPTIONS = [
  { label: "All Reports", value: "ALL" },
  { label: "Status Report", value: "STATUS" },
  { label: "Category Sales", value: "CATEGORY" },
  { label: "Top Parties", value: "TOP_PARTIES" },
  { label: "Statewise Orders", value: "STATEWISE" },
  { label: "Person Performance", value: "PERSON_PERFORMANCE" },
  { label: "Completed Variety", value: "COMPLETED_VARIETY" },
];

type ReportFilter = (typeof REPORT_OPTIONS)[number]["value"];

const MONTH_FILTER_LABELS = [
  "All Year",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface DashboardData {
  // General
  total_orders: number;
  total_revenue: string;
  completed_revenue?: string;
  pending_revenue?: string;
  rejected_revenue?: string;
  today_orders: number;
  this_month_orders: number;
  status_counts: Record<string, number>;
  user_counts: Record<string, number>;
  accepted_orders?: number;
  rejected_orders?: number;
  pending_review_orders?: number;
  reviewed_orders?: number;
}

type VarietyCompletedEntry = {
  variety: string;
  orders: number;
  qty: number;
  ltrs: number;
};
type CompletedVarietyMetric = "orders" | "qty" | "ltrs";

const normalizeText = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const UNASSIGNED_VARIETY_LABEL = "Unassigned Variety";

const parseAmount = (value: unknown) => {
  const amount = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
};

const isWithinSelectedPeriod = (value: string | undefined, year: number, month: number) => {
  if (!value) return false;

  const normalizedValue =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value}Z`
      : value;
  const parsed = new Date(normalizedValue);

  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.getFullYear() !== year) return false;
  if (month !== 0 && parsed.getMonth() + 1 !== month) return false;

  return true;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < 400;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<DashboardChartsData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  const [lineYear, setLineYear] = useState(new Date().getFullYear());

  const [donutYear, setDonutYear] = useState(new Date().getFullYear());
  const [donutMonth, setDonutMonth] = useState(0);
  const [selectedReport, setSelectedReport] = useState<ReportFilter>("ALL");

  const [mgrYear, setMgrYear] = useState(new Date().getFullYear());
  const [mgrMonth, setMgrMonth] = useState(new Date().getMonth() + 1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const category = "OIL";
  const [audMonth, setaudMonth] = useState(new Date().getMonth() + 1);
  const [audYear, setAudYear] = useState(new Date().getFullYear());
  const [personModalVisible, setPersonModalVisible] = useState(false);
  const [personModalMode, setPersonModalMode] = useState<"TOP3" | "ALL">("TOP3");
  const [revenueModalVisible, setRevenueModalVisible] = useState(false);
  const [todayModalVisible, setTodayModalVisible] = useState(false);
  const [varietyModalVisible, setVarietyModalVisible] = useState(false);
  const [ordersModalVisible, setOrdersModalVisible] = useState(false);
  const [ordersModalLoading, setOrdersModalLoading] = useState(false);
  const [ordersModalTitle, setOrdersModalTitle] = useState("Orders");
  const [ordersModalOrders, setOrdersModalOrders] = useState<OrderItemList[]>([]);
  const [ordersModalSapInfo, setOrdersModalSapInfo] = useState<
    Record<number, { sap_doc_num: string | number | null; sap_doc_entry: number | null }>
  >({});
  // Remembers that the orders popup should be re-opened when returning to this
  // screen (e.g. after tapping "View Details" and pressing back).
  const reopenOrdersModalRef = React.useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (reopenOrdersModalRef.current) {
        reopenOrdersModalRef.current = false;
        setOrdersModalVisible(true);
      }
    }, []),
  );
  const [todayStatusCounts, setTodayStatusCounts] = useState({
    completed: 0,
    pending: 0,
    rejected: 0,
  });
  const [completedVarietyData, setCompletedVarietyData] = useState<
    VarietyCompletedEntry[]
  >([]);
  const [completedTopParties, setCompletedTopParties] = useState<TopPartyEntry[]>(
    [],
  );
  const [completedVarietyLoading, setCompletedVarietyLoading] = useState(false);
  const [completedVarietyMetric, setCompletedVarietyMetric] =
    useState<CompletedVarietyMetric>("orders");
  const [allAssignedParties, setAllAssignedParties] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderItemList[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshing = React.useRef(false);
  const handleRetry = () => setRetryCount((prev) => prev + 1);

  useEffect(() => {
    if (user?.role === "manager") {
      fetchDashboard(mgrYear, mgrMonth, category);
      if (user?.id) {
        fetchUserParties();
      }
    } else if (
      user?.role === "auditor" ||
      user?.role === "approver" ||
      user?.role === "billing"
    ) {
      fetchDashboard(audYear, audMonth, category);
    } else {
      fetchDashboard();
    }
  }, [user, mgrYear, mgrMonth, category, audYear, audMonth, retryCount]);

  const activeChartYear =
    user?.role === "manager"
      ? mgrYear
      : user?.role === "auditor" || user?.role === "approver" || user?.role === "billing"
        ? audYear
        : donutYear;
  const activeChartMonth =
    user?.role === "manager"
      ? mgrMonth
      : user?.role === "auditor" || user?.role === "approver" || user?.role === "billing"
        ? audMonth
        : donutMonth;

  useEffect(() => {
    fetchChartData(lineYear, activeChartYear, activeChartMonth);
  }, [lineYear, activeChartYear, activeChartMonth, retryCount]);

  useEffect(() => {
    if (user?.role === "admin" && chartData) {
      deriveCompletedDataFromCharts(chartData);
    }
  }, [user?.role, chartData]);

  // Recent orders for the billing dashboard hero list.
  useEffect(() => {
    if (user?.role !== "billing") return;
    let active = true;
    (async () => {
      try {
        const orders = await productService.getOrders(0, undefined, true);
        if (active) {
          setRecentOrders((Array.isArray(orders) ? orders : []).slice(0, 4));
        }
      } catch (err) {
        console.log("Recent orders fetch error:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.role, retryCount]);

  const fetchUserParties = async () => {
    try {
      const token = await storage.getAccessToken();
      // category=all returns the user's assigned parties across every category
      // (e.g. the same card_code under both OIL and BEVERAGES), so the dashboard
      // count and list reflect all assignments, not just the primary category.
      const userPartiesRes = await api.get(`/auth/users/${user?.id}/parties/?category=all`, token || undefined);
      if (userPartiesRes?.success && Array.isArray(userPartiesRes?.data?.parties)) {
        setAllAssignedParties(userPartiesRes.data.parties);
      } else {
        setAllAssignedParties([]);
      }
    } catch (error) {
      console.log("Error fetching user parties:", error);
    }
  };

  const fetchDashboard = async (y?: number, m?: number, c?: string) => {
    try {
      if (!isRefreshing.current) setLoading(true);
      setError(null);
      const token = await storage.getAccessToken();
      const params = [];
      if (y !== undefined) params.push(`year=${y}`);
      if (m !== undefined) params.push(`month=${m}`);
      if (c) params.push(`category=${c}`);

      const query = params.length > 0 ? `?${params.join("&")}` : "";
      const result = await api.get(`/orders/dashboardW/${query}`, token || undefined);
      const payload = result?.data ?? result;
      if (payload && !payload.error && payload.total_orders !== undefined) {
        setData(payload);
      }
    } catch (error) {
      console.log("Dashboard fetch error:", error);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async (ly: number, dy: number, dm: number) => {
    if (!isRefreshing.current) setChartLoading(true);
    try {
      const token = await storage.getAccessToken();
      const result = await api.get(
        `/orders/dashboardW/charts/?line_year=${ly}&year=${dy}&month=${dm}`,
        token || undefined,
      );
      console.log("Chart API result:", result);
      if (result && !result.error && result.monthly_sales) {
        setChartData(result);
        if (user?.role === "admin") {
          deriveCompletedDataFromCharts(result);
        }
      }
    } catch (error) {
      console.log("Chart data fetch error:", error);
    } finally {
      setChartLoading(false);
    }
  };

  const deriveCompletedDataFromCharts = (charts: DashboardChartsData) => {
    // Top Parties: aggregate chartData.top_parties by card_code
    const partyRevenue = new Map<string, TopPartyEntry>();
    (charts.top_parties || []).forEach((party: any) => {
      const key = String(party.card_code || "").trim();
      if (!key) return;
      const existing = partyRevenue.get(key);
      partyRevenue.set(key, {
        card_code: key,
        card_name: existing?.card_name || party.card_name || key,
        revenue: Number(existing?.revenue || 0) + Number(party.revenue || 0),
      });
    });
    setCompletedTopParties(
      Array.from(partyRevenue.values()).sort(
        (a, b) => Number(b.revenue || 0) - Number(a.revenue || 0),
      ),
    );

    // Completed Variety: extract from state_item_sales (defaults to completed orders)
    const varietyStats = new Map<string, { orders: number; qty: number; ltrs: number }>();
    const stateItemSales: any[] = (charts as any).state_item_sales || [];
    stateItemSales.forEach((stateRow: any) => {
      const products: any[] = Array.isArray(stateRow?.products) ? stateRow.products : [];
      products.forEach((product: any) => {
        const variety = String(product?.variety || "").trim() || UNASSIGNED_VARIETY_LABEL;
        const existing = varietyStats.get(variety) || { orders: 0, qty: 0, ltrs: 0 };
        existing.orders += Number(product?.count || 0);
        existing.qty += Number(product?.quantity || 0);
        existing.ltrs += Number(product?.ltrs || 0);
        varietyStats.set(variety, existing);
      });
    });

    setCompletedVarietyData(
      Array.from(varietyStats.entries())
        .map(([variety, stats]) => ({
          variety,
          orders: stats.orders,
          qty: stats.qty,
          ltrs: stats.ltrs,
        }))
        .sort((a, b) => a.variety.localeCompare(b.variety)),
    );
  };

  const refreshDashboardScreen = async () => {
    if (user?.role === "manager") {
      await Promise.all([
        fetchDashboard(mgrYear, mgrMonth, category),
        fetchChartData(lineYear, activeChartYear, activeChartMonth),
        user?.id ? fetchUserParties() : Promise.resolve(),
      ]);
      return;
    }

    if (
      user?.role === "auditor" ||
      user?.role === "approver" ||
      user?.role === "billing"
    ) {
      await Promise.all([
        fetchDashboard(audYear, audMonth, category),
        fetchChartData(lineYear, activeChartYear, activeChartMonth),
      ]);
      return;
    }

    await Promise.all([
      fetchDashboard(),
      fetchChartData(lineYear, activeChartYear, activeChartMonth),
    ]);
  };

  const handlePullToRefresh = async () => {
    isRefreshing.current = true;
    setRefreshing(true);
    try {
      await refreshDashboardScreen();
    } finally {
      isRefreshing.current = false;
      setRefreshing(false);
    }
  };

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handlePullToRefresh}
      tintColor={COLORS.primary}
      colors={[COLORS.primary]}
    />
  );

  const loadTodayStatusCounts = async () => {
    try {
      // include_sap=true so SAP-created (completed) orders aren't filtered out;
      // otherwise the breakdown undercounts and Completed always shows 0.
      const orders = await productService.getOrders(0, undefined, false, false, true);
      const todayKey = new Date().toISOString().split("T")[0];
      const counts = { completed: 0, pending: 0, rejected: 0 };

      (Array.isArray(orders) ? orders : []).forEach((order) => {
        if (!String(order.created_at || "").startsWith(todayKey)) return;

        const statusText = normalizeText(
          `${order.status_display || ""} ${order.status_name || ""} ${order.status || ""}`,
        );

        // Drafts aren't part of the order flow — don't count them as pending.
        if (statusText.includes("draft")) return;

        if (statusText.includes("completed")) {
          counts.completed += 1;
        } else if (statusText.includes("rejected")) {
          counts.rejected += 1;
        } else {
          counts.pending += 1;
        }
      });

      setTodayStatusCounts(counts);
      setTodayModalVisible(true);
    } catch (error) {
      console.log("Today status counts fetch error:", error);
      setTodayStatusCounts({
        completed: 0,
        pending: 0,
        rejected: 0,
      });
      setTodayModalVisible(true);
    }
  };

  // 
  const stats = data
    ? [
      {
        title: "Revenue",
        value: `₹${Number(data.total_revenue).toLocaleString("en-IN")}`,
        icon: "cash",
        color: "#059669",
      },
      {
        title: "Today",
        value: String(data.today_orders),
        icon: "today",
        color: "#8B5CF6",
      },
      {
        title: "This Month",
        value: String(data.this_month_orders),
        icon: "calendar",
        color: "#0891B2",
      },
      {
        title: "Total Orders",
        value: String(data.total_orders),
        icon: "document-text",
        color: "#2563EB",
      },
    ]
    : [];



  // A party is identified by card_code AND category: the same card_code can be
  // assigned under multiple categories (e.g. OIL and BEVERAGES) and must count
  // as separate parties. This mirrors the backend, which keys assignments and
  // top_parties by (card_code, category).
  const partyKey = (cardCode: any, category: any) =>
    `${String(cardCode ?? '').trim()}||${String(category ?? '').trim().toUpperCase()}`;

  // Display category as Title Case (e.g. "OIL" -> "Oil", "BEVERAGES" -> "Beverages").
  const formatCategory = (category: any) => {
    const raw = String(category ?? '').trim();
    if (!raw || raw.toUpperCase() === 'UNKNOWN') return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  };

  const revenueByPartyCode = new Map<string, any>();
  (chartData?.top_parties || []).forEach((party: any) => {
    if (!party.card_code) return;
    const key = partyKey(party.card_code, party.category);
    const existing = revenueByPartyCode.get(key);
    revenueByPartyCode.set(key, {
      card_code: String(party.card_code),
      category: party.category ?? existing?.category,
      card_name: existing?.card_name || party.card_name || String(party.card_code),
      revenue: Number(existing?.revenue || 0) + Number(party.revenue || 0),
      count: Number(existing?.count || 0) + Number(party.count || 0),
    });
  });

  const uniquePartyMap = new Map<string, any>(
    Array.from(revenueByPartyCode.entries()).map(([key, party]) => [
      key,
      {
        card_code: party.card_code,
        card_name: party.card_name || party.card_code,
        category: party.category,
        revenue: Number(party.revenue || 0),
        count: Number(party.count || 0),
        // Parties sourced only from order revenue are not necessarily an active
        // assignment; they get marked active only if present in allAssignedParties.
        is_active: false,
      },
    ]),
  );

  allAssignedParties.forEach((party: any) => {
    if (!party.card_code) return;

    const key = partyKey(party.card_code, party.category);
    const revenueParty = uniquePartyMap.get(key);
    uniquePartyMap.set(key, {
      card_code: party.card_code,
      card_name: party.card_name || revenueParty?.card_name || party.card_code,
      category: party.category ?? revenueParty?.category,
      revenue: Number(revenueParty?.revenue || 0),
      count: Number(revenueParty?.count || 0),
      // The user-parties endpoint only returns active assignments.
      is_active: true,
    });
  });

  const uniqueParties = Array.from(uniquePartyMap.values());
  const activePartiesCount = uniqueParties.filter((party) => party.is_active).length;


  const sortedParties = [...uniqueParties].sort(
    (a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)
  );

  const displayedParties = sortedParties.slice(0, 5);
  const CHART_COLORS = ['#2563EB', '#8B5CF6', '#0891B2', '#059669', '#F59E0B', '#DC2626', '#EA580C', '#65A30D', '#0284C7', '#4F46E5'];
  const displayedRevenueParties = displayedParties.filter(
    (party) => Number(party.revenue || 0) > 0,
  );
  const selectedReportLabel =
    REPORT_OPTIONS.find((option) => option.value === selectedReport)?.label ||
    "All Reports";
  const overviewPeriodLabel =
    donutMonth === 0
      ? `${donutYear} year to date`
      : `${MONTH_FILTER_LABELS[donutMonth]} ${donutYear}`;

  const totalRevenue = Array.from(revenueByPartyCode.values()).reduce(
    (sum, p) => sum + Number(p.revenue || 0),
    0
  );

  const getOrderDateKey = (value?: string) => {
    if (!value) return "";
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0"),
    ].join("-");
  };

  const getAdminOrderStatusText = (order: OrderItemList) =>
    normalizeText(
      `${order.status_display || ""} ${order.status_name || ""} ${order.status || ""}`,
    );

  const isAdminCompletedOrder = (order: OrderItemList) =>
    getAdminOrderStatusText(order).includes("complete");

  const isAdminRejectedOrder = (order: OrderItemList) =>
    getAdminOrderStatusText(order).includes("reject");

  const isOrderInActiveChartPeriod = (order: OrderItemList) => {
    const dateKey = getOrderDateKey(order.created_at);
    if (!dateKey) return false;
    const yearKey = String(activeChartYear);
    if (!dateKey.startsWith(yearKey)) return false;
    if (activeChartMonth === 0) return true;
    return dateKey.startsWith(`${yearKey}-${String(activeChartMonth).padStart(2, "0")}`);
  };

  const formatOrderDate = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB");
  };

  // Fetch SAP doc num/entry for completed orders from the existing quotation-log
  // endpoint (batched), mirroring how the auditor/order-list screens resolve it.
  const loadOrdersModalSapInfo = async (orders: any[]) => {
    const completed = orders.filter((order) => isAdminCompletedOrder(order));
    if (completed.length === 0) {
      setOrdersModalSapInfo({});
      return;
    }

    const BATCH_SIZE = 5;
    for (let i = 0; i < completed.length; i += BATCH_SIZE) {
      const batch = completed.slice(i, i + BATCH_SIZE);
      const entries = await Promise.all(
        batch.map(async (order: any) => {
          // Use `||` so an empty-string sap_doc_number doesn't block the
          // quotation-log lookup below.
          let docNum = order.sap_doc_num || order.sap_doc_number || null;
          let docEntry = order.sap_doc_entry ?? null;
          if (docEntry == null) {
            try {
              const quotationLog = await orderService.getQuotationLog(order.id);
              docNum = docNum || quotationLog?.sap_doc_num || null;
              docEntry = quotationLog?.sap_doc_entry ?? null;
            } catch (error) {
              console.log(`Error loading quotation log for order ${order.id}:`, error);
            }
          }
          return [order.id, { sap_doc_num: docNum, sap_doc_entry: docEntry }] as const;
        }),
      );
      // Merge each batch as it resolves so chips appear progressively.
      setOrdersModalSapInfo((prev) => {
        const next = { ...prev };
        entries.forEach(([id, value]) => {
          next[id] = value;
        });
        return next;
      });
    }
  };

  const openAdminOrders = async (statusFilter?: "pending" | "approved" | "rejected") => {
    const statusLabel =
      statusFilter === "approved"
        ? "Completed Orders"
        : statusFilter === "rejected"
          ? "Rejected Orders"
          : statusFilter === "pending"
            ? "Pending Orders"
            : "All Orders";

    setOrdersModalTitle(statusLabel);
    setOrdersModalOrders([]);
    setOrdersModalSapInfo({});
    setOrdersModalVisible(true);
    setOrdersModalLoading(true);

    try {
      const orders = await productService.getOrders(0, undefined, false, false, true);
      const filteredOrders = (Array.isArray(orders) ? orders : [])
        .filter(isOrderInActiveChartPeriod)
        // Drafts aren't in the order flow yet — keep them out of this popup.
        .filter(
          (order) =>
            ![order.status_display, order.status_name, order.status].some(
              (value) => String(value || "").trim().toLowerCase() === "draft",
            ),
        )
        .filter((order) => {
          if (statusFilter === "approved") return isAdminCompletedOrder(order);
          if (statusFilter === "rejected") return isAdminRejectedOrder(order);
          if (statusFilter === "pending") {
            return !isAdminCompletedOrder(order) && !isAdminRejectedOrder(order);
          }
          return true;
        });

      setOrdersModalOrders(filteredOrders);
      loadOrdersModalSapInfo(filteredOrders);
    } catch (error) {
      console.log("Admin orders popup fetch error:", error);
      setOrdersModalOrders([]);
    } finally {
      setOrdersModalLoading(false);
    }
  };

  const renderAdminOrdersModal = () => (
    <Modal
      visible={ordersModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setOrdersModalVisible(false)}
    >
      <View style={styles.adminOrdersModalOverlay}>
        <View style={styles.adminOrdersModalCard}>
          <View style={styles.adminOrdersModalHeader}>
            <View style={styles.adminOrdersModalTitleWrap}>
              <View style={styles.adminOrdersModalTitleRow}>
                <Text style={styles.adminOrdersModalTitle}>{ordersModalTitle}</Text>
                {!ordersModalLoading && (
                  <View style={styles.adminOrdersModalCountBadge}>
                    <Text style={styles.adminOrdersModalCountText}>
                      {ordersModalOrders.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.adminOrdersModalSubtitle}>
                {activeChartMonth === 0
                  ? `${activeChartYear} year`
                  : `${MONTH_FILTER_LABELS[activeChartMonth]} ${activeChartYear}`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.adminOrdersModalClose}
              onPress={() => setOrdersModalVisible(false)}
            >
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {ordersModalLoading ? (
            <View style={styles.adminOrdersModalLoading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : ordersModalOrders.length > 0 ? (
            <ScrollView
              style={styles.adminOrdersModalScroll}
              showsVerticalScrollIndicator
            >
              {ordersModalOrders.map((order) => {
                // Whom the order is currently lying with, per its stage:
                // rate approval -> the pending approver(s); auditor -> the
                // auditor(s); billing -> the billing user(s). Computed by the
                // backend (`pending_with`); fall back to deriving the pending
                // rate approvers locally if that field is absent.
                const pendingWith: string[] = Array.isArray(
                  (order as any).pending_with,
                )
                  ? (order as any).pending_with.filter(Boolean)
                  : (Array.isArray((order as any).rate_approvals)
                      ? (order as any).rate_approvals
                      : []
                    )
                      .filter(
                        (a: any) =>
                          String(a?.status).toUpperCase() === "PENDING",
                      )
                      .map((a: any) => a?.approver_name)
                      .filter(Boolean);

                return (
                <View style={styles.adminOrderPopupCard} key={order.id}>
                  <View style={styles.adminOrderPopupTop}>
                    <View style={styles.adminOrderPopupTitleWrap}>
                      <Text style={styles.adminOrderPopupNumber} numberOfLines={1}>
                        {order.order_number}
                      </Text>
                      <Text style={styles.adminOrderPopupParty} numberOfLines={1}>
                        {order.card_name}
                      </Text>
                    </View>
                    <Text style={styles.adminOrderPopupAmount}>
                      Rs {Number(order.total_amount || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.adminOrderPopupMetaRow}>
                    <Text style={styles.adminOrderPopupMeta} numberOfLines={1}>
                      {order.status_display || order.status_name || order.status}
                    </Text>
                    <Text style={styles.adminOrderPopupMeta}>
                      {formatOrderDate(order.created_at)}
                    </Text>
                  </View>
                  {pendingWith.length > 0 && (
                    <View style={styles.adminOrderPopupPendingRow}>
                      <Text
                        style={styles.adminOrderPopupPendingText}
                        numberOfLines={2}
                      >
                        Pending with: {pendingWith.join(", ")}
                      </Text>
                    </View>
                  )}
                  {(() => {
                    const sap = ordersModalSapInfo[order.id];
                    const docEntry = sap?.sap_doc_entry ?? null;
                    const docNum = sap?.sap_doc_num || order.sap_doc_number || null;
                    if (docEntry == null && !docNum) return null;
                    return (
                      <View style={styles.adminOrderPopupSapWrap}>
                        {docEntry != null && (
                          <View style={styles.adminOrderPopupSapChip}>
                            <Ionicons name="document-attach-outline" size={13} color={COLORS.primary} />
                            <Text style={styles.adminOrderPopupSapChipText}>
                              SAP Entry: {docEntry}
                            </Text>
                          </View>
                        )}
                        {!!docNum && (
                          <View style={styles.adminOrderPopupSapChip}>
                            <Ionicons name="receipt-outline" size={13} color={COLORS.primary} />
                            <Text style={styles.adminOrderPopupSapChipText}>
                              SAP Num: {docNum}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  <TouchableOpacity
                    style={styles.adminOrderPopupDetailsBtn}
                    onPress={() => {
                      // Hide the modal so it doesn't cover Order Details, but flag it
                      // to re-open when we return to the dashboard.
                      reopenOrdersModalRef.current = true;
                      setOrdersModalVisible(false);
                      router.push({
                        pathname: "/orders/orderdetails",
                        params: { orderId: order.id, from: "dashboard" },
                      });
                    }}
                  >
                    <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.adminOrderPopupDetailsText}>View Details</Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.adminOrdersModalEmpty}>
              <Ionicons name="document-text-outline" size={32} color={COLORS.textSecondary} />
              <Text style={styles.adminOrdersModalEmptyText}>No orders found.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // PIE DATA
  const hasPartyRevenue = displayedRevenueParties.length > 0;
  const partyPieData = hasPartyRevenue
    ? displayedRevenueParties.map((party, index) => {
      const actualRevenue = Number(party.revenue || 0);
      return {
        value: actualRevenue,
        actualRevenue,
        color: CHART_COLORS[index % CHART_COLORS.length],
        text: party.card_name,
        onPress: () => setSelectedIndex(selectedIndex === index ? null : index),
      };
    })
    : [{
      value: 1,
      actualRevenue: 0,
      color: '#E2E8F0',
      text: 'No Revenue',
      onPress: () => setSelectedIndex(null),
    }];

  const managerPerformance = chartData?.manager_performance || [];
  const compactManagerPerformance = managerPerformance.slice(0, 1);
  const displayedManagerPerformance = compactManagerPerformance;
  const modalManagerPerformance =
    personModalMode === "TOP3"
      ? managerPerformance.slice(0, 3)
      : managerPerformance;
  const topManagerSales = Math.max(
    ...managerPerformance.map((manager) => Number(manager.sales || 0)),
    1,
  );
  const openPersonModal = (mode: "TOP3" | "ALL") => {
    setPersonModalMode(mode);
    setPersonModalVisible(true);
  };

  const renderPerformanceRows = (rows: typeof managerPerformance) =>
    rows.map((manager, index) => {
      const sales = Number(manager.sales || 0);
      const share = topManagerSales > 0 ? Math.round((sales / topManagerSales) * 100) : 0;

      return (
        <View
          key={`${manager.manager_id}-${manager.manager_name}-${index}`}
          style={[
            styles.performanceRow,
            index === rows.length - 1 && styles.performanceRowLast,
          ]}
        >
          <View style={styles.performanceTopRow}>
            <View style={styles.performancePerson}>
              <View style={styles.performanceRank}>
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.performanceName} numberOfLines={1}>
                {manager.manager_name}
              </Text>
            </View>
            {index === 0 ? (
              <View style={styles.performanceTopBadge}>
                <Text style={styles.performanceTopBadgeText}>Top 1</Text>
              </View>
            ) : null}
            <Text style={styles.performanceSales}>
              ₹{sales.toLocaleString("en-IN")}
            </Text>
          </View>

          <View style={styles.performanceMetaRow}>
            <Text style={styles.performanceMetaText}>
              {manager.orders} order{manager.orders === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={styles.performanceVisualRow}>
            <View style={styles.performanceVisualTrack}>
              <View
                style={[
                  styles.performanceVisualFill,
                  { width: `${Math.max(share, sales > 0 ? 8 : 0)}%` },
                ]}
              />
            </View>
            <Text style={styles.performanceVisualValue}>{share}%</Text>
          </View>
        </View>
      );
    });

  const renderPersonWisePerformance = () => (
    <View style={styles.performanceCard}>
      <View style={styles.performanceHeader}>
        <Text style={styles.performanceTitle}>Person Wise</Text>
        <View style={styles.performanceHeaderRight}>
          <View style={styles.performanceToggleRow}>
            <TouchableOpacity
              style={styles.performanceToggleBtn}
              onPress={() => openPersonModal("TOP3")}
            >
              <Text style={styles.performanceToggleText}>Top 3</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.performanceToggleBtn}
              onPress={() => openPersonModal("ALL")}
            >
              <Text style={styles.performanceToggleText}>All</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {displayedManagerPerformance.length > 0 ? (
        <>
          {managerPerformance.length > 0 ? (
            <View style={styles.performanceSpotlight}>
              {managerPerformance.slice(0, 3).map((manager, index) => {
                const sales = Number(manager.sales || 0);
                const share =
                  topManagerSales > 0 ? Math.round((sales / topManagerSales) * 100) : 0;
                const avgOrderValue =
                  Number(manager.orders || 0) > 0
                    ? sales / Number(manager.orders || 1)
                    : 0;

                return (
                  <View style={styles.performanceSpotlightItem} key={`${manager.manager_id}-spotlight`}>
                    <View style={styles.performanceSpotlightHeader}>
                      <View style={styles.performanceSpotlightRank}>
                        <Text style={styles.performanceSpotlightRankText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.performanceSpotlightName} numberOfLines={1}>
                        {manager.manager_name}
                      </Text>
                    </View>
                    <View style={styles.performanceSpotlightTrack}>
                      <View
                        style={[
                          styles.performanceSpotlightFill,
                          {
                            width: `${Math.max(share, sales > 0 ? 8 : 0)}%`,
                            backgroundColor:
                              index === 0
                                ? COLORS.primary
                                : index === 1
                                  ? "#0EA5E9"
                                  : "#F59E0B",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.performanceSpotlightSales}>
                      Rs {sales.toLocaleString("en-IN")}
                    </Text>
                    <View style={styles.performanceSpotlightMeta}>
                      <Text style={styles.performanceSpotlightMetaText}>
                        {manager.orders} orders
                      </Text>
                      <Text style={styles.performanceSpotlightMetaText}>
                        Avg Rs {Math.round(avgOrderValue).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

        </>
      ) : (
        <View style={styles.performanceEmpty}>
          <Ionicons name="people-outline" size={32} color={COLORS.textSecondary} />
          <Text style={styles.performanceEmptyText}>No performance data found.</Text>
        </View>
      )}

      <Modal
        visible={personModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPersonModalVisible(false)}
      >
        <View style={styles.personModalOverlay}>
          <View style={[styles.personModalContent, { width: screenWidth - 32 }]}>
            <View style={styles.personModalHeader}>
              <Text style={styles.personModalTitle}>Person Wise</Text>
              <TouchableOpacity
                onPress={() => setPersonModalVisible(false)}
                style={styles.personModalCloseBtn}
              >
                <Text style={styles.personModalCloseText}>x</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.personModalToggleRow}>
              {(["TOP3", "ALL"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.personModalToggleBtn,
                    personModalMode === mode && styles.personModalToggleActive,
                  ]}
                  onPress={() => setPersonModalMode(mode)}
                >
                  <Text
                    style={[
                      styles.personModalToggleText,
                      personModalMode === mode && styles.personModalToggleTextActive,
                    ]}
                  >
                    {mode === "TOP3" ? "Top 3" : "All"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator style={styles.personModalScroll}>
              {modalManagerPerformance.length > 0 ? (
                renderPerformanceRows(modalManagerPerformance)
              ) : (
                <View style={styles.performanceEmpty}>
                  <Ionicons name="people-outline" size={32} color={COLORS.textSecondary} />
                  <Text style={styles.performanceEmptyText}>No performance data found.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderSalesStatusSummary = () => {
    if (!data) return null;
    const completedOrderCount = Object.entries(data.status_counts || {}).reduce(
      (sum, [key, value]) =>
        normalizeText(key).includes("completed") ? sum + Number(value || 0) : sum,
      0,
    );
    const rejectedOrderCount = Object.entries(data.status_counts || {}).reduce(
      (sum, [key, value]) =>
        normalizeText(key).includes("rejected") ? sum + Number(value || 0) : sum,
      0,
    );
    const pendingOrderCount = Math.max(
      Number(data.total_orders || 0) - completedOrderCount - rejectedOrderCount,
      0,
    );

    const items = [
      {
        label: "Completed",
        value: Number(data.completed_revenue || 0),
        count: completedOrderCount,
        icon: "checkmark-done-outline",
        color: "#059669",
        backgroundColor: "#ECFDF5",
      },
      {
        label: "Pending",
        value: Number(data.pending_revenue || 0),
        count: pendingOrderCount,
        icon: "time-outline",
        color: "#D97706",
        backgroundColor: "#FFFBEB",
      },
      {
        label: "Rejected",
        value: Number(data.rejected_revenue || 0),
        count: rejectedOrderCount,
        icon: "close-circle-outline",
        color: "#DC2626",
        backgroundColor: "#FEF2F2",
      },
    ];

    return (
      <View style={styles.salesStatusSection}>
        <View style={styles.salesStatusHeader}>
          <Text style={styles.salesStatusTitle}>Order Sales</Text>
          <Text style={styles.salesStatusSubtext}>By current status</Text>
        </View>

        <View style={styles.salesStatusGrid}>
          {items.map((item, index) => {
            return (
              <View
                key={item.label}
                style={[
                  styles.salesStatusTile,
                  index === 0 && styles.salesStatusTileWide,
                ]}
              >
                <View style={[styles.salesStatusIcon, { backgroundColor: item.backgroundColor }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={styles.salesStatusLabel}>{item.label}</Text>
                <Text style={[styles.salesStatusValue, { color: item.color }]}>
                  ₹{item.value.toLocaleString("en-IN")}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCompletedVarietyOrders = () => {
    const metricOptions: { label: string; value: CompletedVarietyMetric }[] = [
      { label: "Items", value: "orders" },
      { label: "Qty", value: "qty" },
      { label: "Ltrs", value: "ltrs" },
    ];
    const metricLabel =
      metricOptions.find((option) => option.value === completedVarietyMetric)
        ?.label || "Orders";
    const formatMetricValue = (value: number) => {
      if (completedVarietyMetric === "orders") {
        return String(Math.round(value));
      }

      return Number.isInteger(value)
        ? String(value)
        : value.toFixed(2).replace(/\.?0+$/, "");
    };
    const maxMetricValue = Math.max(
      ...completedVarietyData.map((entry) => Number(entry[completedVarietyMetric] || 0)),
      1,
    );
    const displayRows = [...completedVarietyData].sort((a, b) => {
      const metricDiff =
        Number(b[completedVarietyMetric] || 0) -
        Number(a[completedVarietyMetric] || 0);
      return metricDiff || a.variety.localeCompare(b.variety);
    });

    const PREVIEW_COUNT = 3;
    const previewRows = displayRows.slice(0, PREVIEW_COUNT);
    const hasMore = displayRows.length > PREVIEW_COUNT;

    const renderVarietyRow = (entry: VarietyCompletedEntry, index: number, isLast: boolean) => {
      const metricValue = Number(entry[completedVarietyMetric] || 0);
      const share = Math.round((metricValue / maxMetricValue) * 100);

      return (
        <View
          key={`${entry.variety}-${index}`}
          style={[styles.varietyRow, isLast && styles.varietyRowLast]}
        >
          <View style={styles.varietyRowTop}>
            <Text style={styles.varietyName} numberOfLines={1}>
              {entry.variety}
            </Text>
            <Text style={styles.varietyOrderCount}>
              {formatMetricValue(metricValue)} {metricLabel}
            </Text>
          </View>
          <View style={styles.varietyTrack}>
            <View
              style={[
                styles.varietyFill,
                {
                  width: `${Math.max(share, metricValue > 0 ? 8 : 0)}%`,
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                },
              ]}
            />
          </View>
        </View>
      );
    };

    const renderMetricToggle = () => (
      <View style={styles.varietyMetricToggle}>
        {metricOptions.map((option) => {
          const isActive = completedVarietyMetric === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.varietyMetricBtn,
                isActive && styles.varietyMetricBtnActive,
              ]}
              onPress={() => setCompletedVarietyMetric(option.value)}
            >
              <Text
                style={[
                  styles.varietyMetricText,
                  isActive && styles.varietyMetricTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );

    return (
      <AnimatedCard style={styles.varietyCard}>
        <View style={styles.varietyHeader}>
          <View style={styles.varietyTitleWrap}>
            <Text style={styles.varietyTitle}> Variety Wise</Text>
            <Text style={styles.varietySubtitle}>
              {MONTH_FILTER_LABELS[activeChartMonth]} {activeChartYear}
            </Text>
          </View>
        </View>

        {renderMetricToggle()}

        {previewRows.length > 0 ? (
          <View style={styles.varietyList}>
            {previewRows.map((entry, index) =>
              renderVarietyRow(entry, index, !hasMore && index === previewRows.length - 1),
            )}
            {hasMore && (
              <TouchableOpacity
                style={styles.varietyViewAllBtn}
                onPress={() => setVarietyModalVisible(true)}
              >
                <Text style={styles.varietyViewAllText}>
                  View All ({displayRows.length})
                </Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.varietyEmpty}>
            <Ionicons name="cube-outline" size={28} color={COLORS.textSecondary} />
            <Text style={styles.varietyEmptyText}>
              No completed order varieties found.
            </Text>
          </View>
        )}

        <Modal
          visible={varietyModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setVarietyModalVisible(false)}
        >
          <View style={styles.varietyModalOverlay}>
            <View style={styles.varietyModalContent}>
              <View style={styles.varietyModalHeader}>
                <Text style={styles.varietyModalTitle}>Completed Items by Variety</Text>
                <TouchableOpacity
                  onPress={() => setVarietyModalVisible(false)}
                  style={styles.varietyModalCloseBtn}
                >
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              {renderMetricToggle()}
              <ScrollView showsVerticalScrollIndicator style={styles.varietyModalScroll}>
                {displayRows.map((entry, index) =>
                  renderVarietyRow(entry, index, index === displayRows.length - 1),
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </AnimatedCard>
    );
  };

  const renderRoleStats = () => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let total = 0;

    if (data || chartData) {
      const chartStatusCounts = (chartData?.status_distribution || []).reduce(
        (acc: Record<string, number>, status: any) => {
          const key = status.label || status.status || "";
          if (key) acc[key] = Number(status.count || 0);
          return acc;
        },
        {},
      );
      const useSelectedPeriodCounts = user?.role === "manager";
      const statusCounts = useSelectedPeriodCounts && Object.keys(chartStatusCounts).length > 0
        ? chartStatusCounts
        : data?.status_counts || {};
      const kpiStatusCounts = Object.entries(data?.status_counts || {}).reduce(
        (acc: Record<string, number>, [key, val]) => {
          acc[String(key).toLowerCase()] = Number(val || 0);
          return acc;
        },
        {},
      );
      const getCount = (matchFn: (key: string) => boolean) =>
        Object.entries(statusCounts).reduce((sum, [key, val]) => matchFn(key.toLowerCase()) ? sum + val : sum, 0);
      const getKpiCount = (matchFn: (key: string) => boolean) =>
        Object.entries(kpiStatusCounts).reduce((sum, [key, val]) => matchFn(key) ? sum + val : sum, 0);
      const selectedTotal = Object.values(statusCounts).reduce(
        (sum, val) => sum + Number(val || 0),
        0,
      );

      if (user?.role === "auditor") {
        pending = Number(data?.pending_review_orders ?? 0);
        approved = Number(data?.accepted_orders ?? 0);
        rejected = Math.max(
          Number(data?.rejected_orders ?? 0),
          getKpiCount(k => k === "rejected"),
        );
        total = Number(data?.total_orders ?? 0);
      } else if (user?.role === "billing") {
        pending = Number(
          data?.pending_review_orders
          ?? getKpiCount(k => k === "billing" || k === "billing pending" || k === "billing_pending"),
        );
        approved = Number(data?.accepted_orders ?? 0);
        rejected = Math.max(
          Number(data?.rejected_orders ?? 0),
          getKpiCount(k => k.includes("billing rejected") || k.includes("billing_rejected")),
        );
        total = Number(data?.total_orders ?? 0);
      } else if (user?.role === "approver") {
        pending = Number(data?.pending_review_orders ?? 0);
        approved = Number(data?.accepted_orders ?? 0);
        rejected = Number(data?.rejected_orders ?? 0);
        total = Number(data?.total_orders ?? 0);
      } else { // Manager and other roles
        rejected = getCount(k => k.includes("reject") || k.includes("cancel"));
        approved = getCount(k => k.includes("approved") || k.includes("completed") || k.includes("delivered") || k.includes("accepted"));
        total = useSelectedPeriodCounts ? selectedTotal : data?.total_orders ?? 0;
        pending = Math.max(total - approved - rejected, 0);
      }
    }
    const getScreenForRole = () => {
      if (user?.role === "approver") return "/approver/pending_approval";
      if (user?.role === "auditor") return "/orders/auditorapproval";
      if (user?.role === "billing") return "/orders/orderlist";
      if (user?.role === "manager") return "/orders/ordertracking";
      return "/orders/orderlist";
    };

    const cardYear = user?.role === "manager" ? mgrYear
      : (user?.role === "auditor" || user?.role === "approver" || user?.role === "billing") ? audYear
      : undefined;
    const cardMonth = user?.role === "manager" ? mgrMonth
      : (user?.role === "auditor" || user?.role === "approver" || user?.role === "billing") ? audMonth
      : undefined;

    const navigateTo = (tabParam: "pending" | "others", statusFilterParam?: "approved" | "rejected" | "pending") => {
      const screen = getScreenForRole();
      router.push({
        pathname: screen as any,
        params: {
          tab: tabParam,
          ...(statusFilterParam ? { statusFilter: statusFilterParam } : {}),
          ...(cardYear ? { year: String(cardYear) } : {}),
          ...(cardMonth ? { month: String(cardMonth) } : {}),
          _t: String(Date.now()),
        },
      });
    };

    const statsList = [
      { title: user?.role === "manager" ? "Total Orders" : "Total Assigned", value: total, icon: "document-text", color: "#2563EB", onPress: user?.role === "manager" ? () => navigateTo("others") : undefined },
      { title: "Pending", value: pending, icon: "time", color: "#F59E0B", onPress: () => navigateTo("pending", "pending") },
      { title: "Approved", value: approved, icon: "checkmark-circle", color: "#10B981", onPress: () => navigateTo("others", "approved") },
      { title: "Rejected", value: rejected, icon: "close-circle", color: "#EF4444", onPress: () => navigateTo("others", "rejected") },
    ];

    return (
      <View style={[styles.statsGrid, styles.statsGridWrap, { marginTop: SPACING.xs, paddingHorizontal: 0 }]}>
        {statsList.map((stat, index) => (
          <AnimatedCard
            key={index}
            onPress={stat.onPress}
            style={[
              styles.statCard,
              styles.statCardHalf,
              { borderColor: `${stat.color}55` },
            ]}
          >
            <LinearGradient
              colors={[`${stat.color}12`, COLORS.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGradient}
            >
              <View style={styles.statTopRow}>
                <View
                  style={[
                    styles.statIcon,
                    {
                      backgroundColor: `${stat.color}18`,
                      borderColor: `${stat.color}24`,
                    },
                  ]}
                >
                  <Ionicons name={stat.icon as any} size={20} color={stat.color} />
                </View>
                <View style={[styles.statAccent, { backgroundColor: stat.color }]} />
              </View>
              <View style={styles.statTextBlock}>
                <AnimatedNumber value={String(stat.value)} style={styles.statValue} />
                <Text style={styles.statTitle}>{stat.title}</Text>
              </View>
            </LinearGradient>
          </AnimatedCard>
        ))}
      </View>
    );
  };

  if (user?.role === "manager") {
    return (
      <StateWrapper loading={loading || chartLoading} error={error} onRetry={handleRetry}>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || user?.username}!</Text>
            <Text style={styles.welcomeSubtext}>
              Here is what is happening with your orders today.
            </Text>
          </LinearGradient>

          {/* Analytics Section */}
          <View style={styles.analyticsHeader}>
            <Text style={[styles.sectionTitle, styles.analyticsTitle]}>Analytics</Text>
          </View>
          <View style={styles.analyticsControlsSection}>

            <MonthPicker
              year={mgrYear}
              month={mgrMonth}
              onChangeYear={setMgrYear}
              onChangeMonth={setMgrMonth}
            />
            {renderRoleStats()}
          </View>

          <View style={styles.revenueTrendSection}>
            <View style={styles.lineChartHeader}>
              <Text style={styles.chartSectionLabel}>Monthly Sales</Text>

              <Dropdown
                data={YEAR_OPTIONS}
                labelField="label"
                valueField="value"
                value={lineYear}
                onChange={(item) => setLineYear(item.value)}
                style={styles.yearDropdown}
                selectedTextStyle={styles.yearDropdownText}
              />
            </View>

            {chartData && (
              <SalesLineChart data={chartData.monthly_sales || []} />
            )}
          </View>

          {/* My Parties Section */}
          <View style={styles.section}>
            <View style={styles.partyHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sectionTitle}>My Parties</Text>
                {/* <View style={styles.badge}>
 <Text style={styles.badgeText}>{topParties.length}</Text>
 </View> */}
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activePartiesCount}</Text>
                </View>
              </View>

              <View style={[styles.toggleBtn, styles.toggleBtnActive]}>
                <Text style={[styles.toggleText, styles.toggleTextActive]}>Top 5</Text>
              </View>
            </View>

            <View style={styles.partyChartCard}>

              <View style={{ width: 150, alignItems: 'center' }}>
                <PieChart
                  data={partyPieData}
                  donut
                  radius={65}
                  innerRadius={45}
                  centerLabelComponent={() => {
                    const revenue =
                      selectedIndex !== null && partyPieData[selectedIndex] && hasPartyRevenue
                        ? partyPieData[selectedIndex]?.actualRevenue
                        : totalRevenue;

                    const label =
                      selectedIndex !== null && partyPieData[selectedIndex] && hasPartyRevenue
                        ? partyPieData[selectedIndex]?.text.split(" (")[0]
                        : "Total Revenue";

                    return (
                      <View style={{ alignItems: "center", justifyContent: "center", width: 78 }}>
                        <Text style={{ fontSize: 13, fontWeight: "bold", textAlign: "center", color: COLORS.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                          ₹{Number(revenue).toLocaleString("en-IN")}
                        </Text>
                        <Text style={{ fontSize: 9, color: COLORS.textSecondary, textAlign: "center", marginTop: 2, lineHeight: 12 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {label}
                        </Text>
                      </View>
                    );
                  }}
                />
              </View>

              <ScrollView style={styles.partyLegendContainer} nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                {displayedParties.length > 0 ? displayedParties.map((party, index) => (
                  <View key={index} style={[styles.partyLegendItem, { marginBottom: 8 }]}>
                    <View
                      style={[
                        styles.partyDot,
                        {
                          backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                        },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.partyLegendText} numberOfLines={2}>
                        {party.card_name} (₹{Number(party.revenue || 0).toLocaleString("en-IN")})
                      </Text>
                      {formatCategory(party.category) ? (
                        <View style={styles.partyCategoryChip}>
                          <Text style={styles.partyCategoryChipText}>
                            {formatCategory(party.category)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )) : (
                  <Text style={styles.partyLegendText}>No parties found.</Text>
                )}
              </ScrollView>
            </View>
          </View>



        </ScrollView>
      </StateWrapper>
    );
  }
  else if (user?.role === "auditor") {
    return (
      <StateWrapper loading={loading || chartLoading} error={error} onRetry={handleRetry}>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >

          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>
              {user?.name || user?.username}!
            </Text>

            <Text style={styles.welcomeSubtext}>
              Review pending orders, approve or reject them, and track your monthly activity.
            </Text>
          </LinearGradient>

          {/* Analytics Section */}
          <View style={styles.roleActivityHeader}>
            <Text style={[styles.sectionTitle, styles.roleActivityTitle]}>
              Your Activity
            </Text>
          </View>

          <View style={styles.roleActivityControls}>
            <MonthPicker
              year={audYear}
              month={audMonth}
              onChangeYear={setAudYear}
              onChangeMonth={setaudMonth}
            />
            {renderRoleStats()}
          </View>




        </ScrollView>
      </StateWrapper>
    );
  }
  else if (user?.role === "approver") {
    return (
      <StateWrapper loading={loading || chartLoading} error={error} onRetry={handleRetry}>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >

          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>
              {user?.name || user?.username}!
            </Text>

            <Text style={styles.welcomeSubtext}>
              Review pending orders, approve or reject them, and track your monthly activity.
            </Text>
          </LinearGradient>

          {/* Analytics Section */}
          <View style={styles.roleActivityHeader}>
            <Text style={[styles.sectionTitle, styles.roleActivityTitle]}>
              Your Activity
            </Text>
          </View>

          <View style={styles.roleActivityControls}>
            <MonthPicker
              year={audYear}
              month={audMonth}
              onChangeYear={setAudYear}
              onChangeMonth={setaudMonth}
            />
            {renderRoleStats()}
          </View>


        </ScrollView>
      </StateWrapper>
    );
  }
  else if (user?.role === "billing") {
    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
    const displayName = user?.name || user?.username || "User";
    const initial = displayName.charAt(0).toUpperCase();
    const roleLabel = user?.role
      ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)} Executive`
      : "Member";
    const memberSinceDate = user?.created_at ? new Date(user.created_at) : null;
    const memberSince =
      memberSinceDate && !Number.isNaN(memberSinceDate.getTime())
        ? memberSinceDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "—";

    const bTotal = Number(data?.total_orders ?? 0);
    const bPending = Number(data?.pending_review_orders ?? 0);
    const bApproved = Number(data?.accepted_orders ?? 0);
    const bRejected = Number(data?.rejected_orders ?? 0);
    const approvalRate =
      bApproved + bRejected > 0
        ? Math.round((bApproved / (bApproved + bRejected)) * 100)
        : bApproved > 0
          ? 100
          : 0;
    const avgOrderValue =
      bTotal > 0 ? Math.round(Number(data?.total_revenue ?? 0) / bTotal) : 0;

    const goOrders = (
      statusFilter?: "approved" | "rejected" | "pending",
      tab: "pending" | "others" = "others",
    ) =>
      router.push({
        pathname: "/orders/orderlist" as any,
        params: {
          tab,
          ...(statusFilter ? { statusFilter } : {}),
          year: String(audYear),
          month: String(audMonth),
          _t: String(Date.now()),
        },
      });

    const activityCards = [
      { title: "Total Assigned", value: bTotal, icon: "document-text", color: "#2563EB", bg: "#EEF4FF", onPress: () => goOrders() },
      { title: "Pending", value: bPending, icon: "time", color: "#F59E0B", bg: "#FFF7EC", onPress: () => goOrders("pending", "pending") },
      { title: "Approved", value: bApproved, icon: "checkmark-circle", color: "#16A34A", bg: "#ECFDF3", onPress: () => goOrders("approved") },
      { title: "Rejected", value: bRejected, icon: "close-circle", color: "#EF4444", bg: "#FEF2F2", onPress: () => goOrders("rejected") },
    ];

    return (
      <StateWrapper loading={loading || chartLoading} error={error} onRetry={handleRetry}>
       <View style={bStyles.screen}>
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* ===== Hero ===== */}
          <LinearGradient
            colors={["#2563EB", "#1E3A8A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={bStyles.hero}
          >
            <View style={bStyles.heroDecor} />
            <View style={bStyles.heroTopRow}>
              <View style={bStyles.heroAvatar}>
                <Text style={bStyles.heroAvatarText}>{initial}</Text>
                <View style={bStyles.heroAvatarDot} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={bStyles.heroGreeting}>{greeting},</Text>
                <Text style={bStyles.heroName} numberOfLines={1}>
                  {displayName}! 👋
                </Text>
                <View style={bStyles.heroChip}>
                  <Text style={bStyles.heroChipText}>{roleLabel}</Text>
                </View>
                {!!user?.company?.name && (
                  <View style={[bStyles.heroChip, bStyles.heroChipCompany]}>
                    <Ionicons name="business" size={12} color="#fff" />
                    <Text style={bStyles.heroChipText}>{user.company.name}</Text>
                  </View>
                )}
              </View>
              <View style={bStyles.heroIllustration}>
                <Ionicons name="clipboard" size={52} color="rgba(255,255,255,0.92)" />
                <View style={bStyles.heroIllustrationBadge}>
                  <Ionicons name="checkmark" size={13} color="#16A34A" />
                </View>
              </View>
            </View>

            <View style={bStyles.heroStatsRow}>
              <View style={bStyles.heroStat}>
                <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.85)" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={bStyles.heroStatLabel}>Member Since</Text>
                  <Text style={bStyles.heroStatValue}>{memberSince}</Text>
                </View>
              </View>
              <View style={bStyles.heroStatDivider} />
              <View style={bStyles.heroStat}>
                <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.85)" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={bStyles.heroStatLabel}>Total Orders</Text>
                  <Text style={bStyles.heroStatValue}>{bTotal}</Text>
                </View>
              </View>
              <View style={bStyles.heroStatDivider} />
              <View style={bStyles.heroStat}>
                <Ionicons name="ribbon-outline" size={16} color="rgba(255,255,255,0.85)" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={bStyles.heroStatLabel}>Approval Rate</Text>
                  <Text style={bStyles.heroStatValue}>{approvalRate}%</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* ===== Your Activity ===== */}
          <View style={bStyles.sectionHeaderRow}>
            <Text style={bStyles.sectionTitle}>Your Activity</Text>
            <MonthPicker
              year={audYear}
              month={audMonth}
              onChangeYear={setAudYear}
              onChangeMonth={setaudMonth}
            />
          </View>

          <View style={bStyles.activityGrid}>
            {activityCards.map((c) => (
              <TouchableOpacity
                key={c.title}
                activeOpacity={0.85}
                onPress={c.onPress}
                style={[bStyles.activityCard, { backgroundColor: c.bg, borderColor: `${c.color}22` }]}
              >
                <View style={[bStyles.activityIcon, { backgroundColor: `${c.color}1F` }]}>
                  <Ionicons name={c.icon as any} size={20} color={c.color} />
                </View>
                <Text style={bStyles.activityValue}>{c.value}</Text>
                <Text style={bStyles.activityLabel}>{c.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ===== Insights ===== */}
          <View style={bStyles.card}>
            <View style={bStyles.cardHeaderRow}>
              <Text style={bStyles.cardTitle}>Insights</Text>
              <TouchableOpacity
                style={bStyles.linkRow}
                onPress={() => router.push("/reports/daily-report" as any)}
              >
                <Text style={bStyles.linkText}>View full report</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <View style={bStyles.insightsRow}>
              <View style={bStyles.insightBox}>
                <Text style={bStyles.insightLabel}>Approval Rate</Text>
                <View style={bStyles.insightBody}>
                  <Text style={bStyles.insightValue}>{approvalRate}%</Text>
                  <PieChart
                    donut
                    radius={30}
                    innerRadius={20}
                    innerCircleColor="#fff"
                    data={[
                      { value: Math.max(approvalRate, 0.001), color: "#16A34A" },
                      { value: Math.max(100 - approvalRate, 0.001), color: "#E5E7EB" },
                    ]}
                    centerLabelComponent={() => (
                      <Ionicons name="checkmark" size={16} color="#16A34A" />
                    )}
                  />
                </View>
              </View>
              <View style={bStyles.insightBox}>
                <Text style={bStyles.insightLabel}>Avg. Order Value</Text>
                <View style={bStyles.insightBody}>
                  <Text style={bStyles.insightValue}>
                    ₹{avgOrderValue.toLocaleString("en-IN")}
                  </Text>
                  <View style={bStyles.sparkline}>
                    {[7, 11, 8, 13, 10, 15, 12, 17].map((h, i) => (
                      <View key={i} style={[bStyles.sparkBar, { height: h }]} />
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ===== Recent Orders ===== */}
          <View style={bStyles.card}>
            <View style={bStyles.cardHeaderRow}>
              <Text style={bStyles.cardTitle}>Recent Orders</Text>
              <TouchableOpacity style={bStyles.linkRow} onPress={() => goOrders()}>
                <Text style={bStyles.linkText}>View all</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            {recentOrders.length === 0 ? (
              <Text style={bStyles.emptyText}>No recent orders</Text>
            ) : (
              recentOrders.map((o, i) => {
                const s = `${o.status_display || o.status_name || o.status || ""}`.toLowerCase();
                const pill = s.includes("reject")
                  ? { label: "Rejected", color: "#DC2626", bg: "#FEF2F2", icon: "close-circle-outline" }
                  : s.includes("approv") || s.includes("complete") || s.includes("accept")
                    ? { label: "Approved", color: "#16A34A", bg: "#ECFDF3", icon: "checkmark-circle-outline" }
                    : { label: "Pending Approval", color: "#EA8C00", bg: "#FFF7ED", icon: "time-outline" };
                return (
                  <TouchableOpacity
                    key={o.id}
                    activeOpacity={0.8}
                    style={[bStyles.recentRow, i > 0 && bStyles.recentRowBordered]}
                    onPress={() =>
                      router.push({
                        pathname: "/orders/orderdetails",
                        params: { orderId: o.id, from: "dashboard" },
                      })
                    }
                  >
                    <View style={bStyles.recentIcon}>
                      <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
                    </View>
                    <View style={bStyles.recentTextWrap}>
                      <Text style={bStyles.recentNumber} numberOfLines={1}>
                        {o.order_number}
                      </Text>
                      <Text style={bStyles.recentParty} numberOfLines={1}>
                        {o.card_name}
                      </Text>
                    </View>
                    <View style={[bStyles.recentPill, { backgroundColor: pill.bg }]}>
                      <Ionicons name={pill.icon as any} size={12} color={pill.color} />
                      <Text style={[bStyles.recentPillText, { color: pill.color }]} numberOfLines={1}>
                        {pill.label}
                      </Text>
                    </View>
                    <Text style={bStyles.recentAmount}>
                      ₹{Number(o.total_amount || 0).toLocaleString("en-IN")}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* ===== Bottom navigation ===== */}
        <View style={[bStyles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={bStyles.tabItem} activeOpacity={0.7} onPress={() => {}}>
            <Ionicons name="home" size={22} color={COLORS.primary} />
            <Text style={[bStyles.tabLabel, { color: COLORS.primary }]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={bStyles.tabItem} activeOpacity={0.7} onPress={() => goOrders()}>
            <View>
              <Ionicons name="clipboard-outline" size={22} color="#64748B" />
              {bTotal > 0 && (
                <View style={bStyles.tabBadge}>
                  <Text style={bStyles.tabBadgeText}>{bTotal > 99 ? "99+" : bTotal}</Text>
                </View>
              )}
            </View>
            <Text style={bStyles.tabLabel}>Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={bStyles.tabItem}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/orders/create",
                params: { openMode: "create", openedAt: String(Date.now()) },
              })
            }
          >
            <View style={bStyles.fab}>
              <Ionicons name="add" size={28} color="#fff" />
            </View>
            <Text style={bStyles.tabLabel}>Create</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={bStyles.tabItem}
            activeOpacity={0.7}
            onPress={() => router.push("/orders/drafts" as any)}
          >
            <Ionicons name="document-text-outline" size={22} color="#7C3AED" />
            <Text style={bStyles.tabLabel}>Drafts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={bStyles.tabItem}
            activeOpacity={0.7}
            onPress={() => router.push("/reports/daily-report" as any)}
          >
            <Ionicons name="bar-chart-outline" size={22} color="#F59E0B" />
            <Text style={bStyles.tabLabel}>Reports</Text>
          </TouchableOpacity>
        </View>
       </View>
      </StateWrapper>
    );
  }
  else {
    return (

      <StateWrapper
        loading={loading || chartLoading}
        error={error}
        onRetry={handleRetry}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || user?.username}!</Text>
            <Text style={styles.welcomeSubtext}>
              Here is what is happening with your orders today.
            </Text>
          </LinearGradient>

          {/* Analytics Section */}
          <View style={[styles.analyticsSection, styles.adminAnalyticsSection]}>
            <Text style={styles.sectionTitle}>Analytics</Text>
          </View>

          <View style={styles.adminStatsGrid}>
            {[stats.slice(0, 2), stats.slice(2, 4)].map((row, rowIndex) => (
              <View style={styles.adminStatsRow} key={`admin-stats-row-${rowIndex}`}>
                {row.map((stat, index) => (
                  <AnimatedCard
                    key={stat.title}
                    style={[styles.statCard, { borderColor: `${stat.color}55` }]}
                    onPress={() => {
                      if (stat.title === "Revenue") {
                        setRevenueModalVisible(true);
                      } else if (stat.title === "Today") {
                        loadTodayStatusCounts();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={[`${stat.color}12`, COLORS.surface]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.statGradient}
                    >
                      <View style={styles.statTopRow}>
                        <View
                          style={[
                            styles.statIcon,
                            {
                              backgroundColor: `${stat.color}18`,
                              borderColor: `${stat.color}24`,
                            },
                          ]}
                        >
                          <Ionicons
                            name={stat.icon as any}
                            size={20}
                            color={stat.color}
                          />
                        </View>
                        <View style={[styles.statAccent, { backgroundColor: stat.color }]} />
                      </View>
                      <View style={styles.statTextBlock}>
                        <AnimatedNumber value={stat.value} style={styles.statValue} />
                        <Text style={styles.statTitle}>{stat.title}</Text>
                      </View>
                    </LinearGradient>
                  </AnimatedCard>
                ))}
              </View>
            ))}
          </View>

          <Modal
            visible={revenueModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setRevenueModalVisible(false)}
          >
            <View style={styles.revenueModalOverlay}>
              <View style={styles.revenueModalCard}>
                <TouchableOpacity
                  style={styles.revenueModalClose}
                  onPress={() => setRevenueModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <View style={styles.revenueModalIcon}>
                  <Ionicons name="cash" size={26} color="#059669" />
                </View>
                <Text style={styles.revenueModalTitle}>Revenue</Text>
                <Text style={styles.revenueModalTotal}>
                  ₹{Number(data?.total_revenue || 0).toLocaleString("en-IN")}
                </Text>

                <View style={styles.revenueBreakdownCard}>
                  {[
                    {
                      label: "Completed Order Sales",
                      value: Number(data?.completed_revenue || 0),
                      count: Object.entries(data?.status_counts || {}).reduce(
                        (sum, [key, value]) =>
                          normalizeText(key).includes("completed")
                            ? sum + Number(value || 0)
                            : sum,
                        0,
                      ),
                    },
                    {
                      label: "Pending Order Sales",
                      value: Number(data?.pending_revenue || 0),
                      count: Math.max(
                        Number(data?.total_orders || 0) -
                        Object.entries(data?.status_counts || {}).reduce(
                          (sum, [key, value]) =>
                            normalizeText(key).includes("completed") ||
                            normalizeText(key).includes("rejected")
                              ? sum + Number(value || 0)
                              : sum,
                          0,
                        ),
                        0,
                      ),
                    },
                    {
                      label: "Rejected Order Sales",
                      value: Number(data?.rejected_revenue || 0),
                      count: Object.entries(data?.status_counts || {}).reduce(
                        (sum, [key, value]) =>
                          normalizeText(key).includes("rejected")
                            ? sum + Number(value || 0)
                            : sum,
                        0,
                      ),
                    },
                  ].map((item) => (
                    <View style={styles.revenueBreakdownRow} key={item.label}>
                      <View style={styles.revenueBreakdownTextWrap}>
                        <Text style={styles.revenueBreakdownLabel}>{item.label}</Text>
                        <Text style={styles.revenueBreakdownCount}>
                          {item.count} order{item.count === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Text style={styles.revenueBreakdownValue}>
                        ₹{item.value.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={todayModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setTodayModalVisible(false)}
          >
            <View style={styles.revenueModalOverlay}>
              <View style={styles.revenueModalCard}>
                <TouchableOpacity
                  style={styles.revenueModalClose}
                  onPress={() => setTodayModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <View style={styles.revenueModalIcon}>
                  <Ionicons name="today" size={26} color={COLORS.primary} />
                </View>
                <Text style={styles.revenueModalTitle}>Today Orders</Text>
                <Text style={styles.revenueModalTotal}>
                  {Number(data?.today_orders || 0).toLocaleString("en-IN")}
                </Text>

                <View style={styles.revenueBreakdownCard}>
                  {[
                    { label: "Completed", count: todayStatusCounts.completed },
                    { label: "Pending", count: todayStatusCounts.pending },
                    { label: "Rejected", count: todayStatusCounts.rejected },
                  ].map((item) => (
                    <View style={styles.revenueBreakdownRow} key={item.label}>
                      <Text style={styles.revenueBreakdownLabel}>{item.label}</Text>
                      <Text style={styles.revenueBreakdownValue}>
                        {item.count} order{item.count === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Modal>

          {renderAdminOrdersModal()}

          {chartData ? (
            <View style={styles.chartsContainer}>
              {/* Line chart with its own year picker */}
              <View style={styles.lineChartHeader}>
                <Text style={styles.chartSectionLabel}>Revenue Trend</Text>
                <Dropdown
                  data={YEAR_OPTIONS}
                  labelField="label"
                  valueField="value"
                  value={lineYear}
                  onChange={(item) => setLineYear(item.value)}
                  style={styles.yearDropdown}
                  selectedTextStyle={styles.yearDropdownText}
                />
              </View>
              <SalesLineChart data={chartData.monthly_sales} />

              {/* Donut charts with their own month+year filter */}
              <View style={styles.overviewPanel}>
                <View style={styles.overviewHeaderRow}>
                  <View style={styles.overviewIcon}>
                    <Ionicons name="options-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.overviewHeaderTextWrap}>
                    <Text style={styles.chartSectionLabel}>Overview</Text>
                    <Text style={styles.overviewFilterSummary} numberOfLines={1}>
                      {overviewPeriodLabel} • {selectedReportLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.inlineFilterPanel}>
                  <MonthPicker
                    year={donutYear}
                    month={donutMonth}
                    onChangeYear={setDonutYear}
                    onChangeMonth={setDonutMonth}
                  />

                  <View style={styles.reportFilterRow}>
                    <Text style={styles.reportFilterLabel}>Report</Text>
                    <Dropdown
                      data={REPORT_OPTIONS}
                      labelField="label"
                      valueField="value"
                      value={selectedReport}
                      onChange={(item) => setSelectedReport(item.value)}
                      style={styles.reportDropdown}
                      selectedTextStyle={styles.reportDropdownText}
                      placeholderStyle={styles.reportDropdownPlaceholder}
                      placeholder="Select report"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.chartsGrid}>
                {(selectedReport === "ALL" || selectedReport === "STATUS") && (
                  <StatusPieChart
                    data={chartData?.status_distribution || []}
                    showAllStatus={selectedReport === "STATUS"}
                    onTotalPress={() => openAdminOrders()}
                    onStatusPress={(status) => {
                      if (status === "Completed") {
                        openAdminOrders("approved");
                      } else if (status === "Rejected") {
                        openAdminOrders("rejected");
                      } else {
                        openAdminOrders("pending");
                      }
                    }}
                  />
                )}
                {(selectedReport === "ALL" || selectedReport === "CATEGORY") && (
                  <CategorySalesChart
                    data={chartData.category_sales}
                    showBarGraph={selectedReport === "CATEGORY"}
                  />
                )}
                {(selectedReport === "ALL" || selectedReport === "TOP_PARTIES") && (
                  <TopPartiesChart data={completedTopParties} />
                )}
                {(selectedReport === "ALL" || selectedReport === "STATEWISE") && (
                  <StatewiseBarChart data={chartData.statewise_orders} />
                )}
                {(selectedReport === "ALL" || selectedReport === "PERSON_PERFORMANCE") &&
                  renderPersonWisePerformance()}
                {(selectedReport === "ALL" || selectedReport === "COMPLETED_VARIETY") &&
                  renderCompletedVarietyOrders()}
              </View>
            </View>
          ) : null}

          {/* <View style={styles.section}>
 <Text style={styles.sectionTitle}>Quick Actions</Text>
 <View style={styles.actionsRow}>
 <Surface style={styles.actionCard}>
 <Ionicons name="add-circle" size={28} color={COLORS.primary} />
 <Text style={styles.actionText}>New Order</Text>
 </Surface>
 <Surface style={styles.actionCard}>
 <Ionicons name="search" size={28} color={COLORS.primary} />
 <Text style={styles.actionText}>Search</Text>
 </Surface>
 <Surface style={styles.actionCard}>
 <Ionicons name="stats-chart" size={28} color={COLORS.primary} />
 <Text style={styles.actionText}>Reports</Text>
 </Surface>
 </View>
 </View> */}
        </ScrollView>
      </StateWrapper>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  welcomeCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    minHeight: 134,
    borderRadius: RADIUS.lg,
    position: "relative",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  welcomeText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
  },
  userName: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.textLight,
    marginTop: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  statsGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  adminStatsGrid: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  adminStatsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    minHeight: 92,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
    overflow: "hidden",
  },
  statCardHalf: {
    flex: 0,
    width: "48.5%",
  },
  statGradient: {
    flex: 1,
    width: "100%",
    padding: 12,
    justifyContent: "space-between",
  },
  statTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statAccent: {
    width: 24,
    height: 4,
    borderRadius: RADIUS.full,
    marginTop: 4,
  },
  statTextBlock: {
    alignItems: "flex-start",
    marginTop: 12,
    width: "100%",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: 0,
    lineHeight: 22,
  },
  statTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.textSecondary,
    marginTop: 3,
    textAlign: "left",
    letterSpacing: 0,
  },
  chartsContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  revenueTrendSection: {
    paddingHorizontal: SPACING.md,
    marginTop: 0,
  },
  lineChartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  chartSectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  yearDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 100,
  },
  yearDropdownText: {
    fontSize: 15,
    color: COLORS.text,
  },
  donutFilterRow: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  overviewPanel: {
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  overviewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  overviewIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  overviewHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  overviewFilterSummary: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  inlineFilterPanel: {
    marginTop: 0,
    marginBottom: 0,
    gap: SPACING.xs,
  },
  reportFilterRow: {
    marginBottom: 0,
  },
  reportFilterLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  reportDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reportDropdownText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  reportDropdownPlaceholder: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  chartsGrid: {
    gap: SPACING.sm,
  },
  chartsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  chartsRowWrap: {
    flexDirection: "column",
  },
  varietyCard: {
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  varietyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  varietyTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  varietyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  varietySubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  varietyMetricToggle: {
    flexDirection: "row",
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  varietyMetricBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
  },
  varietyMetricBtnActive: {
    backgroundColor: COLORS.primary,
  },
  varietyMetricText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  varietyMetricTextActive: {
    color: COLORS.textLight,
  },
  varietyList: {
    gap: 0,
  },
  varietyRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  varietyRowLast: {
    borderBottomWidth: 0,
  },
  varietyRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: 6,
  },
  varietyName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  varietyOrderCount: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  varietyTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
    overflow: "hidden",
  },
  varietyFill: {
    height: "100%",
    borderRadius: 4,
  },
  varietyEmpty: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  varietyEmptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  varietyViewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 4,
  },
  varietyViewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  varietyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  varietyModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    width: "90%",
    maxHeight: "80%",
  },
  varietyModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  varietyModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  varietyModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  varietyModalScroll: {
    flexGrow: 0,
  },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  roleActivityHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  roleActivityTitle: {
    marginBottom: 0,
  },
  roleActivityControls: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  analyticsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  adminAnalyticsSection: {
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  analyticsTitle: {
    marginBottom: 0,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    elevation: 2,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  revenueModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  revenueModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    position: "relative",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  revenueModalClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  revenueModalIcon: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  revenueModalTitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  revenueModalTotal: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  revenueBreakdownCard: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
  },
  revenueBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  revenueBreakdownLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    paddingRight: SPACING.sm,
  },
  revenueBreakdownTextWrap: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  revenueBreakdownCount: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  revenueBreakdownValue: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },
  adminOrdersModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.md,
  },
  adminOrdersModalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "82%",
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: SPACING.md,
  },
  adminOrdersModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  adminOrdersModalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  adminOrdersModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  adminOrdersModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  adminOrdersModalCountBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  adminOrdersModalCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  adminOrdersModalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  adminOrdersModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  adminOrdersModalLoading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  adminOrdersModalScroll: {
    flexGrow: 0,
  },
  adminOrderPopupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  adminOrderPopupTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  adminOrderPopupTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  adminOrderPopupNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },
  adminOrderPopupParty: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  adminOrderPopupAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
  },
  adminOrderPopupMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  adminOrderPopupMeta: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  adminOrderPopupPendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  adminOrderPopupPendingText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  adminOrderPopupSapWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  adminOrderPopupSapChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLighter,
  },
  adminOrderPopupSapChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  adminOrderPopupDetailsBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: SPACING.sm,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLighter,
  },
  adminOrderPopupDetailsText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
  adminOrdersModalEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  adminOrdersModalEmptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  salesStatusSection: {
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  salesStatusHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  salesStatusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  salesStatusSubtext: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  salesStatusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  salesStatusTile: {
    flex: 1,
    minWidth: 130,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    elevation: 2,
  },
  salesStatusTileWide: {
    flexBasis: "100%",
  },
  salesStatusIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  salesStatusLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  salesStatusValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  partyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  seeAllText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  badge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  partyGrid: {
    gap: 10,
  },
  partyCardWrapper: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#F1F5F9', // Subtle Border
    overflow: 'hidden', // Important for ripple effect
  },
  partyPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  partyIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  partyTextContainer: {
    flex: 1,
  },
  partyMainName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  partySubName: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  partyChartCard: {
    backgroundColor: "#F8FBFF",
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: 'column',
    alignItems: 'center',
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  partyLegendContainer: {
    width: '100%',
    marginTop: SPACING.md,
    maxHeight: 190,
  },
  partyLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  partyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  partyLegendText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  partyCategoryChip: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
  },
  partyCategoryChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4F46E5',
  },
  performanceCard: {
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  performanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  performanceTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
  performanceHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  performanceToggleRow: {
    flexDirection: "row",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  performanceToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  performanceToggleBtnActive: {
    backgroundColor: COLORS.primaryLighter,
  },
  performanceToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  performanceToggleTextActive: {
    color: COLORS.primary,
  },
  performanceRow: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  performanceRowLast: {
    marginBottom: 0,
  },
  performanceTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  performancePerson: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  performanceRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
    marginRight: SPACING.sm,
  },
  performanceRankText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  performanceName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  performanceSales: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  performanceTopBadge: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: SPACING.sm,
  },
  performanceTopBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  performanceSpotlight: {
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  performanceSpotlightItem: {
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 8,
  },
  performanceSpotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },
  performanceSpotlightRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  performanceSpotlightRankText: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.primary,
  },
  performanceSpotlightName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  performanceSpotlightTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
  performanceSpotlightFill: {
    height: "100%",
    borderRadius: 999,
  },
  performanceSpotlightSales: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  performanceSpotlightMeta: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  performanceSpotlightMetaText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.textMuted,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  performanceMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginLeft: 36,
  },
  performanceMetaText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  performanceVisualRow: {
    marginTop: SPACING.sm,
    marginLeft: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  performanceVisualTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  performanceVisualFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  performanceVisualValue: {
    width: 36,
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.primary,
    textAlign: "right",
  },
  performanceMetricsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginLeft: 36,
  },
  performanceMetricPill: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  performanceMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  performanceMetricValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
  },
  performanceEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl,
  },
  performanceEmptyText: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  personModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  personModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    maxHeight: "85%",
  },
  personModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  personModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  personModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  personModalCloseText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  personModalToggleRow: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  personModalToggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  personModalToggleActive: {
    backgroundColor: COLORS.primary,
  },
  personModalToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  personModalToggleTextActive: {
    color: "#fff",
  },
  personModalScroll: {
    flexGrow: 0,
  },
  statSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    fontWeight: "600",
  },
  analyticsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  analyticsControlsSection: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },

  categoryDropdown: {
    width: 130,
    height: 36,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
  },

  categoryDropdownText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  toggleBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  toggleTextActive: {
    color: COLORS.primary,
  },
});

const bStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Bottom navigation
  bottomBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
    paddingTop: 8,
    paddingHorizontal: 6,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  tabBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -26,
    borderWidth: 4,
    borderColor: "#fff",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },

  // Hero
  hero: {
    margin: 16,
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  heroDecor: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    position: "relative",
  },
  heroAvatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  heroAvatarDot: {
    position: "absolute",
    bottom: 0,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#1E3A8A",
  },
  heroGreeting: {
    fontSize: 14,
    color: "rgba(255,255,255,0.88)",
  },
  heroName: {
    fontSize: 21,
    fontWeight: "800",
    color: "#fff",
    marginTop: 1,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  heroChipCompany: {
    marginTop: 8,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  heroIllustration: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroIllustrationBadge: {
    position: "absolute",
    bottom: 2,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  heroStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 6,
  },
  heroStatLabel: {
    fontSize: 10.5,
    color: "rgba(255,255,255,0.8)",
  },
  heroStatValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    marginTop: 1,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },

  // Activity grid
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    justifyContent: "space-between",
  },
  activityCard: {
    width: "47.5%",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  activityValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
  },
  activityLabel: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },

  // Generic card
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },

  // Insights
  insightsRow: {
    flexDirection: "row",
    gap: 12,
  },
  insightBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    borderRadius: 14,
    padding: 12,
  },
  insightLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  insightBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  insightValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    flexShrink: 1,
  },
  sparkline: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 22,
  },
  sparkBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: "#8B5CF6",
  },

  // Recent orders
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
  },
  recentRowBordered: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  recentIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  recentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  recentNumber: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  recentParty: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  recentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 128,
  },
  recentPillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  recentAmount: {
    fontSize: 13.5,
    fontWeight: "800",
    color: COLORS.primary,
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    paddingVertical: 16,
  },
});
