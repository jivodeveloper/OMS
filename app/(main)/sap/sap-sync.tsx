import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  Switch,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Picker } from "@react-native-picker/picker";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/services/api";
import { useFocusEffect } from "expo-router";

type TabType =
  | "status"
  | "products"
  | "parties"
  | "addresses"
  | "branches"
  // | "schedules"
  | "logs";

type SyncType = "all" | "products" | "parties" | "addresses" | "branches";

interface Product {
  id: number;
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  tax_rate: string;
  sal_factor2: string;
  sal_pack_unit: string;
  is_deleted: string;
  synced_at: string;
}

interface Party {
  id: number;
  card_code: string;
  card_name: string;
  address: string;
  state: string;
  main_group: string;
  chain: string;
  country: string;
  card_type: string;
  category: string;
  synced_at: string;
}

interface PartyAddress {
  id: number;
  card_code: string;
  address_name: string;
  address_type: string;
  gst_number: string;
  state: string;
  city: string;
  zip_code: string;
  country: string;
  full_address: string;
  category: string;
  synced_at: string;
}

interface Branch {
  id: number;
  bpl_id: number;
  bpl_name: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SyncLog {
  id: number;
  sync_type: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  started_at: string;
  completed_at: string;
  triggered_by: string;
  duration: number;
}

interface SyncSchedule {
  id: number;
  name: string;
  sync_type: string;
  frequency: string;
  custom_interval_minutes: number;
  hour: number;
  is_active: boolean;
  last_run: string | null;
  next_run: string | null;
}

interface SyncStatus {
  counts: {
    products: number;
    parties: number;
    addresses: number;
    branches: number;
  };
  // Optional per-module deltas synced today (shown as "↑ N today" chips).
  counts_today?: {
    products?: number;
    parties?: number;
    addresses?: number;
    branches?: number;
  };
  last_sync: SyncLog | null;
  active_schedules: number;
}

// ---- Static config for the icon tab bar ----
const TABS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "status", label: "Status", icon: "stats-chart" },
  { key: "products", label: "Products", icon: "cube-outline" },
  { key: "parties", label: "Parties", icon: "people-outline" },
  { key: "addresses", label: "Addresses", icon: "location-outline" },
  { key: "branches", label: "Branches", icon: "business-outline" },
  { key: "logs", label: "Logs", icon: "document-text-outline" },
];

// ---- Manual sync buttons ----
const SYNC_BUTTONS: {
  type: SyncType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  full?: boolean;
}[] = [
  { type: "all", label: "Sync All", icon: "sync", color: "#3B82F6" },
  { type: "products", label: "Products", icon: "cube", color: "#10B981" },
  { type: "parties", label: "Parties", icon: "people", color: "#F59E0B" },
  { type: "addresses", label: "Addresses", icon: "location", color: "#8B5CF6" },
  { type: "branches", label: "Branches", icon: "business", color: "#0891B2", full: true },
];

const lightTap = () => {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export default function SapSyncScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("status");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [syncingType, setSyncingType] = useState<SyncType | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL",
  );
  const [addressFilter, setAddressFilter] = useState<"ALL" | "B" | "S">("ALL");
  const [partyFilter, setPartyFilter] = useState<
    "ALL" | "OIL" | "BEVERAGES" | "MART"
  >("ALL");
  const [productFilter, setProductFilter] = useState<
    "ALL" | "OIL" | "BEVERAGES" | "MART"
  >("ALL");
  const [filterVisible, setFilterVisible] = useState(false);

  // Data states
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [addresses, setAddresses] = useState<PartyAddress[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [schedules, setSchedules] = useState<SyncSchedule[]>([]);
  const [message, setMessage] = useState("");

  // Schedule Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: "",
    sync_type: "ALL",
    frequency: "DAILY",
    hour: 6,
    custom_interval_minutes: 60,
  });

  useFocusEffect(
    useCallback(() => {
      loadData(true);
      // Summary cards on the Addresses/Branches tabs need the status counts &
      // last-sync info, which are otherwise only fetched on the Status tab.
      if (activeTab !== "status") ensureStatus();
    }, [activeTab])
  );

  const getToken = async (): Promise<string | undefined> => {
    const token = await storage.getAccessToken();
    return token || undefined;
  };

  const PAGE_SIZE = 10;

  // Lightweight status fetch used to populate the summary cards on non-status
  // tabs without disturbing that tab's own list loading.
  const ensureStatus = async () => {
    if (status) return;
    try {
      const token = await getToken();
      const res = await api.get("/sap/status/", token);
      if (res.success) setStatus(res.data);
    } catch (error) {
      console.error("Status load error:", error);
    }
  };

  const loadData = async (reset = false) => {
    if (!hasMore && !reset) return;

    let hasData = false;
    if (activeTab === "status") hasData = status !== null;
    if (activeTab === "products") hasData = products.length > 0;
    if (activeTab === "parties") hasData = parties.length > 0;
    if (activeTab === "addresses") hasData = addresses.length > 0;
    if (activeTab === "branches") hasData = branches.length > 0;
    if (activeTab === "logs") hasData = logs.length > 0;

    if (!hasData || !reset) setLoading(true);

    try {
      const token = await getToken();
      const currentPage = reset ? 1 : page;

      let endpoint = "";

      if (activeTab === "status") {
        endpoint = `/sap/status/`;
      } else if (activeTab === "products") {
        endpoint = `/sap/products/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      } else if (activeTab === "parties") {
        endpoint = `/sap/parties/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      } else if (activeTab === "addresses") {
        endpoint = `/sap/addresses/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      } else if (activeTab === "branches") {
        endpoint = `/sap/branches/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      }
      // else if (activeTab === "schedules") {
      //   endpoint = `/sap/schedules/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      // }
      else if (activeTab === "logs") {
        endpoint = `/sap/logs/?page=${currentPage}&page_size=${PAGE_SIZE}`;
      }

      const res = await api.get(endpoint, token);

      if (activeTab === "status") {
        if (res.success) setStatus(res.data);
        setLoading(false);
        return;
      }

      const newData = res?.results ?? res ?? [];

      if (reset) {
        if (activeTab === "products") setProducts(newData);
        if (activeTab === "parties") setParties(newData);
        if (activeTab === "addresses") setAddresses(newData);
        if (activeTab === "branches") setBranches(newData);
        // if (activeTab === "schedules") setSchedules(newData);
        if (activeTab === "logs") setLogs(newData);
        setPage(2);
        setHasMore(true);
      } else {
        if (activeTab === "products")
          setProducts((prev) => [...prev, ...newData]);
        if (activeTab === "parties")
          setParties((prev) => [...prev, ...newData]);
        if (activeTab === "addresses")
          setAddresses((prev) => [...prev, ...newData]);
        if (activeTab === "branches")
          setBranches((prev) => [...prev, ...newData]);
        // if (activeTab === "schedules")
        //   setSchedules((prev) => [...prev, ...newData]);
        if (activeTab === "logs") setLogs((prev) => [...prev, ...newData]);
        setPage((prev) => prev + 1);
      }

      if (!res?.next && newData.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Load error:", error);
    }

    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    await loadData(true);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadData(false);
    }
  };

  const handleSync = async (type: SyncType) => {
    if (syncingType !== null) return;
    lightTap();
    setSyncingType(type);
    setMessage("");
    try {
      const token = await getToken();
      const res = await api.post(`/sap/sync/${type}/`, {}, token);
      if (res.success) {
        setMessage(
          `✅ Sync completed! Processed: ${res.data.processed}, Created: ${res.data.created}, Updated: ${res.data.updated}`,
        );
        loadData(true);
      } else {
        console.log("Sync failed response:", JSON.stringify(res, null, 2));
        const details = [
          res.message,
          res.error,
          res.data?.error,
          Array.isArray(res.errors) ? res.errors.join("; ") : undefined,
          res.baseUrlTried,
        ]
          .filter(Boolean)
          .join(" | ");
        setMessage(`❌ Sync failed: ${details}`);
      }
    } catch (error) {
      setMessage("❌ Sync failed: Network error");
    }
    setSyncingType(null);
  };

  const toggleSchedule = async (scheduleId: number) => {
    try {
      const token = await getToken();
      const res = await api.post(
        `/sap/schedules/${scheduleId}/toggle/`,
        {},
        token,
      );
      if (res.success) {
        loadData(true);
      }
    } catch (error) {
      console.error("Toggle error:", error);
    }
  };

  const createSchedule = async () => {
    if (!newSchedule.name.trim()) {
      alert("Please enter a schedule name");
      return;
    }

    try {
      const token = await getToken();
      const res = await api.post(
        "/sap/schedules/",
        {
          ...newSchedule,
          is_active: true,
        },
        token,
      );

      if (res.success) {
        setShowScheduleModal(false);
        setNewSchedule({
          name: "",
          sync_type: "ALL",
          frequency: "DAILY",
          hour: 6,
          custom_interval_minutes: 60,
        });
        loadData(true);
      } else {
        alert("Failed to create schedule");
      }
    } catch (error) {
      alert("Error creating schedule");
    }
  };

  const deleteSchedule = async (scheduleId: number) => {
    try {
      const token = await getToken();
      const res = await api.delete(`/sap/schedules/${scheduleId}/`, undefined, token);
      if (res.success) {
        loadData(true);
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.item_code?.toLowerCase().includes(q) ||
      p.item_name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q);
    const matchesFilter = productFilter === "ALL" || p.category === productFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredParties = parties.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.card_code?.toLowerCase().includes(q) ||
      p.card_name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q);
    const matchesFilter = partyFilter === "ALL" || p.category === partyFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredAddresses = addresses.filter((a) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      a.card_code?.toLowerCase().includes(q) ||
      a.address_name?.toLowerCase().includes(q) ||
      a.city?.toLowerCase().includes(q) ||
      a.state?.toLowerCase().includes(q) ||
      a.gst_number?.toLowerCase().includes(q);
    const matchesFilter =
      addressFilter === "ALL" || a.address_type === addressFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredBranches = branches.filter((b) => {
    const matchesSearch =
      b.bpl_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.bpl_id?.toString().includes(searchQuery) ||
      b.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      branchFilter === "ALL" ||
      (branchFilter === "ACTIVE" && b.is_active) ||
      (branchFilter === "INACTIVE" && !b.is_active);
    return matchesSearch && matchesFilter;
  });

  const openFilter = () => {
    lightTap();
    setFilterVisible(true);
  };

  // Options + current value/setter for the shared filter dialog.
  const filterConfig =
    activeTab === "addresses"
      ? {
          title: "Filter Addresses",
          subtitle: "Show addresses by type",
          value: addressFilter as string,
          options: [
            { value: "ALL", label: "All addresses" },
            { value: "B", label: "Billing only" },
            { value: "S", label: "Shipping only" },
          ],
          apply: (v: string) => setAddressFilter(v as "ALL" | "B" | "S"),
        }
      : activeTab === "parties"
      ? {
          title: "Filter Parties",
          subtitle: "Show parties by category",
          value: partyFilter as string,
          options: [
            { value: "ALL", label: "All parties" },
            { value: "OIL", label: "Oil" },
            { value: "BEVERAGES", label: "Beverages" },
            { value: "MART", label: "Mart" },
          ],
          apply: (v: string) =>
            setPartyFilter(v as "ALL" | "OIL" | "BEVERAGES" | "MART"),
        }
      : activeTab === "products"
      ? {
          title: "Filter Products",
          subtitle: "Show products by category",
          value: productFilter as string,
          options: [
            { value: "ALL", label: "All products" },
            { value: "OIL", label: "Oil" },
            { value: "BEVERAGES", label: "Beverages" },
            { value: "MART", label: "Mart" },
          ],
          apply: (v: string) =>
            setProductFilter(v as "ALL" | "OIL" | "BEVERAGES" | "MART"),
        }
      : {
          title: "Filter Branches",
          subtitle: "Show branches by status",
          value: branchFilter as string,
          options: [
            { value: "ALL", label: "All branches" },
            { value: "ACTIVE", label: "Active only" },
            { value: "INACTIVE", label: "Inactive only" },
          ],
          apply: (v: string) =>
            setBranchFilter(v as "ALL" | "ACTIVE" | "INACTIVE"),
        };

  // Cycling accent colors for icon tiles (branches & addresses).
  const ICON_ACCENTS = [
    { bg: "#EFF6FF", color: "#2563EB" },
    { bg: "#F0FDF4", color: "#16A34A" },
    { bg: "#FFF7ED", color: "#EA580C" },
    { bg: "#F5F3FF", color: "#7C3AED" },
  ];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatLastSync = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const switchTab = (tab: TabType) => {
    if (activeTab === tab) return;
    lightTap();
    setLoading(true);
    setActiveTab(tab);
    setSearchQuery("");
  };

  // ---------- Hero + Tabs (persistent header) ----------
  const renderHero = () => (
    <LinearGradient
      colors={["#1D4ED8", "#1E3A8A", "#0B2A6B"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroTextWrap}>
        <Text style={styles.heroTitle}>SAP Data Sync</Text>
        <Text style={styles.heroSubtitle}>
          Keep your OMS data in sync with SAP in real-time.
        </Text>
      </View>

      <View style={styles.heroGraphic}>
        <View style={[styles.heroBadge, styles.heroBadgeLeft]}>
          <Ionicons name="grid-outline" size={15} color="#fff" />
        </View>
        <View style={styles.cloudWrap}>
          <Ionicons name="cloud" size={64} color="rgba(96,165,250,0.95)" />
          <View style={styles.cloudSync}>
            <Ionicons name="sync" size={24} color="#fff" />
          </View>
        </View>
        <View style={[styles.heroBadge, styles.heroBadgeRight]}>
          <Ionicons name="document-text-outline" size={15} color="#fff" />
        </View>
      </View>
    </LinearGradient>
  );

  const renderTabs = () => (
    <View style={styles.tabBarCard}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              activeOpacity={0.7}
              onPress={() => switchTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={active ? "#2563EB" : "#64748B"}
              />
              <Text
                style={[styles.tabItemText, active && styles.tabItemTextActive]}
              >
                {tab.label}
              </Text>
              <View
                style={[styles.tabUnderline, active && styles.tabUnderlineActive]}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ---------- Status tab ----------
  const renderSyncButton = (btn: (typeof SYNC_BUTTONS)[number]) => {
    const isSyncing = syncingType === btn.type;
    return (
      <TouchableOpacity
        key={btn.type}
        style={[
          styles.syncBtn,
          { backgroundColor: btn.color },
          btn.full ? styles.syncBtnFull : styles.syncBtnHalf,
          syncingType !== null && !isSyncing && styles.syncBtnDisabled,
        ]}
        activeOpacity={0.85}
        onPress={() => handleSync(btn.type)}
        disabled={syncingType !== null}
      >
        {isSyncing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <View style={styles.syncBtnLeft}>
              <Ionicons name={btn.icon} size={18} color="#fff" />
              <Text style={styles.syncBtnText}>{btn.label}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color="rgba(255,255,255,0.85)"
            />
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderDataCards = () => {
    const cards = [
      {
        key: "products" as TabType,
        label: "Products",
        icon: "cube-outline" as keyof typeof Ionicons.glyphMap,
        count: status?.counts.products ?? 0,
        today: status?.counts_today?.products ?? 0,
        bg: "#EFF6FF",
        iconColor: "#2563EB",
        pillBg: "#DBEAFE",
        pillText: "#1D4ED8",
      },
      {
        key: "parties" as TabType,
        label: "Parties",
        icon: "people-outline" as keyof typeof Ionicons.glyphMap,
        count: status?.counts.parties ?? 0,
        today: status?.counts_today?.parties ?? 0,
        bg: "#F0FDF4",
        iconColor: "#16A34A",
        pillBg: "#DCFCE7",
        pillText: "#15803D",
      },
      {
        key: "addresses" as TabType,
        label: "Addresses",
        icon: "location-outline" as keyof typeof Ionicons.glyphMap,
        count: status?.counts.addresses ?? 0,
        today: status?.counts_today?.addresses ?? 0,
        bg: "#FFF7ED",
        iconColor: "#EA580C",
        pillBg: "#FFEDD5",
        pillText: "#C2410C",
      },
      {
        key: "branches" as TabType,
        label: "Branches",
        icon: "business-outline" as keyof typeof Ionicons.glyphMap,
        count: status?.counts.branches ?? 0,
        today: status?.counts_today?.branches ?? 0,
        bg: "#F5F3FF",
        iconColor: "#7C3AED",
        pillBg: "#EDE9FE",
        pillText: "#6D28D9",
      },
    ];

    return (
      <View style={styles.dataGrid}>
        {cards.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.dataCard, { backgroundColor: c.bg }]}
            activeOpacity={0.8}
            onPress={() => switchTab(c.key)}
          >
            <View style={styles.dataCardTop}>
              <View style={styles.dataIconCircle}>
                <Ionicons name={c.icon} size={20} color={c.iconColor} />
              </View>
              <View style={styles.dataCardText}>
                <Text style={styles.dataNumber}>
                  {Number(c.count).toLocaleString()}
                </Text>
                <Text style={styles.dataLabel}>{c.label}</Text>
              </View>
            </View>
            <View style={[styles.todayPill, { backgroundColor: c.pillBg }]}>
              <Ionicons name="arrow-up" size={11} color={c.pillText} />
              <Text style={[styles.todayPillText, { color: c.pillText }]}>
                {c.today} today
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderStatus = () => {
    const lastSync = status?.last_sync;
    const lastSyncOk = lastSync?.status === "SUCCESS";
    const scheduleCount = status?.active_schedules ?? 0;

    return (
      <ScrollView
        style={styles.statusScroll}
        contentContainerStyle={styles.statusContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Message */}
        {message ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{message}</Text>
            <TouchableOpacity
              onPress={() => setMessage("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Manual Sync */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Manual Sync</Text>
          <Text style={styles.cardSubtitle}>
            Choose a module to sync data manually.
          </Text>
          <View style={styles.syncGrid}>
            {SYNC_BUTTONS.map(renderSyncButton)}
          </View>
        </View>

        {/* Current Data */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Data</Text>
          {renderDataCards()}

          {/* Active schedules banner */}
          <View style={styles.schedBanner}>
            <View style={styles.schedIcon}>
              <Ionicons name="calendar-outline" size={20} color="#D97706" />
            </View>
            <View style={styles.schedTextWrap}>
              <Text style={styles.schedTitle}>
                Active Schedules: {scheduleCount}
              </Text>
              <Text style={styles.schedSub}>
                {scheduleCount > 0
                  ? `${scheduleCount} sync schedule${scheduleCount > 1 ? "s" : ""} running.`
                  : "No active sync schedules at the moment."}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.schedBtn}
              activeOpacity={0.7}
              onPress={() => {
                lightTap();
                Alert.alert(
                  "Sync Schedules",
                  scheduleCount > 0
                    ? `You have ${scheduleCount} active sync schedule${scheduleCount > 1 ? "s" : ""}.`
                    : "No sync schedules are configured yet.",
                );
              }}
            >
              <Text style={styles.schedBtnText}>View Schedules</Text>
              <Ionicons name="chevron-forward" size={14} color="#B45309" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Last Sync */}
        {lastSync ? (
          <View style={[styles.card, styles.lastSyncCard]}>
            <View style={styles.lastSyncIcon}>
              <Ionicons name="time-outline" size={22} color="#2563EB" />
            </View>
            <View style={styles.lastSyncText}>
              <Text style={styles.lastSyncTitle}>Last Sync</Text>
              <Text style={styles.lastSyncDate}>
                {formatLastSync(lastSync.completed_at || lastSync.started_at)}
              </Text>
              <Text
                style={[
                  styles.lastSyncNote,
                  { color: lastSyncOk ? "#16A34A" : "#DC2626" },
                ]}
              >
                {lastSyncOk
                  ? "All modules are up to date."
                  : `Last sync ${lastSync.status?.toLowerCase() || "failed"}.`}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                lastSyncOk ? styles.statusPillOk : styles.statusPillFail,
              ]}
            >
              <Ionicons
                name={lastSyncOk ? "checkmark-circle" : "close-circle"}
                size={15}
                color={lastSyncOk ? "#16A34A" : "#DC2626"}
              />
              <Text
                style={[
                  styles.statusPillText,
                  { color: lastSyncOk ? "#16A34A" : "#DC2626" },
                ]}
              >
                {lastSyncOk ? "Success" : "Failed"}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderProductItem = ({
    item,
    index,
  }: {
    item: Product;
    index: number;
  }) => {
    const accent = ICON_ACCENTS[index % ICON_ACCENTS.length];
    return (
      <View style={styles.partyCard}>
        <View style={[styles.partyIconWrap, { backgroundColor: accent.bg }]}>
          <Ionicons name="cube" size={22} color={accent.color} />
        </View>

        <View style={styles.partyBody}>
          <View style={styles.partyHeaderRow}>
            <Text style={styles.partyCode} numberOfLines={1}>
              {item.item_code}
            </Text>
            <Text
              style={[
                styles.itemCategory,
                item.category === "OIL" && styles.categoryOil,
                item.category === "BEVERAGES" && styles.categoryBeverages,
                item.category === "MART" && styles.categoryMart,
              ]}
            >
              {item.category || "-"}
            </Text>
          </View>

          <Text style={styles.partyName} numberOfLines={1}>
            {item.item_name}
          </Text>

          <View style={styles.productDetailRow}>
            <View style={styles.productDetailCol}>
              <Text style={styles.partyDetailLabel}>
                Brand:{" "}
                <Text style={styles.partyDetailValue}>{item.brand || "-"}</Text>
              </Text>
              <Text style={[styles.partyDetailLabel, { marginTop: 3 }]}>
                Pack:{" "}
                <Text style={styles.partyDetailValue}>
                  {item.sal_pack_unit || "-"}
                </Text>
              </Text>
            </View>
            <View style={styles.productDetailCol}>
              <Text style={styles.partyDetailLabel}>
                Variety:{" "}
                <Text style={styles.partyDetailValue}>
                  {item.variety || "-"}
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderProductSummary = () => {
    const total = status?.counts.products ?? filteredProducts.length;
    const lastSync = status?.last_sync;
    const lastSyncOk = lastSync?.status === "SUCCESS";
    return (
      <View style={styles.addrSummaryCard}>
        <View style={styles.partySummaryHalf}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="cube" size={24} color="#2563EB" />
          </View>
          <View style={styles.addrSummaryLeftText}>
            <Text style={styles.summaryLabel}>Total Products</Text>
            <Text style={styles.summaryNumber}>
              {Number(total).toLocaleString()}
            </Text>
            <Text style={styles.summarySub}>All products</Text>
          </View>
        </View>

        <View style={styles.partyDivider} />

        <View style={styles.partySummaryHalf}>
          <View style={styles.partyVerifiedIcon}>
            <Ionicons name="trending-up" size={20} color="#16A34A" />
          </View>
          <View style={styles.addrSummaryRightText}>
            <Text style={styles.lastSyncMiniLabel}>Last Sync</Text>
            <Text style={styles.lastSyncMiniDate}>
              {lastSync
                ? formatLastSync(lastSync.completed_at || lastSync.started_at)
                : "—"}
            </Text>
            {lastSync ? (
              <View
                style={[
                  styles.statusPill,
                  lastSyncOk ? styles.statusPillOk : styles.statusPillFail,
                  styles.lastSyncMiniPill,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: lastSyncOk ? "#16A34A" : "#DC2626" },
                  ]}
                >
                  {lastSyncOk ? "Success" : lastSync.status}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderProducts = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredProducts}
        renderItem={renderProductItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <View style={[styles.searchWrap, styles.searchWrapFlex]}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by code, name or brand..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.filterBtnWide,
                  productFilter !== "ALL" && styles.filterBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={openFilter}
              >
                <Ionicons
                  name="funnel-outline"
                  size={16}
                  color={productFilter !== "ALL" ? "#fff" : "#2563EB"}
                />
                <Text
                  style={[
                    styles.filterBtnText,
                    productFilter !== "ALL" && styles.filterBtnTextActive,
                  ]}
                >
                  Filter
                </Text>
              </TouchableOpacity>
            </View>
            {renderProductSummary()}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products found</Text>
            <Text style={styles.emptySubtext}>
              Sync products from SAP to see data here
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const renderPartyItem = ({ item, index }: { item: Party; index: number }) => {
    const accent = ICON_ACCENTS[index % ICON_ACCENTS.length];
    return (
      <View style={styles.partyCard}>
        <View style={[styles.partyIconWrap, { backgroundColor: accent.bg }]}>
          <Ionicons name="business" size={22} color={accent.color} />
        </View>

        <View style={styles.partyBody}>
          <View style={styles.partyHeaderRow}>
            <Text style={styles.partyCode} numberOfLines={1}>
              {item.card_code}
            </Text>
            <Text
              style={[
                styles.itemCategory,
                item.category === "OIL" && styles.categoryOil,
                item.category === "BEVERAGES" && styles.categoryBeverages,
                item.category === "MART" && styles.categoryMart,
              ]}
            >
              {item.category || "-"}
            </Text>
          </View>

          <Text style={styles.partyName} numberOfLines={1}>
            {item.card_name}
          </Text>

          <View style={styles.partyDetailRow}>
            <View style={styles.partyDetailLeft}>
              <Text style={styles.partyDetailLabel}>State: </Text>
              <View style={styles.stateBadge}>
                <Text style={styles.stateBadgeText}>{item.state || "-"}</Text>
              </View>
            </View>
            <Text style={styles.partyDetailLabel}>
              Group:{" "}
              <Text style={styles.partyDetailValue}>
                {item.main_group || "-"}
              </Text>
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderPartySummary = () => {
    const total = status?.counts.parties ?? filteredParties.length;
    const lastSync = status?.last_sync;
    const lastSyncOk = lastSync?.status === "SUCCESS";
    return (
      <View style={styles.addrSummaryCard}>
        <View style={styles.partySummaryHalf}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="people" size={24} color="#2563EB" />
          </View>
          <View style={styles.addrSummaryLeftText}>
            <Text style={styles.summaryLabel}>Total Parties</Text>
            <Text style={styles.summaryNumber}>
              {Number(total).toLocaleString()}
            </Text>
            <Text style={styles.summarySub}>All parties</Text>
          </View>
        </View>

        <View style={styles.partyDivider} />

        <View style={styles.partySummaryHalf}>
          <View style={styles.partyVerifiedIcon}>
            <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
          </View>
          <View style={styles.addrSummaryRightText}>
            <Text style={styles.lastSyncMiniLabel}>Last Sync</Text>
            <Text style={styles.lastSyncMiniDate}>
              {lastSync
                ? formatLastSync(lastSync.completed_at || lastSync.started_at)
                : "—"}
            </Text>
            {lastSync ? (
              <View
                style={[
                  styles.statusPill,
                  lastSyncOk ? styles.statusPillOk : styles.statusPillFail,
                  styles.lastSyncMiniPill,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: lastSyncOk ? "#16A34A" : "#DC2626" },
                  ]}
                >
                  {lastSyncOk ? "Success" : lastSync.status}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderParties = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredParties}
        renderItem={renderPartyItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <View style={[styles.searchWrap, styles.searchWrapFlex]}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by code, name, or category..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.filterBtn,
                  partyFilter !== "ALL" && styles.filterBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={openFilter}
              >
                <Ionicons
                  name="funnel-outline"
                  size={18}
                  color={partyFilter !== "ALL" ? "#fff" : "#2563EB"}
                />
              </TouchableOpacity>
            </View>
            {renderPartySummary()}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No parties found</Text>
            <Text style={styles.emptySubtext}>
              Sync parties from SAP to see data here
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const renderAddressItem = ({
    item,
    index,
  }: {
    item: PartyAddress;
    index: number;
  }) => {
    const accent = ICON_ACCENTS[index % ICON_ACCENTS.length];
    return (
      <TouchableOpacity style={styles.addrCard} activeOpacity={0.75}>
        <View style={styles.addrTop}>
          <View style={[styles.addrIconWrap, { backgroundColor: accent.bg }]}>
            <Ionicons name="business" size={22} color={accent.color} />
          </View>

          <View style={styles.addrBody}>
            <View style={styles.addrHeaderRow}>
              <Text style={styles.addrCode} numberOfLines={1}>
                {item.card_code}
              </Text>
              <View style={styles.addrBadges}>
                <Text
                  style={[
                    styles.addressTypeBadge,
                    item.address_type === "B"
                      ? styles.billingBadge
                      : styles.shippingBadge,
                  ]}
                >
                  {item.address_type === "B" ? "Billing" : "Shipping"}
                </Text>
                <Text
                  style={[
                    styles.itemCategory,
                    item.category === "OIL" && styles.categoryOil,
                    item.category === "BEVERAGES" && styles.categoryBeverages,
                    item.category === "MART" && styles.categoryMart,
                  ]}
                >
                  {item.category || "-"}
                </Text>
              </View>
            </View>
            <Text style={styles.addrName} numberOfLines={1}>
              {item.address_name}
            </Text>
            <Text style={styles.addrFull} numberOfLines={2}>
              {item.full_address || "-"}
            </Text>
          </View>
        </View>

        <View style={styles.addrDetailRow}>
          <Text style={styles.addrDetail}>
            City: <Text style={styles.addrDetailValue}>{item.city || "-"}</Text>
          </Text>
          <Text style={[styles.addrDetail, styles.gstText]} numberOfLines={1}>
            GST: {item.gst_number || "-"}
          </Text>
          <Text style={styles.addrDetail}>
            State: <Text style={styles.addrDetailValue}>{item.state || "-"}</Text>
          </Text>
          <Text style={styles.addrDetail}>
            PIN: <Text style={styles.addrDetailValue}>{item.zip_code || "-"}</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAddressSummary = () => {
    const total = status?.counts.addresses ?? filteredAddresses.length;
    const lastSync = status?.last_sync;
    const lastSyncOk = lastSync?.status === "SUCCESS";
    return (
      <View style={styles.addrSummaryCard}>
        <View style={styles.addrSummaryLeft}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="location" size={24} color="#2563EB" />
          </View>
          <View style={styles.addrSummaryLeftText}>
            <Text style={styles.summaryLabel}>Total Addresses</Text>
            <Text style={styles.summaryNumber}>
              {Number(total).toLocaleString()}
            </Text>
            <Text style={styles.summarySub}>All address locations</Text>
          </View>
        </View>

        <View style={styles.addrSummaryRight}>
          <View style={styles.lastSyncMiniIcon}>
            <Ionicons name="stats-chart" size={18} color="#2563EB" />
          </View>
          <View style={styles.addrSummaryRightText}>
            <Text style={styles.lastSyncMiniLabel}>Last Sync</Text>
            <Text style={styles.lastSyncMiniDate}>
              {lastSync
                ? formatLastSync(lastSync.completed_at || lastSync.started_at)
                : "—"}
            </Text>
            {lastSync ? (
              <View
                style={[
                  styles.statusPill,
                  lastSyncOk ? styles.statusPillOk : styles.statusPillFail,
                  styles.lastSyncMiniPill,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: lastSyncOk ? "#16A34A" : "#DC2626" },
                  ]}
                >
                  {lastSyncOk ? "Success" : lastSync.status}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderAddresses = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredAddresses}
        renderItem={renderAddressItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <View style={[styles.searchWrap, styles.searchWrapFlex]}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by code, address, city, state or GST..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.filterBtn,
                  addressFilter !== "ALL" && styles.filterBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={openFilter}
              >
                <Ionicons
                  name="funnel-outline"
                  size={18}
                  color={addressFilter !== "ALL" ? "#fff" : "#2563EB"}
                />
              </TouchableOpacity>
            </View>
            {renderAddressSummary()}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No addresses found</Text>
            <Text style={styles.emptySubtext}>
              Sync addresses from SAP to see data here
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const renderBranchItem = ({ item, index }: { item: Branch; index: number }) => {
    const accent = ICON_ACCENTS[index % ICON_ACCENTS.length];
    return (
      <TouchableOpacity style={styles.branchCard} activeOpacity={0.75}>
        <View style={[styles.branchIconWrap, { backgroundColor: accent.bg }]}>
          <Ionicons name="business" size={24} color={accent.color} />
        </View>

        <View style={styles.branchMid}>
          <Text style={styles.branchCode}>BPL-{item.bpl_id}</Text>
          <Text style={styles.branchName} numberOfLines={1}>
            {item.bpl_name}
          </Text>
          <View
            style={[
              styles.branchStatusPill,
              item.is_active ? styles.branchStatusOk : styles.branchStatusOff,
            ]}
          >
            <Ionicons
              name={item.is_active ? "checkmark-circle" : "close-circle"}
              size={13}
              color={item.is_active ? "#16A34A" : "#DC2626"}
            />
            <Text
              style={[
                styles.branchStatusText,
                { color: item.is_active ? "#16A34A" : "#DC2626" },
              ]}
            >
              {item.is_active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        <View style={styles.branchRightCol}>
          <Text
            style={[
              styles.itemCategory,
              item.category === "OIL" && styles.categoryOil,
              item.category === "BEVERAGES" && styles.categoryBeverages,
              item.category === "MART" && styles.categoryMart,
            ]}
          >
            {item.category || "-"}
          </Text>
          <Text style={styles.updatedLabel}>Updated</Text>
          <Text style={styles.updatedDate}>{formatDate(item.updated_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderBranchSummary = () => {
    const total = status?.counts.branches ?? filteredBranches.length;
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryIconWrap}>
          <Ionicons name="business" size={26} color="#2563EB" />
        </View>
        <View style={styles.summaryTextWrap}>
          <Text style={styles.summaryLabel}>Total Branches</Text>
          <Text style={styles.summaryNumber}>
            {Number(total).toLocaleString()}
          </Text>
          <Text style={styles.summarySub}>All locations</Text>
        </View>
        {/* Decorative mini-map */}
        <View style={styles.mapDecor}>
          <View style={[styles.mapPatch, styles.mapPatch1]} />
          <View style={[styles.mapPatch, styles.mapPatch2]} />
          <View style={[styles.mapRoad, styles.mapRoad1]} />
          <View style={[styles.mapRoad, styles.mapRoad2]} />
          <Ionicons
            name="location"
            size={30}
            color="#2563EB"
            style={styles.mapPin}
          />
        </View>
      </View>
    );
  };

  const renderBranches = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredBranches}
        renderItem={renderBranchItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.searchRow}>
              <View style={[styles.searchWrap, styles.searchWrapFlex]}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by ID, name or category..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.filterBtn,
                  branchFilter !== "ALL" && styles.filterBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={openFilter}
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={branchFilter !== "ALL" ? "#fff" : "#2563EB"}
                />
              </TouchableOpacity>
            </View>
            {renderBranchSummary()}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No branches found</Text>
            <Text style={styles.emptySubtext}>
              Sync branches from SAP to see data here
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const renderScheduleItem = ({ item }: { item: SyncSchedule }) => (
    <View style={styles.scheduleItem}>
      <View style={styles.scheduleItemHeader}>
        <View>
          <Text style={styles.scheduleName}>{item.name}</Text>
          <Text style={styles.scheduleInfo}>
            {item.sync_type} • {item.frequency}
            {item.frequency === "DAILY" && ` at ${item.hour}:00`}
            {item.frequency === "CUSTOM" &&
              ` every ${item.custom_interval_minutes} min`}
          </Text>
        </View>
        <Switch
          value={item.is_active}
          onValueChange={() => toggleSchedule(item.id)}
          trackColor={{ false: "#e5e5e5", true: "#86efac" }}
          thumbColor={item.is_active ? "#22c55e" : "#999"}
        />
      </View>

      <View style={styles.scheduleDetails}>
        <Text style={styles.scheduleDetailText}>
          Last run: {item.last_run ? formatDate(item.last_run) : "Never"}
        </Text>
        <Text style={styles.scheduleDetailText}>
          Next run: {item.next_run ? formatDate(item.next_run) : "-"}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteSchedule(item.id)}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSchedules = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={schedules}
        renderItem={renderScheduleItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.scheduleHeader}>
            <Text style={styles.cardTitle}>Sync Schedules</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowScheduleModal(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No schedules configured</Text>
            <Text style={styles.emptySubtext}>
              Create a schedule to automate syncing
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />

      {/* Add Schedule Modal */}
      <Modal
        visible={showScheduleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Schedule</Text>

            <Text style={styles.inputLabel}>Schedule Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Daily Product Sync"
              value={newSchedule.name}
              onChangeText={(text) =>
                setNewSchedule({ ...newSchedule, name: text })
              }
            />

            <Text style={styles.inputLabel}>Sync Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={newSchedule.sync_type}
                onValueChange={(value) =>
                  setNewSchedule({ ...newSchedule, sync_type: value })
                }
                style={styles.picker}
              >
                <Picker.Item label="All Data" value="ALL" />
                <Picker.Item label="Products Only" value="PRODUCT" />
                <Picker.Item label="Parties Only" value="PARTY" />
                <Picker.Item label="Addresses Only" value="PARTY_ADDRESS" />
                <Picker.Item label="Branches Only" value="BRANCH" />
              </Picker>
            </View>

            <Text style={styles.inputLabel}>Frequency</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={newSchedule.frequency}
                onValueChange={(value) =>
                  setNewSchedule({ ...newSchedule, frequency: value })
                }
                style={styles.picker}
              >
                <Picker.Item label="Every Hour" value="HOURLY" />
                <Picker.Item label="Daily" value="DAILY" />
                <Picker.Item label="Weekly" value="WEEKLY" />
                <Picker.Item label="Custom Interval" value="CUSTOM" />
              </Picker>
            </View>

            {newSchedule.frequency === "DAILY" && (
              <>
                <Text style={styles.inputLabel}>Hour (0-23)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="6"
                  keyboardType="number-pad"
                  value={newSchedule.hour.toString()}
                  onChangeText={(text) =>
                    setNewSchedule({
                      ...newSchedule,
                      hour: parseInt(text) || 0,
                    })
                  }
                />
              </>
            )}

            {newSchedule.frequency === "CUSTOM" && (
              <>
                <Text style={styles.inputLabel}>Interval (minutes)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="60"
                  keyboardType="number-pad"
                  value={newSchedule.custom_interval_minutes.toString()}
                  onChangeText={(text) =>
                    setNewSchedule({
                      ...newSchedule,
                      custom_interval_minutes: parseInt(text) || 60,
                    })
                  }
                />
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowScheduleModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={createSchedule}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderLogItem = ({ item }: { item: SyncLog }) => (
    <View style={styles.logItem}>
      <View style={styles.logHeader}>
        <Text style={styles.logType}>{item.sync_type}</Text>
        <Text
          style={[
            styles.logStatus,
            item.status === "SUCCESS"
              ? styles.statusSuccess
              : styles.statusFailed,
          ]}
        >
          {item.status}
        </Text>
      </View>
      <Text style={styles.logStats}>
        Processed: {item.records_processed} | Created: {item.records_created} |
        Updated: {item.records_updated}
      </Text>
      <Text style={styles.logTime}>
        {formatDate(item.started_at)} | {item.triggered_by}
      </Text>
    </View>
  );

  const renderLogs = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={logs}
        renderItem={renderLogItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Text style={styles.countText}>Recent sync logs</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No logs found</Text>
            <Text style={styles.emptySubtext}>Sync logs will appear here</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && hasMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#3b82f6" />
            </View>
          ) : null
        }
      />
    </View>
  );

  const showFullLoader =
    loading &&
    !refreshing &&
    (activeTab === "status" ? status === null : page === 1);

  return (
    <View style={styles.container}>
      {/* Persistent hero + icon tab bar */}
      <View style={styles.headerArea}>
        {renderHero()}
        {renderTabs()}
      </View>

      {showFullLoader ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === "status" && renderStatus()}
          {activeTab === "products" && renderProducts()}
          {activeTab === "parties" && renderParties()}
          {activeTab === "addresses" && renderAddresses()}
          {activeTab === "branches" && renderBranches()}
          {activeTab === "logs" && renderLogs()}
        </View>
      )}

      {/* Shared filter dialog (Branches / Addresses) */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setFilterVisible(false)}
        >
          <View
            style={styles.filterSheet}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.filterHeader}>
              <View style={styles.filterIconTile}>
                <Ionicons name="options-outline" size={20} color="#2563EB" />
              </View>
              <View style={styles.filterHeaderText}>
                <Text style={styles.filterTitle}>{filterConfig.title}</Text>
                <Text style={styles.filterSubtitle}>
                  {filterConfig.subtitle}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFilterVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {filterConfig.options.map((opt) => {
              const selected = filterConfig.value === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.filterOption,
                    selected && styles.filterOptionActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    lightTap();
                    filterConfig.apply(opt.value);
                    setFilterVisible(false);
                  }}
                >
                  <View
                    style={[
                      styles.filterRadio,
                      selected && styles.filterRadioActive,
                    ]}
                  >
                    {selected ? <View style={styles.filterRadioDot} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.filterOptionText,
                      selected && styles.filterOptionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color="#2563EB"
                      style={styles.filterOptionCheck}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  // ---- Persistent header (hero + tabs) ----
  headerArea: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  hero: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "rgba(219,234,254,0.9)",
    fontSize: 13,
    lineHeight: 18,
  },
  heroGraphic: {
    width: 118,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  cloudSync: {
    position: "absolute",
    top: 22,
  },
  heroBadge: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(37,99,235,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeLeft: {
    top: 30,
    left: -2,
  },
  heroBadgeRight: {
    top: 2,
    right: -2,
  },

  // ---- Tab bar ----
  tabBarCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginTop: 12,
    paddingVertical: 6,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  tabBarContent: {
    paddingHorizontal: 4,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    minWidth: 74,
  },
  tabItemText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    marginTop: 4,
  },
  tabItemTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  tabUnderline: {
    height: 3,
    width: 26,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: "transparent",
  },
  tabUnderlineActive: {
    backgroundColor: "#2563EB",
  },

  // ---- Status content ----
  statusScroll: {
    flex: 1,
  },
  statusContent: {
    padding: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
    marginBottom: 14,
  },

  // ---- Manual sync buttons ----
  syncGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  syncBtn: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  syncBtnHalf: {
    width: "47%",
    flexGrow: 1,
  },
  syncBtnFull: {
    width: "100%",
  },
  syncBtnDisabled: {
    opacity: 0.55,
  },
  syncBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  // ---- Current data cards ----
  dataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dataCard: {
    width: "47%",
    flexGrow: 1,
    borderRadius: 14,
    padding: 14,
  },
  dataCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  dataIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  dataCardText: {
    marginLeft: 10,
    flex: 1,
  },
  dataNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  dataLabel: {
    fontSize: 13,
    color: "#475569",
    marginTop: 1,
  },
  todayPill: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 12,
  },
  todayPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // ---- Active schedules banner ----
  schedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  schedIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  schedTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  schedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B45309",
  },
  schedSub: {
    fontSize: 12,
    color: "#92400E",
    marginTop: 2,
  },
  schedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  schedBtnText: {
    color: "#B45309",
    fontWeight: "700",
    fontSize: 12,
  },

  // ---- Last sync ----
  lastSyncCard: {
    flexDirection: "row",
    alignItems: "center",
  },
  lastSyncIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  lastSyncText: {
    flex: 1,
    marginLeft: 12,
  },
  lastSyncTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  lastSyncDate: {
    fontSize: 13,
    color: "#334155",
    marginTop: 2,
  },
  lastSyncNote: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillOk: {
    backgroundColor: "#DCFCE7",
  },
  statusPillFail: {
    backgroundColor: "#FEE2E2",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // ---- Message ----
  messageCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 4,
    borderLeftColor: "#2563EB",
    gap: 10,
  },
  messageText: {
    fontSize: 13,
    color: "#334155",
    flex: 1,
  },

  // ---- Shared / lists ----
  flatListContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 50,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 14,
    color: "#0F172A",
  },
  countText: {
    color: "#64748B",
    marginBottom: 10,
    fontSize: 13,
  },

  // ---- Branches: search + filter row ----
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  searchWrapFlex: {
    flex: 1,
    marginBottom: 0,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  filterBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  filterBtnTextActive: {
    color: "#fff",
  },

  // ---- Branches: summary card ----
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    overflow: "hidden",
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTextWrap: {
    flex: 1,
    marginLeft: 14,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  summaryNumber: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    marginVertical: 1,
  },
  summarySub: {
    fontSize: 12,
    color: "#94A3B8",
  },
  mapDecor: {
    width: 104,
    height: 74,
    borderRadius: 12,
    backgroundColor: "#EAF1F8",
    overflow: "hidden",
  },
  mapPatch: {
    position: "absolute",
    backgroundColor: "#D7E7DA",
    borderRadius: 4,
  },
  mapPatch1: {
    width: 34,
    height: 26,
    top: 8,
    left: 10,
    opacity: 0.8,
  },
  mapPatch2: {
    width: 28,
    height: 22,
    bottom: 8,
    right: 12,
    opacity: 0.7,
  },
  mapRoad: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
  },
  mapRoad1: {
    width: 120,
    height: 6,
    top: 40,
    left: -8,
    transform: [{ rotate: "-18deg" }],
  },
  mapRoad2: {
    width: 6,
    height: 90,
    top: -8,
    left: 58,
    transform: [{ rotate: "12deg" }],
  },
  mapPin: {
    position: "absolute",
    top: 8,
    right: 24,
  },

  // ---- Branches: list card ----
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  branchIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  branchMid: {
    flex: 1,
    marginLeft: 12,
  },
  branchCode: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
  },
  branchName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
    marginBottom: 6,
  },
  branchStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  branchStatusOk: {
    backgroundColor: "#DCFCE7",
  },
  branchStatusOff: {
    backgroundColor: "#FEE2E2",
  },
  branchStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  branchRightCol: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  updatedLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 10,
  },
  updatedDate: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    marginTop: 1,
  },

  // ---- Addresses: summary card ----
  addrSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  addrSummaryLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  addrSummaryLeftText: {
    marginLeft: 12,
    flex: 1,
  },
  addrSummaryRight: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 10,
    marginLeft: 10,
  },
  addrSummaryRightText: {
    marginLeft: 8,
  },
  lastSyncMiniIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#E0EBFB",
    alignItems: "center",
    justifyContent: "center",
  },
  lastSyncMiniLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  lastSyncMiniDate: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
    marginTop: 1,
  },
  lastSyncMiniPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  // ---- Addresses: list card ----
  addrCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  addrTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  addrIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  addrBody: {
    flex: 1,
    marginLeft: 12,
  },
  addrHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addrCode: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
    flexShrink: 1,
    marginRight: 8,
  },
  addrBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addrName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
  },
  addrFull: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
    marginTop: 3,
  },
  addrDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  addrDetail: {
    fontSize: 12,
    color: "#64748B",
  },
  addrDetailValue: {
    color: "#334155",
    fontWeight: "600",
  },

  // ---- Parties: summary card ----
  partySummaryHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  partyDivider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 4,
    marginHorizontal: 10,
    backgroundColor: "#E2E8F0",
  },
  partyVerifiedIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },

  // ---- Parties: list card ----
  partyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  partyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  partyBody: {
    flex: 1,
    marginLeft: 12,
  },
  partyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partyCode: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
    flexShrink: 1,
    marginRight: 8,
  },
  partyName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
    marginBottom: 8,
  },
  partyDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partyDetailLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  partyDetailLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  partyDetailValue: {
    color: "#334155",
    fontWeight: "600",
  },
  stateBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stateBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },

  // ---- Products: list card details ----
  productDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  productDetailCol: {
    flex: 1,
    paddingRight: 8,
  },

  // ---- Shared filter dialog ----
  filterOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  filterSheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  filterIconTile: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  filterTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  filterSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
  },
  filterOptionActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  filterRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  filterRadioActive: {
    borderColor: "#2563EB",
  },
  filterRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
  },
  filterOptionText: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "600",
  },
  filterOptionTextActive: {
    color: "#1D4ED8",
  },
  filterOptionCheck: {
    marginLeft: "auto",
  },
  listItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  listItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 5,
  },
  itemCode: {
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  itemCategory: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    color: "#0369a1",
    overflow: "hidden",
  },
  categoryOil: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  categoryBeverages: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  categoryMart: {
    backgroundColor: "#f3e8ff",
    color: "#7c3aed",
  },
  addressTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: "600",
    overflow: "hidden",
  },
  billingBadge: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
  },
  shippingBadge: {
    backgroundColor: "#fce7f3",
    color: "#be185d",
  },
  itemName: {
    fontSize: 16,
    color: "#333",
    marginBottom: 5,
  },
  addressName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 3,
  },
  fullAddress: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
    lineHeight: 18,
  },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemDetail: {
    fontSize: 12,
    color: "#666",
  },
  gstText: {
    color: "#059669",
    fontWeight: "500",
  },
  logItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  logType: {
    fontWeight: "bold",
    color: "#333",
  },
  logStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: "bold",
    overflow: "hidden",
  },
  statusSuccess: {
    backgroundColor: "#d1fae5",
    color: "#059669",
  },
  statusFailed: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
  },
  logStats: {
    fontSize: 13,
    color: "#666",
    marginBottom: 5,
  },
  logTime: {
    fontSize: 12,
    color: "#999",
  },
  scheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  addButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  emptyContainer: {
    backgroundColor: "#fff",
    padding: 40,
    borderRadius: 14,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  scheduleItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  scheduleItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  scheduleName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  scheduleInfo: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  scheduleDetails: {
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  scheduleDetailText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  deleteButton: {
    alignSelf: "flex-end",
  },
  deleteButtonText: {
    color: "#dc2626",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 5,
  },
  modalInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  pickerContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  picker: {
    height: 50,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
  },
  cancelButtonText: {
    color: "#666",
    fontWeight: "bold",
  },
  createButton: {
    backgroundColor: "#3b82f6",
  },
  createButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
