import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { api } from "@/src/services/api";
import { MainGroup, masterService } from "@/src/services/master.service";
import {
  OrderItemList,
  orderService,
  productService,
} from "@/src/services/order.service";
import { userService } from "@/src/services/user.service";

type ReportUser = {
  id: number;
  name: string;
  role?: string;
  role_name?: string;
  main_group__name?: string;
  main_groups?: { id: number; name: string }[];
  main_group?: { id: number; name: string } | number | null;
};

type FocFilter = "all" | "foc" | "non_foc";
type PickerType = "group" | "user" | "category" | "foc" | null;


const focOptions: { value: FocFilter; label: string }[] = [
  { value: "all", label: "All Orders" },
  { value: "foc", label: "Only FOC" },
  { value: "non_foc", label: "Without FOC" },
];

const toNumber = (value: unknown) => Number(value || 0);

const normalizeText = (value: unknown) => String(value || "").trim().toLowerCase();

const isReportUserRole = (user: ReportUser) => {
  const role = normalizeText(user.role_name || user.role);
  return !role || role === "manager" || role === "billing";
};

const formatAmount = (value: unknown) =>
  toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getDateKey = (value?: string) => {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const getTodayKey = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const getItemSchemes = (item: any) => {
  const schemes = Array.isArray(item?.schemes) ? item.schemes : [];
  if (schemes.length) return schemes;
  if (item?.scheme_name || item?.scheme_id || toNumber(item?.qty_scheme) > 0) {
    return [
      {
        scheme_name: item.scheme_name,
        scheme_qty: item.qty_scheme,
      },
    ];
  }
  return [];
};

const getSchemeQty = (scheme: any) =>
  toNumber(scheme?.scheme_qty ?? scheme?.qty_scheme ?? scheme?.qty);

const getItemTotalLtrs = (item: any) =>
  toNumber(item?.ltrs) +
  getItemSchemes(item).reduce((sum: number, scheme: any) => sum + getSchemeQty(scheme), 0);

const getUserGroupIds = (user: ReportUser, groups: MainGroup[]) => {
  const ids = new Set<number>();
  user.main_groups?.forEach((group) => ids.add(group.id));
  if (typeof user.main_group === "object" && user.main_group?.id) {
    ids.add(user.main_group.id);
  }
  if (typeof user.main_group === "number") {
    ids.add(user.main_group);
  }
  if (user.main_group__name) {
    groups
      .filter((group) => group.name === user.main_group__name)
      .forEach((group) => ids.add(group.id));
  }
  return [...ids];
};

const getOrderCreatorName = (order: any) => {
  const createdBy = order?.created_by;
  if (typeof createdBy === "string" && Number.isNaN(Number(createdBy))) {
    return createdBy;
  }

  return (
    order?.created_by_name ||
    order?.created_by_username ||
    order?.punched_by ||
    order?.manager_name ||
    order?.created_by?.name ||
    order?.created_by_user?.name ||
    ""
  );
};

const orderMatchesUser = (order: any, user?: ReportUser) => {
  if (!user) return true;

  const idCandidates = [
    typeof order?.created_by === "number" ? order.created_by : undefined,
    !Number.isNaN(Number(order?.created_by)) ? order?.created_by : undefined,
    order?.created_by_id,
    order?.user_id,
    order?.manager_id,
    order?.created_by?.id,
    order?.created_by_user?.id,
  ];

  if (idCandidates.some((value) => Number(value) === user.id)) {
    return true;
  }

  const selectedName = normalizeText(user.name);
  const nameCandidates = [
    getOrderCreatorName(order),
    order?.created_by_name,
    order?.created_by_username,
    order?.punched_by,
    order?.manager_name,
    order?.created_by?.name,
    order?.created_by_user?.name,
  ];

  const hasCreatorValue = [...idCandidates, ...nameCandidates].some(
    (value) => value !== undefined && value !== null && String(value).trim() !== "",
  );

  if (!hasCreatorValue) {
    return true;
  }

  return nameCandidates.some((value) => normalizeText(value) === selectedName);
};


const mergeOrdersById = (orderGroups: OrderItemList[][]) => {
  const ordersById = new Map<number, OrderItemList>();
  orderGroups.flat().forEach((order) => {
    if (order?.id) {
      ordersById.set(order.id, order);
    }
  });
  return Array.from(ordersById.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
};

export default function DailyReportScreen() {
  const [orders, setOrders] = useState<OrderItemList[]>([]);
  const [users, setUsers] = useState<ReportUser[]>([]);
  const [mainGroups, setMainGroups] = useState<MainGroup[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [focFilter, setFocFilter] = useState<FocFilter>("all");
  const [pickerType, setPickerType] = useState<PickerType>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(getTodayKey, []);
  const keepFiltersRef = useRef(false);

  const enrichDailyOrders = useCallback(
    async (rawOrders: OrderItemList[]) => {
      const dailyOrders = rawOrders.filter((order) => getDateKey(order.created_at) === today);
      const enrichedEntries = await Promise.all(
        dailyOrders.map(async (order) => {
          try {
            const detailResponse = await orderService.getorderdetailsbyid(order.id);
            const detail = detailResponse?.data || detailResponse || {};
            const detailItems = Array.isArray(detail.items)
              ? detail.items
              : Array.isArray(detail.order_items)
                ? detail.order_items
                : Array.isArray(detail.orderItems)
                  ? detail.orderItems
                  : order.items || [];
            const categories = Array.from(
              new Set(
                detailItems
                  .map((item: any) => String(item?.category || "").trim())
                  .filter(Boolean),
              ),
            );

            return [
              order.id,
              {
                ...order,
                ...detail,
                id: order.id,
                items: detailItems,
                categories,
                total_amount: detail.total_amount ?? order.total_amount,
                status: detail.status ?? order.status,
                status_display: detail.status_display ?? order.status_display,
                status_name: detail.status_name ?? order.status_name,
                created_by_name: detail.created_by_name ?? (order as any).created_by_name,
                is_foc: detail.is_foc ?? order.is_foc,
              },
            ] as const;
          } catch (detailError) {
            console.log(`Error loading report details for order ${order.id}:`, detailError);
            return [order.id, order] as const;
          }
        }),
      );
      const enrichedById = new Map(enrichedEntries);
      return rawOrders.map((order) => enrichedById.get(order.id) || order);
    },
    [today],
  );

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [usersResult, groupsResult, filtersResult] = await Promise.all([
        userService.users(),
        masterService.getMainGroups(),
        productService.getFilters(),
      ]);

      const allUsers: ReportUser[] = Array.isArray(usersResult?.data) ? usersResult.data : [];
      const reportUsers = allUsers.filter((u) => {
        const role = normalizeText(u.role_name || u.role);
        return role === "manager" || role === "billing" || !role;
      });

      const ordersByUser = await Promise.all(
        reportUsers.map(async (user) => {
          try {
            const result = await api.get(`/orders/ordersbyuser/${user.id}/`);
            return Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
          } catch {
            return [];
          }
        }),
      );

      const nextOrders = mergeOrdersById(ordersByUser as OrderItemList[][]);
      setOrders(await enrichDailyOrders(nextOrders));
      setUsers(allUsers);
      setMainGroups(Array.isArray(groupsResult) ? groupsResult : []);
      setAllCategories(
        Array.isArray(filtersResult?.categories)
          ? filtersResult.categories.map((c: { value: string }) => c.value).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b))
          : [],
      );
    } catch (loadError) {
      console.log("Error loading daily report:", loadError);
      setError("Failed to load daily report.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enrichDailyOrders]);

  const resetFilters = useCallback(() => {
    setSelectedGroups([]);
    setSelectedUserIds([]);
    setSelectedCategory("");
    setFocFilter("all");
    setPickerType(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();

      return () => {
        if (keepFiltersRef.current) {
          keepFiltersRef.current = false;
        } else {
          resetFilters();
        }
      };
    }, [loadData, resetFilters]),
  );

  const managerUsers = useMemo(
    () =>
      users.filter((user) => {
        if (!isReportUserRole(user)) return false;
        if (!selectedGroups.length) return false;
        const userGroups = getUserGroupIds(user, mainGroups);
        return selectedGroups.some((groupId) => userGroups.includes(groupId));
      }),
    [mainGroups, selectedGroups, users],
  );

  useEffect(() => {
    const availableUserIds = new Set(managerUsers.map((user) => user.id));
    setSelectedUserIds((current) => current.filter((userId) => availableUserIds.has(userId)));
  }, [managerUsers]);

  const selectedUsersFromAllUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [selectedUserIds, users],
  );

  const selectedUserLabel = useMemo(() => {
    if (!selectedGroups.length) return "Select Group First";
    if (!selectedUsersFromAllUsers.length) return "All Users";
    if (selectedUsersFromAllUsers.length === 1) {
      return selectedUsersFromAllUsers[0]?.name || "1 selected";
    }
    return `${selectedUsersFromAllUsers.length} selected`;
  }, [selectedGroups.length, selectedUsersFromAllUsers]);

  const selectedGroupUsers = useMemo(() => {
    if (!selectedGroups.length) return [];
    return users.filter((user) => {
      if (!isReportUserRole(user)) return false;
      const userGroups = getUserGroupIds(user, mainGroups);
      return selectedGroups.some((groupId) => userGroups.includes(groupId));
    });
  }, [mainGroups, selectedGroups, users]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>(allCategories);
    orders.forEach((order: any) => {
      order.categories?.forEach((category: string) => category && categories.add(category));
      order.items?.forEach((item: any) => item?.category && categories.add(item.category));
    });
    return [...categories].sort((a, b) => a.localeCompare(b));
  }, [allCategories, orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => getDateKey(order.created_at) === today)
      .filter((order) => {
        if (!selectedGroups.length) return true;
        return selectedGroupUsers.some((user) => orderMatchesUser(order, user));
      })
      .filter((order) => {
        if (!selectedUsersFromAllUsers.length) return true;
        return selectedUsersFromAllUsers.some((user) => orderMatchesUser(order, user));
      })
      .filter((order: any) => {
        if (!selectedCategory) return true;
        const orderCategories = Array.isArray(order.categories) ? order.categories : [];
        const selectedCategoryText = normalizeText(selectedCategory);
        return (
          orderCategories.some((category: string) => normalizeText(category) === selectedCategoryText) ||
          order.items?.some((item: any) => normalizeText(item?.category) === selectedCategoryText)
        );
      })
      .filter((order) => {
        if (focFilter === "all") return true;
        if (focFilter === "foc") return Boolean(order.is_foc);
        return !order.is_foc;
      });
  }, [
    focFilter,
    orders,
    selectedCategory,
    selectedGroupUsers,
    selectedGroups.length,
    selectedUsersFromAllUsers,
    today,
  ]);

  const totalAmount = filteredOrders.reduce(
    (sum, order) => sum + toNumber(order.total_amount),
    0,
  );
  const hasActiveFilters =
    selectedGroups.length > 0 ||
    selectedUserIds.length > 0 ||
    Boolean(selectedCategory) ||
    focFilter !== "all";

  const clearAllFilters = () => {
    resetFilters();
  };

  const toggleGroup = (groupId: number) => {
    setSelectedGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  };

  const toggleUser = (userId: number) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const openOrderDetails = (orderId: number) => {
    keepFiltersRef.current = true;
    router.push({
      pathname: "/orders/orderdetails",
      params: { orderId, from: "reports/daily-report" },
    });
  };

  const renderOrder = ({ item, index }: { item: OrderItemList; index: number }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => openOrderDetails(item.id)}
      activeOpacity={0.8}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderNumberWrap}>
          <Text style={styles.orderNumber}>{item.order_number}</Text>
          <Text style={styles.createdText}>
            Created: {formatDateTime(item.created_at)}
          </Text>
        </View>
        <View style={[styles.statusBadge, item.is_foc && styles.focStatusBadge]}>
          <Text style={[styles.statusText, item.is_foc && styles.focStatusText]}>
            {item.is_foc ? "FOC" : item.status_display || item.status_name || item.status}
          </Text>
        </View>
      </View>

      <Text style={styles.cardName}>{item.card_name}</Text>
      <Text style={styles.cardCode}>{item.card_code}</Text>

      <View style={styles.metaWrap}>
        <View style={styles.metaChip}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>Delivery: {item.delivery_date || "-"}</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="cube-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>{item.items_count || 0} items</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="pricetags-outline" size={14} color={COLORS.primary} />
          <Text style={styles.metaText}>
            Category: {Array.isArray(item.categories) && item.categories.length
              ? item.categories.slice(0, 2).join(", ")
              : "-"}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text style={styles.amountValue}>Rs {formatAmount(item.total_amount)}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => openOrderDetails(item.id)}
          activeOpacity={0.85}
        >
          <Ionicons name="eye-outline" size={18} color={COLORS.textLight} />
          <Text style={styles.actionBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.centerText}>Loading daily report...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[COLORS.primary]}
          />
        }
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.filterSection}>
          <View style={styles.filterHeaderRow}>
            <Text style={styles.filterHeaderText}>Filters</Text>
            {hasActiveFilters ? (
              <TouchableOpacity style={styles.clearFiltersButton} onPress={clearAllFilters}>
                <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.filterStrip}>
            <FilterButton
              icon="layers-outline"
              label="Main Group"
              value={
                selectedGroups.length
                  ? `${selectedGroups.length} selected`
                  : "All Groups"
              }
              active={selectedGroups.length > 0}
              onPress={() => setPickerType("group")}
            />
            <FilterButton
              icon="person-outline"
              label="User"
              value={selectedUserLabel}
              active={selectedUserIds.length > 0}
              disabled={!selectedGroups.length}
              onPress={() => setPickerType("user")}
            />
            <FilterButton
              icon="pricetags-outline"
              label="Category"
              value={selectedCategory || "All Categories"}
              active={Boolean(selectedCategory)}
              onPress={() => setPickerType("category")}
            />
            <FilterButton
              icon="gift-outline"
              label="FOC"
              value={focOptions.find((option) => option.value === focFilter)?.label || "All Orders"}
              active={focFilter !== "all"}
              onPress={() => setPickerType("foc")}
            />
          </View>
        </View>

        <View style={styles.countBar}>
          <Text style={styles.countText}>
            {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"} found
          </Text>
          <Text style={styles.countAmount}>Rs {formatAmount(totalAmount)}</Text>
        </View>

        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderOrder}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
        />

      </ScrollView>

      <PickerModal
        type={pickerType}
        mainGroups={mainGroups}
        selectedGroups={selectedGroups}
        managerUsers={managerUsers}
        selectedUserIds={selectedUserIds}
        categoryOptions={categoryOptions}
        selectedCategory={selectedCategory}
        focFilter={focFilter}
        onClose={() => setPickerType(null)}
        onToggleGroup={toggleGroup}
        onToggleUser={toggleUser}
        onSelectCategory={(category) => {
          setSelectedCategory(category);
          setPickerType(null);
        }}
        onSelectFoc={(filter) => {
          setFocFilter(filter);
          setPickerType(null);
        }}
        onToggleAllGroups={() => {
          setSelectedGroups((current) =>
            current.length === mainGroups.length ? [] : mainGroups.map((group) => group.id),
          );
        }}
        onDeselectAllGroups={() => {
          setSelectedGroups([]);
        }}
        onSelectAllUsers={() => {
          setSelectedUserIds(managerUsers.map((user) => user.id));
        }}
        onDeselectAllUsers={() => {
          setSelectedUserIds([]);
        }}
      />
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FilterButton({
  icon,
  label,
  value,
  active,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        active && styles.filterButtonActive,
        disabled && styles.filterButtonDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.filterIcon,
          active && styles.filterIconActive,
          disabled && styles.filterIconDisabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={17}
          color={disabled ? COLORS.textMuted : active ? COLORS.textLight : COLORS.primary}
        />
      </View>
      <View style={styles.filterTextWrap}>
        <Text
          style={[
            styles.filterLabel,
            active && styles.filterLabelActive,
            disabled && styles.filterTextDisabled,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.filterValue,
            active && styles.filterValueActive,
            disabled && styles.filterTextDisabled,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PickerModal({
  type,
  mainGroups,
  selectedGroups,
  managerUsers,
  selectedUserIds,
  categoryOptions,
  selectedCategory,
  focFilter,
  onClose,
  onToggleGroup,
  onToggleUser,
  onSelectCategory,
  onSelectFoc,
  onToggleAllGroups,
  onDeselectAllGroups,
  onSelectAllUsers,
  onDeselectAllUsers,
}: {
  type: PickerType;
  mainGroups: MainGroup[];
  selectedGroups: number[];
  managerUsers: ReportUser[];
  selectedUserIds: number[];
  categoryOptions: string[];
  selectedCategory: string;
  focFilter: FocFilter;
  onClose: () => void;
  onToggleGroup: (groupId: number) => void;
  onToggleUser: (userId: number) => void;
  onSelectCategory: (category: string) => void;
  onSelectFoc: (filter: FocFilter) => void;
  onToggleAllGroups: () => void;
  onDeselectAllGroups: () => void;
  onSelectAllUsers: () => void;
  onDeselectAllUsers: () => void;
}) {
  const title =
    type === "group"
      ? "Main Group"
      : type === "user"
        ? "User"
        : type === "category"
          ? "Category"
          : "FOC";

  return (
    <Modal transparent animationType="fade" visible={Boolean(type)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.pickerList}>
            {type === "group" ? (
              <>
                <PickerRow
                  label="Select All"
                  selected={mainGroups.length > 0 && selectedGroups.length === mainGroups.length}
                  onPress={onToggleAllGroups}
                  multi
                  strong
                />
                {selectedGroups.length > 0 ? (
                  <PickerRow
                    label="Deselect All"
                    selected={false}
                    onPress={onDeselectAllGroups}
                    danger
                  />
                ) : null}
                {mainGroups.map((group) => (
                  <PickerRow
                    key={group.id}
                    label={group.name}
                    selected={selectedGroups.includes(group.id)}
                    onPress={() => onToggleGroup(group.id)}
                    multi
                  />
                ))}
                {!mainGroups.length ? <Text style={styles.emptyPicker}>No groups found</Text> : null}
              </>
            ) : null}

            {type === "user" ? (
              <>
                {!selectedGroups.length ? (
                  <Text style={styles.emptyPicker}>Select main group first</Text>
                ) : (
                  <>
                <PickerRow
                  label="Select All"
                  selected={managerUsers.length > 0 && selectedUserIds.length === managerUsers.length}
                  onPress={onSelectAllUsers}
                  multi
                  strong
                />
                {selectedUserIds.length > 0 ? (
                  <PickerRow
                    label="All Users"
                    selected={false}
                    onPress={onDeselectAllUsers}
                    danger
                  />
                ) : null}
                {managerUsers.map((user) => (
                  <PickerRow
                    key={user.id}
                    label={user.name}
                    selected={selectedUserIds.includes(user.id)}
                    onPress={() => onToggleUser(user.id)}
                    multi
                  />
                ))}
                {!managerUsers.length ? <Text style={styles.emptyPicker}>No users found</Text> : null}
                  </>
                )}
              </>
            ) : null}

            {type === "category" ? (
              <>
                <PickerRow
                  label="All Categories"
                  selected={!selectedCategory}
                  onPress={() => onSelectCategory("")}
                />
                {categoryOptions.map((category) => (
                  <PickerRow
                    key={category}
                    label={category}
                    selected={selectedCategory === category}
                    onPress={() => onSelectCategory(category)}
                  />
                ))}
              </>
            ) : null}

            {type === "foc"
              ? focOptions.map((option) => (
                  <PickerRow
                    key={option.value}
                    label={option.label}
                    selected={focFilter === option.value}
                    onPress={() => onSelectFoc(option.value)}
                  />
                ))
              : null}
          </ScrollView>

          {type === "group" || type === "user" ? (
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PickerRow({
  label,
  selected,
  onPress,
  multi,
  strong,
  danger,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.pickerRow} onPress={onPress}>
      <Text
        style={[
          styles.pickerRowText,
          strong && styles.strongPickerRowText,
          danger && styles.dangerPickerRowText,
        ]}
      >
        {label}
      </Text>
      <Ionicons
        name={
          danger
            ? "close-circle-outline"
            : selected
              ? multi
                ? "checkbox"
                : "radio-button-on"
              : multi
                ? "square-outline"
                : "radio-button-off"
        }
        size={21}
        color={danger ? COLORS.error : selected ? COLORS.primary : COLORS.textMuted}
      />
    </TouchableOpacity>
  );
}

function OrderDetailsModal({
  order,
  loading,
  onClose,
}: {
  order: any | null;
  loading: boolean;
  onClose: () => void;
}) {
  const items = order?.items || order?.order_items || order?.orderItems || [];
  const subtotal = items.reduce((sum: number, item: any) => sum + toNumber(item?.total), 0);
  const tax = items.reduce(
    (sum: number, item: any) => sum + (toNumber(item?.total) * toNumber(item?.tax_rate)) / 100,
    0,
  );
  const totalLtrs = items.reduce((sum: number, item: any) => sum + getItemTotalLtrs(item), 0);

  return (
    <Modal transparent animationType="slide" visible={loading || Boolean(order)} onRequestClose={onClose}>
      <View style={styles.detailsOverlay}>
        <View style={styles.detailsCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Order Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.detailsLoader}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.centerText}>Loading details...</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsOrderNo}>{order?.order_number}</Text>
                {order?.is_foc ? <Text style={styles.detailFocText}>FOC ORDER</Text> : null}
                <Text style={styles.detailsParty}>{order?.card_name}</Text>
              </View>

              <DetailRow label="Created At" value={formatDateTime(order?.created_at)} />
              <DetailRow label="Delivery Date" value={order?.delivery_date || "-"} />
              <DetailRow label="PO Number" value={order?.po_number || "-"} />
              <DetailRow label="Card Code" value={order?.card_code || "-"} />
              <DetailRow label="Bill To" value={order?.bill_to_address || "-"} />
              <DetailRow label="Ship To" value={order?.ship_to_address || "-"} />

              <Text style={styles.itemsTitle}>Items ({items.length})</Text>
              {items.map((item: any, index: number) => (
                <View style={styles.itemCard} key={`${item?.id || item?.item_code}-${index}`}>
                  <Text style={styles.itemName}>{item?.item_name}</Text>
                  <Text style={styles.itemCode}>{item?.item_code}</Text>
                  <View style={styles.itemGrid}>
                    <DetailRow label="Category" value={item?.category || "-"} compact />
                    <DetailRow label="Qty" value={String(item?.qty ?? "-")} compact />
                    <DetailRow label="Pcs" value={String(item?.pcs ?? "-")} compact />
                    <DetailRow label="Boxes" value={String(item?.boxes ?? "-")} compact />
                    <DetailRow label="Ltrs" value={String(item?.ltrs ?? "-")} compact />
                    <DetailRow label="Total Ltrs" value={formatAmount(getItemTotalLtrs(item))} compact />
                    <DetailRow label="Price List (Basic)" value={formatAmount(item?.price_list_basic)} compact />
                    <DetailRow label="Basic Price" value={formatAmount(item?.basic_price)} compact />
                    <DetailRow label="Tax %" value={formatAmount(item?.tax_rate)} compact />
                    <DetailRow label="Amount" value={`Rs ${formatAmount(item?.total)}`} compact />
                  </View>
                  {getItemSchemes(item).map((scheme: any, schemeIndex: number) => (
                    <View style={styles.schemeBadge} key={`${scheme?.scheme_name}-${schemeIndex}`}>
                      <Ionicons name="pricetag-outline" size={13} color={COLORS.primary} />
                      <Text style={styles.schemeText}>
                        {scheme?.scheme_name || "Scheme"} - Qty {formatAmount(getSchemeQty(scheme))}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}

              <View style={styles.totalBox}>
                <DetailRow label="Total Ltrs" value={formatAmount(totalLtrs)} />
                <DetailRow label="Subtotal" value={`Rs ${formatAmount(subtotal)}`} />
                <DetailRow label="Tax" value={`Rs ${formatAmount(tax)}`} />
                <DetailRow label="Grand Total" value={`Rs ${formatAmount(subtotal + tax)}`} strong />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  compact,
  strong,
}: {
  label: string;
  value: string;
  compact?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={[styles.detailRow, compact && styles.compactDetailRow]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.strongValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: SPACING.xl,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  centerText: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.primaryDarker,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  summaryLabel: {
    marginTop: 3,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  errorText: {
    marginHorizontal: 16,
    marginVertical: 8,
    color: COLORS.error,
    fontWeight: "600",
  },
  filterSection: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  filterHeaderText: {
    color: COLORS.primaryDarker,
    fontSize: 14,
    fontWeight: "800",
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.errorLight,
  },
  clearFiltersText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: "800",
  },
  filterStrip: {
    flexDirection: "row",
    gap: 6,
  },
  filterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  filterButtonDisabled: {
    opacity: 0.6,
  },
  filterButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
  },
  filterIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
    marginBottom: 5,
  },
  filterIconDisabled: {
    backgroundColor: COLORS.background,
  },
  filterIconActive: {
    backgroundColor: COLORS.primary,
  },
  filterTextWrap: {
    width: "100%",
    minWidth: 0,
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  filterLabelActive: {
    color: COLORS.primaryDark,
  },
  filterValue: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "700",
    textAlign: "center",
  },
  filterValueActive: {
    color: COLORS.primaryDarker,
    fontWeight: "800",
  },
  filterTextDisabled: {
    color: COLORS.textMuted,
  },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
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
  focStatusBadge: {
    backgroundColor: COLORS.warningLight,
  },
  focStatusText: {
    color: COLORS.warning,
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
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  actionBtnText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600",
  },
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  countText: {
    color: COLORS.textLight,
    fontWeight: "600",
    fontSize: 13,
  },
  countAmount: {
    color: COLORS.textLight,
    fontWeight: "800",
    fontSize: 13,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.xl,
  },
  emptyText: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    padding: SPACING.md,
  },
  pickerCard: {
    maxHeight: "75%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primaryDarker,
  },
  pickerList: {
    maxHeight: 430,
  },
  pickerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pickerRowText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  strongPickerRowText: {
    color: COLORS.primaryDark,
    fontWeight: "800",
  },
  dangerPickerRowText: {
    color: COLORS.error,
    fontWeight: "800",
  },
  emptyPicker: {
    paddingVertical: SPACING.lg,
    textAlign: "center",
    color: COLORS.textSecondary,
  },
  doneButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  doneButtonText: {
    color: COLORS.textLight,
    fontWeight: "800",
  },
  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  detailsCard: {
    height: "88%",
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  detailsLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsHeader: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  detailsOrderNo: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  detailFocText: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    color: COLORS.warning,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  detailsParty: {
    marginTop: SPACING.sm,
    color: COLORS.text,
    fontWeight: "700",
  },
  detailRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  compactDetailRow: {
    width: "50%",
    paddingRight: SPACING.sm,
  },
  detailLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  detailValue: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  strongValue: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: "900",
  },
  itemsTitle: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    color: COLORS.primaryDarker,
    fontSize: 17,
    fontWeight: "800",
  },
  itemCard: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  itemName: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
  },
  itemCode: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  itemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: SPACING.sm,
  },
  schemeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  schemeText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  totalBox: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
});
