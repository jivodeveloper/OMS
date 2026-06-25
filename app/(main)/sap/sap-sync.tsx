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
} from "react-native";
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
  last_sync: SyncLog | null;
  active_schedules: number;
}

export default function SapSyncScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("status");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [syncingType, setSyncingType] = useState<
    "all" | "products" | "parties" | "addresses" | "branches" | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    }, [activeTab])
  );

  const getToken = async (): Promise<string | undefined> => {
    const token = await storage.getAccessToken();
    return token || undefined;
  };

  const PAGE_SIZE = 10;

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

  const handleSync = async (
    type: "all" | "products" | "parties" | "addresses" | "branches",
  ) => {
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
      const res = await api.delete(`/sap/schedules/${scheduleId}/`, token);
      if (res.success) {
        loadData(true);
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredParties = parties.filter(
    (p) =>
      p.card_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.card_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredAddresses = addresses.filter(
    (a) =>
      a.card_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.address_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.gst_number?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredBranches = branches.filter(
    (b) =>
      b.bpl_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.bpl_id?.toString().includes(searchQuery) ||
      b.category?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const renderTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabContainer}
    >
      {(
        [
          "status",
          "products",
          "parties",
          "addresses",
          "branches",
          // "schedules",
          "logs",
        ] as TabType[]
      ).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.activeTab]}
          onPress={() => {
            if (activeTab !== tab) {
              setLoading(true);
              setActiveTab(tab);
              setSearchQuery("");
            }
          }}
        >
          <Text
            style={[styles.tabText, activeTab === tab && styles.activeTabText]}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderStatus = () => (
    <ScrollView
      style={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      {/* Sync Buttons */}
      <View style={styles.syncButtonsContainer}>
        <Text style={styles.sectionTitle}>Manual Sync</Text>
        <View style={styles.syncButtons}>
          <TouchableOpacity
            style={[styles.syncButton, styles.syncAllButton]}
            onPress={() => handleSync("all")}
            disabled={syncingType !== null}
          >
            {syncingType === "all" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>Sync All</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.syncButton, styles.syncProductsButton]}
            onPress={() => handleSync("products")}
            disabled={syncingType !== null}
          >
            {syncingType === "products" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>Products</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={[styles.syncButtons, { marginTop: 10 }]}>
          <TouchableOpacity
            style={[styles.syncButton, styles.syncPartiesButton]}
            onPress={() => handleSync("parties")}
            disabled={syncingType !== null}
          >
            {syncingType === "parties" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>Parties</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.syncButton, styles.syncAddressesButton]}
            onPress={() => handleSync("addresses")}
            disabled={syncingType !== null}
          >
            {syncingType === "addresses" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>Addresses</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={[styles.syncButtons, { marginTop: 10 }]}>
          <TouchableOpacity
            style={[styles.syncButton, styles.syncBranchesButton]}
            onPress={() => handleSync("branches")}
            disabled={syncingType !== null}
          >
            {syncingType === "branches" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.syncButtonText}>🏢 Branches</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Message */}
      {message ? (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {/* Stats */}
      {status && (
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Current Data</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{status.counts.products}</Text>
              <Text style={styles.statLabel}>Products</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{status.counts.parties}</Text>
              <Text style={styles.statLabel}>Parties</Text>
            </View>
          </View>
          <View style={[styles.statsGrid, { marginTop: 10 }]}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{status.counts.addresses}</Text>
              <Text style={styles.statLabel}>Addresses</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {status.counts.branches || 0}
              </Text>
              <Text style={styles.statLabel}>Branches</Text>
            </View>
          </View>

          <View style={styles.scheduleStatus}>
            <Text style={styles.scheduleStatusText}>
              Active Schedules: {status.active_schedules}
            </Text>
          </View>

          {status.last_sync && (
            <View style={styles.lastSyncContainer}>
              <Text style={styles.sectionTitle}>Last Sync</Text>
              <Text style={styles.lastSyncText}>
                Type: {status.last_sync.sync_type} | Status:{" "}
                {status.last_sync.status}
              </Text>
              <Text style={styles.lastSyncText}>
                {formatDate(status.last_sync.completed_at)}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );

  const renderProductItem = ({ item }: { item: Product }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemHeader}>
        <Text style={styles.itemCode}>{item.item_code}</Text>
        <Text
          style={[
            styles.itemCategory,
            item.category === "OIL" && styles.categoryOil,
            item.category === "BEVERAGES" && styles.categoryBeverages,
            item.category === "MART" && styles.categoryMart,
          ]}
        >
          {item.category}
        </Text>
      </View>
      <Text style={styles.itemName}>{item.item_name}</Text>
      <View style={styles.itemDetails}>
        <Text style={styles.itemDetail}>Brand: {item.brand || "-"}</Text>
        <Text style={styles.itemDetail}>Variety: {item.variety || "-"}</Text>
      </View>
      <View style={[styles.itemDetails, { marginTop: 5 }]}>
        <Text style={styles.itemDetail}>Pack: {item.sal_pack_unit || "-"}</Text>
      </View>
    </View>
  );

  const renderProducts = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredProducts}
        renderItem={renderProductItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by code, name or brand..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Text style={styles.countText}>
              Total: {filteredProducts.length} products
            </Text>
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

  const renderPartyItem = ({ item }: { item: Party }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemHeader}>
        <Text style={styles.itemCode}>{item.card_code}</Text>
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
      <Text style={styles.itemName}>{item.card_name}</Text>
      <View style={styles.itemDetails}>
        <Text style={styles.itemDetail}>State: {item.state || "-"}</Text>
        <Text style={styles.itemDetail}>Group: {item.main_group || "-"}</Text>
      </View>
    </View>
  );

  const renderParties = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredParties}
        renderItem={renderPartyItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by code, name, or category..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Text style={styles.countText}>
              Total: {filteredParties.length} parties
            </Text>
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

  const renderAddressItem = ({ item }: { item: PartyAddress }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemHeader}>
        <Text style={styles.itemCode}>{item.card_code}</Text>
        <View style={styles.badgeContainer}>
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
      <Text style={styles.addressName}>{item.address_name}</Text>
      <Text style={styles.fullAddress} numberOfLines={2}>
        {item.full_address || "-"}
      </Text>
      <View style={styles.itemDetails}>
        <Text style={styles.itemDetail}>City: {item.city || "-"}</Text>
        <Text style={styles.itemDetail}>State: {item.state || "-"}</Text>
      </View>
      <View style={[styles.itemDetails, { marginTop: 5 }]}>
        <Text style={[styles.itemDetail, styles.gstText]}>
          GST: {item.gst_number || "-"}
        </Text>
        <Text style={styles.itemDetail}>PIN: {item.zip_code || "-"}</Text>
      </View>
    </View>
  );

  const renderAddresses = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredAddresses}
        renderItem={renderAddressItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by code, address, city, state or GST..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Text style={styles.countText}>
              Total: {filteredAddresses.length} addresses
            </Text>
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

  const renderBranchItem = ({ item }: { item: Branch }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemHeader}>
        <Text style={styles.itemCode}>BPL-{item.bpl_id}</Text>
        <Text
          style={[
            styles.itemCategory,
            item.category === "OIL" && styles.categoryOil,
            item.category === "BEVERAGES" && styles.categoryBeverages,
            item.category === "MART" && styles.categoryMart,
          ]}
        >
          {item.category}
        </Text>
      </View>
      <Text style={styles.itemName}>{item.bpl_name}</Text>
      <View style={styles.itemDetails}>
        <Text style={styles.itemDetail}>
          Status: {item.is_active ? "✅ Active" : "❌ Inactive"}
        </Text>
        <Text style={styles.itemDetail}>
          Updated: {formatDate(item.updated_at)}
        </Text>
      </View>
    </View>
  );

  const renderBranches = () => (
    <View style={styles.flatListContainer}>
      <FlatList
        data={filteredBranches}
        renderItem={renderBranchItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ID, name or category..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Text style={styles.countText}>
              Total: {filteredBranches.length} branches
            </Text>
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
        ListHeaderComponent={
          <View style={styles.scheduleHeader}>
            <Text style={styles.sectionTitle}>Sync Schedules</Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SAP Data Sync</Text>
      </View>
      <View style={styles.tabsWrapper}>{renderTabs()}</View>

      {loading && !refreshing && (activeTab === "status" || page === 1) ? (
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

      {/* <CustomDialog
        visible={dialogVisible}
        title={dialogTitle}
        message={dialogMessage}
        onClose={() => setDialogVisible(false)}
      /> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    backgroundColor: "#1e3a8a",
    padding: 20,
    paddingTop: Platform.OS === "web" ? 20 : 50,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
  },
  tabScrollContainer: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
  },
  tab: {
    paddingVertical: 1,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: "#3b82f6",
  },
  tabText: {
    color: "#666",
    fontWeight: "500",
    fontSize: 12,
  },
  activeTabText: {
    color: "#3b82f6",
    fontWeight: "bold",
  },
  content: {
    padding: 15,
  },
  flatListContainer: {
    flex: 1,
    height: 10,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  syncButtonsContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  syncButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  syncButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  syncAllButton: {
    backgroundColor: "#3b82f6",
  },
  syncProductsButton: {
    backgroundColor: "#10b981",
  },
  syncPartiesButton: {
    backgroundColor: "#f59e0b",
  },
  syncAddressesButton: {
    backgroundColor: "#8b5cf6",
  },
  syncBranchesButton: {
    backgroundColor: "#0891b2",
  },
  syncButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  messageContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  messageText: {
    fontSize: 14,
    color: "#333",
  },
  statsContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f0f9ff",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 5,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  scheduleStatus: {
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 8,
    marginTop: 15,
    marginBottom: 15,
  },
  scheduleStatusText: {
    color: "#92400e",
    fontWeight: "600",
    textAlign: "center",
  },
  lastSyncContainer: {
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    paddingTop: 15,
  },
  lastSyncText: {
    color: "#666",
    marginBottom: 5,
  },
  searchInput: {
    backgroundColor: "#fff",
    // padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  countText: {
    color: "#666",
    marginBottom: 10,
  },
  listItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
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
    borderRadius: 8,
    marginBottom: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
  tabsWrapper: {
    height: 44,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
