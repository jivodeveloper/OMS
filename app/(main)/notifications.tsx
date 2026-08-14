import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { useAuth } from "@/src/context/AuthContext";
import { OrderNotification, orderService } from "@/src/services/order.service";
import {
  FrameworkNotification,
  frameworkNotificationService,
} from "@/src/services/frameworkNotification.service";
import { resolveNotificationRoute } from "@/src/utils/notificationRouting";
import { storage } from "@/src/utils/storage";
import { COLORS, GRADIENTS, RADIUS, SHADOWS, SPACING } from "@/src/constants/theme";
import { refreshNotifications } from "@/src/cache";

type NotificationFilter = "all" | "unread" | "read";
type DateGroup = "Today" | "Yesterday" | "Older";
// Which backend a card came from — drives read/mark-read + navigation routing.
type NotificationSource = "orders" | "framework";
// Coarse module for the optional module filter.
type NotificationModule = "orders" | "payments" | "deposits" | "other";

type NotificationMeta = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  iconBg: string;
};

type NotificationCard = {
  // Unique across both feeds (ids can collide between the two tables).
  key: string;
  id: number;
  source: NotificationSource;
  module: NotificationModule;
  message: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  iconBg: string;
  timeLabel: string;
  dateGroup: DateGroup;
  createdAt: string;
  read: boolean;
  // Orders navigation.
  orderId: number | null;
  // Generic framework navigation.
  entityType: string | null;
  entityId: number | null;
};

const normalizeText = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

const getRoleBasedDescription = (role: string | null | undefined): string => {
  const r = normalizeText(role);
  if (r === "manager")
    return "Stay updated on billing actions, order updates, and important decisions.";
  if (r === "billing")
    return "Stay updated on billing actions, order updates, and important decisions.";
  if (r === "approver")
    return "See approval requests, decisions, and follow-up updates for your orders.";
  if (r === "auditor")
    return "Monitor auditor actions, completions, and orders moving into your queue.";
  return "Live updates for order approvals, billing changes, rejections, and completions.";
};

// Derive a short title + icon/colour from the notification message. Priority
// order matters ("created and pending" -> New Order, not Pending).
const getNotificationMeta = (message: string): NotificationMeta => {
  const m = normalizeText(message);
  if (m.includes("reject"))
    return { title: "Order Rejected", icon: "close-circle", color: "#EF4444", iconBg: "#FEECEC" };
  if (m.includes("payment"))
    return { title: "Payment Received", icon: "cash-outline", color: "#7C3AED", iconBg: "#F1E9FF" };
  if (m.includes("approved") || m.includes("accepted"))
    return { title: "Order Approved", icon: "checkmark-circle", color: "#16A34A", iconBg: "#E7F8ED" };
  if (m.includes("completed"))
    return { title: "Order Completed", icon: "checkmark-done-circle", color: "#16A34A", iconBg: "#E7F8ED" };
  if (m.includes("created"))
    return { title: "New Order Received", icon: "document-text-outline", color: "#2563EB", iconBg: "#EAF1FF" };
  if (m.includes("billing"))
    return { title: "Billing Required", icon: "receipt-outline", color: "#2563EB", iconBg: "#EAF1FF" };
  if (m.includes("waiting") || m.includes("pending") || m.includes("approval") || m.includes("needs"))
    return { title: "Order Pending Approval", icon: "time-outline", color: "#F59E0B", iconBg: "#FFF4E0" };
  return { title: "Order Update", icon: "notifications-outline", color: "#2563EB", iconBg: "#EAF1FF" };
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const getDateGroup = (iso: string): DateGroup => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Older";
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  return "Older";
};

const formatNotificationTime = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const toNotificationCard = (item: OrderNotification): NotificationCard => {
  const meta = getNotificationMeta(item.message);
  return {
    key: `orders:${item.id}`,
    id: item.id,
    source: "orders",
    module: "orders",
    message: item.message,
    title: meta.title,
    icon: meta.icon,
    color: meta.color,
    iconBg: meta.iconBg,
    timeLabel: formatNotificationTime(item.created_at),
    dateGroup: getDateGroup(item.created_at),
    createdAt: item.created_at,
    read: item.is_read,
    orderId: item.order_id || null,
    entityType: null,
    entityId: null,
  };
};

// Title/icon/colour for a framework (Payment/Deposit) notification. The backend
// already sends a business `title`, so prefer it; fall back to message parsing.
const getFrameworkMeta = (item: FrameworkNotification): NotificationMeta => {
  const e = normalizeText(item.event_type);
  if (e.includes("reject"))
    return { title: item.title || "Rejected", icon: "close-circle", color: "#EF4444", iconBg: "#FEECEC" };
  if (e.includes("approved"))
    return { title: item.title || "Approved", icon: "checkmark-circle", color: "#16A34A", iconBg: "#E7F8ED" };
  if (item.module === "deposits")
    return { title: item.title || "Deposit update", icon: "wallet-outline", color: "#0EA5E9", iconBg: "#E0F2FE" };
  return { title: item.title || "Payment update", icon: "cash-outline", color: "#7C3AED", iconBg: "#F1E9FF" };
};

const toFrameworkCard = (item: FrameworkNotification): NotificationCard => {
  const meta = getFrameworkMeta(item);
  const mod: NotificationModule =
    item.module === "payments" || item.module === "deposits" ? item.module : "other";
  return {
    key: `framework:${item.id}`,
    id: item.id,
    source: "framework",
    module: mod,
    message: item.message,
    title: meta.title,
    icon: meta.icon,
    color: meta.color,
    iconBg: meta.iconBg,
    timeLabel: formatNotificationTime(item.created_at),
    dateGroup: getDateGroup(item.created_at),
    createdAt: item.created_at,
    read: item.is_read,
    orderId: null,
    entityType: item.entity_type,
    entityId: item.entity_id,
  };
};

// The module filter row is shown ONLY when the user's inbox spans >1 module.
const MODULE_FILTERS: { key: NotificationModule | "all"; label: string }[] = [
  { key: "all", label: "All modules" },
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Payments" },
  { key: "deposits", label: "Deposits" },
];

const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "Older"];

export default function NotificationsScreen() {
  const { user } = useAuth();
  const userRole = normalizeText(user?.role);
  const [filter, setFilter] = useState<NotificationFilter>("unread");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  // The filter dropdown is rendered in a Modal (not inline) so the list never
  // clips it — we anchor it under the trigger using its measured position.
  const triggerRef = useRef<any>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const openFilterMenu = useCallback(() => {
    const node = triggerRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        setMenuPos({ left: x, top: y + height + 6, width });
        setFilterMenuOpen(true);
      });
    } else {
      setFilterMenuOpen(true);
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeNotificationKey, setActiveNotificationKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [moduleFilter, setModuleFilter] = useState<NotificationModule | "all">("all");

  const loadNotifications = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "initial") => {
      try {
        if (mode === "refresh") setRefreshing(true);
        else if (mode === "initial") setLoading(true);

        setError(null);
        // Both feeds are user-scoped server-side. Either can fail independently
        // (e.g. a role with no framework access) — a failed feed must not blank
        // the other, so settle both and keep whatever succeeded.
        const [ordersRes, frameworkRes] = await Promise.allSettled([
          orderService.getNotifications(),
          frameworkNotificationService.getNotifications(),
        ]);

        const cards: NotificationCard[] = [];
        if (ordersRes.status === "fulfilled") {
          cards.push(...ordersRes.value.map(toNotificationCard));
        }
        if (frameworkRes.status === "fulfilled") {
          cards.push(...frameworkRes.value.map(toFrameworkCard));
        }
        if (ordersRes.status === "rejected" && frameworkRes.status === "rejected") {
          throw ordersRes.reason instanceof Error
            ? ordersRes.reason
            : new Error("Failed to load notifications.");
        }

        const hidden = new Set(await storage.getHiddenNotificationKeys());
        const merged = cards
          .filter((c) => !hidden.has(c.key))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
        setNotifications(merged);
      } catch (loadError) {
        console.log("Error loading notifications:", loadError);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load notifications.",
        );
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "initial") setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications]),
  );

  useEffect(() => {
    // A push just arrived, so whatever is cached is by definition out of date —
    // drop it before re-reading or the new notification wouldn't show until the
    // cache expired.
    const reloadLive = async () => {
      await refreshNotifications();
      loadNotifications("silent");
    };

    const received = Notifications.addNotificationReceivedListener(reloadLive);
    const response =
      Notifications.addNotificationResponseReceivedListener(reloadLive);
    return () => {
      received.remove();
      response.remove();
    };
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  // Which modules this user's inbox actually spans. The module filter is shown
  // ONLY when there is more than one — a single-module user needs no filter.
  const availableModules = useMemo(() => {
    const set = new Set<NotificationModule>();
    notifications.forEach((n) => set.add(n.module));
    return set;
  }, [notifications]);
  const showModuleFilter = availableModules.size > 1;

  // If the active module filter no longer applies (e.g. its rows were cleared),
  // fall back to "all" so the list can never look empty for the wrong reason.
  useEffect(() => {
    if (
      moduleFilter !== "all" &&
      !availableModules.has(moduleFilter as NotificationModule)
    ) {
      setModuleFilter("all");
    }
  }, [availableModules, moduleFilter]);

  const visibleNotifications = useMemo(() => {
    let list = notifications;
    if (moduleFilter !== "all") list = list.filter((n) => n.module === moduleFilter);
    if (filter === "unread") return list.filter((n) => !n.read);
    if (filter === "read") return list.filter((n) => n.read);
    return list;
  }, [filter, moduleFilter, notifications]);

  const sections = useMemo(() => {
    const groups: Record<DateGroup, NotificationCard[]> = {
      Today: [],
      Yesterday: [],
      Older: [],
    };
    visibleNotifications.forEach((n) => groups[n.dateGroup].push(n));
    return GROUP_ORDER.map((title) => ({ title, data: groups[title] })).filter(
      (s) => s.data.length > 0,
    );
  }, [visibleNotifications]);

  const heroDescription = useMemo(() => getRoleBasedDescription(user?.role), [user?.role]);

  useEffect(() => {
    if (userRole === "admin") router.replace("/dashboard" as never);
  }, [userRole]);

  const dismissNotification = useCallback(async (card: NotificationCard) => {
    try {
      await storage.addHiddenNotificationKeys([card.key]);
      setNotifications((cur) => cur.filter((n) => n.key !== card.key));
    } catch (e) {
      console.log("Error hiding notification:", e);
    }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    try {
      await storage.addHiddenNotificationKeys(notifications.map((n) => n.key));
      setNotifications([]);
    } catch (e) {
      console.log("Error clearing notifications:", e);
    }
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const hasOrders = unread.some((n) => n.source === "orders");
    const hasFramework = unread.some((n) => n.source === "framework");
    // Optimistic: flip everything to read, then persist in the background.
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })));
    try {
      // One request per feed that actually has unread rows. Each endpoint marks
      // every unread notification for the caller server-side.
      await Promise.all([
        hasOrders ? orderService.markAllNotificationsRead() : Promise.resolve(),
        hasFramework ? frameworkNotificationService.markAllRead() : Promise.resolve(),
      ]);
    } catch (e) {
      console.log("Error marking all read:", e);
      // Re-sync from the server so the optimistic flip cannot leave the UI
      // claiming rows are read when the write failed. "silent" so the list
      // corrects itself without flashing a spinner.
      loadNotifications("silent");
    }
  }, [notifications, loadNotifications]);

  const openNotification = useCallback(async (item: NotificationCard) => {
    try {
      setError(null);
      if (!item.read) {
        setActiveNotificationKey(item.key);
        // Mark read on the feed the card belongs to.
        if (item.source === "orders") {
          await orderService.markNotificationRead(item.id);
        } else {
          await frameworkNotificationService.markRead(item.id);
        }
        setNotifications((cur) =>
          cur.map((n) => (n.key === item.key ? { ...n, read: true } : n)),
        );
      }
      // Route through the SAME generic resolver the push deep-link uses, so a
      // tapped Order opens the order, and a Payment/Deposit opens its detail
      // screen via (entity_type, entity_id).
      const route = resolveNotificationRoute(
        {
          order_id: item.orderId,
          entity_type: item.entityType,
          entity_id: item.entityId,
        },
        "notifications",
      );
      if (route) router.push(route);
    } catch (e) {
      console.log("Error opening notification:", e);
      setError(e instanceof Error ? e.message : "Failed to update notification.");
    } finally {
      setActiveNotificationKey(null);
    }
  }, []);

  if (userRole === "admin") return null;

  const FILTERS: { key: NotificationFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "all", label: "All", icon: "funnel-outline" },
    { key: "unread", label: "Unread", icon: "mail-outline" },
    { key: "read", label: "Read", icon: "eye-outline" },
  ];
  const currentFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      {/* Hero */}
      <LinearGradient
        colors={GRADIENTS.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>
              {(user?.name || user?.username || "Your").toUpperCase()}&apos;S INBOX
            </Text>
            <Text style={styles.heroTitle}>Notifications</Text>
            <Text style={styles.heroDescription}>{heroDescription}</Text>
            <View style={styles.heroPill}>
              <Ionicons name="mail-outline" size={14} color="#fff" />
              <Text style={styles.heroPillText}>{unreadCount} unread</Text>
            </View>
          </View>
          <View style={styles.heroBellWrap}>
            <View style={styles.heroBellCircle}>
              <Ionicons name="notifications" size={40} color="rgba(255,255,255,0.96)" />
            </View>
            <View style={styles.heroBellBadge}>
              <Text style={styles.heroBellBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Fixed-size filter dropdown + actions (mark all read / clear all) */}
      <View style={styles.filterRow}>
        <View style={styles.filterDropdownWrap}>
          <TouchableOpacity
            ref={triggerRef}
            activeOpacity={0.85}
            onPress={() => (filterMenuOpen ? setFilterMenuOpen(false) : openFilterMenu())}
            style={styles.filterTrigger}
          >
            <Ionicons name={currentFilter.icon} size={15} color={COLORS.primary} />
            <Text style={styles.filterTriggerText} numberOfLines={1}>
              {currentFilter.label}
            </Text>
            <Ionicons
              name={filterMenuOpen ? "chevron-up" : "chevron-down"}
              size={15}
              color={COLORS.textSecondary}
              style={{ marginLeft: "auto" }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={markAllRead}
            disabled={unreadCount === 0}
            style={styles.actionBtn}
          >
            <Ionicons
              name="checkmark-done-outline"
              size={15}
              color={unreadCount ? COLORS.primary : COLORS.textMuted}
            />
            <Text
              style={[styles.actionText, unreadCount === 0 && styles.actionTextDisabled]}
              numberOfLines={1}
            >
              Mark all read
            </Text>
          </TouchableOpacity>
          <View style={styles.clearDivider} />
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={clearAllNotifications}
            disabled={!notifications.length}
            style={styles.actionBtn}
          >
            <Ionicons
              name="trash-outline"
              size={15}
              color={notifications.length ? COLORS.error : COLORS.textMuted}
            />
            <Text
              style={[styles.clearText, !notifications.length && styles.clearTextDisabled]}
              numberOfLines={1}
            >
              Clear all
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Module filter — shown ONLY when the inbox spans more than one module
          (e.g. a user with Orders + Payments + Deposits notifications). A
          single-module user never sees it. */}
      {showModuleFilter ? (
        <View style={styles.moduleRow}>
          {MODULE_FILTERS.filter(
            (m) => m.key === "all" || availableModules.has(m.key as NotificationModule),
          ).map((m) => {
            const active = moduleFilter === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                activeOpacity={0.85}
                onPress={() => setModuleFilter(m.key)}
                style={[styles.moduleChip, active && styles.moduleChipActive]}
              >
                <Text
                  style={[styles.moduleChipText, active && styles.moduleChipTextActive]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Error banner (dismissible) */}
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => setError(null)}
          >
            <Ionicons name="close" size={18} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderCard = (item: NotificationCard) => {
    const isUpdating = activeNotificationKey === item.key;
    return (
      <Swipeable
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={() => (
          <TouchableOpacity
            onPress={() => dismissNotification(item)}
            activeOpacity={0.85}
            style={styles.deleteAction}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.deleteActionText}>Remove</Text>
          </TouchableOpacity>
        )}
      >
        <TouchableOpacity
          onPress={() => openNotification(item)}
          activeOpacity={0.85}
          style={styles.card}
        >
          {!item.read && <View style={styles.unreadEdge} />}
          <View style={[styles.iconSquare, { backgroundColor: item.iconBg }]}>
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardMessage} numberOfLines={2}>
              {item.message}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardTime}>{item.timeLabel}</Text>
            <View style={styles.cardRightBottom}>
              {isUpdating ? (
                <ActivityIndicator size="small" color={item.color} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: item.color }]} />
              )}
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              // Explicit refresh: bypass the cached notification payload.
              await refreshNotifications();
              loadNotifications("refresh");
            }}
          />
        }
        ListHeaderComponent={renderHeader}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => renderCard(item)}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="mail-open-outline" size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === "read" ? "No read notifications" : "You're all caught up!"}
            </Text>
            <Text style={styles.emptyMessage}>
              {filter === "unread"
                ? "You've read everything. Nice work."
                : filter === "read"
                  ? "Notifications you've already read will show up here."
                  : "No new notifications at the moment. We'll notify you when something new arrives."}
            </Text>
          </View>
        }
      />

      {/* Filter dropdown menu — rendered in a Modal so the list can't clip it. */}
      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setFilterMenuOpen(false)}>
          <View
            style={[
              styles.filterMenu,
              menuPos
                ? { left: menuPos.left, top: menuPos.top, minWidth: Math.max(menuPos.width, 190) }
                : null,
            ]}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  activeOpacity={0.8}
                  onPress={() => {
                    setFilter(f.key);
                    setFilterMenuOpen(false);
                  }}
                  style={[styles.filterMenuItem, active && styles.filterMenuItemActive]}
                >
                  <Ionicons
                    name={f.icon}
                    size={16}
                    color={active ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.filterMenuText, active && styles.filterMenuTextActive]}>
                    {f.label}
                  </Text>
                  {f.key === "unread" && unreadCount > 0 && (
                    <View style={styles.segBadge}>
                      <Text style={styles.segBadgeText}>{unreadCount}</Text>
                    </View>
                  )}
                  {active && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={COLORS.primary}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  loadingText: { marginTop: SPACING.md, color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },
  contentContainer: { padding: SPACING.md, paddingBottom: SPACING.xl },
  headerBlock: { gap: SPACING.md, marginBottom: SPACING.md },

  // Hero
  heroCard: { borderRadius: RADIUS.xl, padding: SPACING.lg, overflow: "hidden", ...SHADOWS.card },
  heroRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  heroText: { flex: 1 },
  heroEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  heroDescription: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
  },
  heroPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: SPACING.md,
  },
  heroPillText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  heroBellWrap: { width: 84, height: 84, alignItems: "center", justifyContent: "center" },
  heroBellCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBellBadge: {
    position: "absolute",
    right: 2,
    bottom: 8,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 5,
    borderRadius: 13,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1E40AF",
  },
  heroBellBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // Filters
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 20,
  },
  // Module filter chips (only rendered when the inbox spans >1 module).
  moduleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moduleChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  moduleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  moduleChipText: { fontSize: 12.5, fontWeight: "700", color: COLORS.textSecondary },
  moduleChipTextActive: { color: "#fff" },
  // Filter dropdown (All / Unread / Read) — fixed size so it never resizes.
  filterDropdownWrap: { width: 120, position: "relative", zIndex: 20 },
  filterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  filterTriggerText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    flexShrink: 1,
  },
  // Action buttons (mark all read / clear all) share the row to the right.
  actionsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  actionTextDisabled: { color: COLORS.textMuted },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  filterMenu: {
    position: "absolute",
    minWidth: 190,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 4,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 12,
  },
  filterMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  filterMenuItemActive: { backgroundColor: "#EEF4FF" },
  filterMenuText: { fontSize: 13.5, fontWeight: "600", color: COLORS.textSecondary },
  filterMenuTextActive: { color: COLORS.primary, fontWeight: "700" },
  segment: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
  },
  segItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
  },
  segItemActive: { backgroundColor: COLORS.primary },
  segText: { fontSize: 12.5, fontWeight: "700", color: COLORS.textSecondary },
  segTextActive: { color: "#fff" },
  segBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  segBadgeActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  segBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },
  segBadgeTextActive: { color: "#fff" },
  clearDivider: { width: 1, height: 24, backgroundColor: COLORS.border },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6, paddingVertical: 8 },
  clearText: { color: COLORS.error, fontSize: 12.5, fontWeight: "700" },
  clearTextDisabled: { color: COLORS.textMuted },

  // Error banner
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  errorText: { flex: 1, color: COLORS.error, fontSize: 13, fontWeight: "600", lineHeight: 18 },

  // Section header
  sectionHeader: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    marginLeft: 4,
  },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    overflow: "hidden",
    ...SHADOWS.card,
  },
  unreadEdge: {
    position: "absolute",
    left: 6,
    top: "50%",
    marginTop: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  iconSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: COLORS.text, fontSize: 14.5, fontWeight: "800" },
  cardMessage: { color: COLORS.textSecondary, fontSize: 12.5, lineHeight: 18 },
  cardRight: { alignItems: "flex-end", justifyContent: "space-between", gap: 10, minHeight: 44 },
  cardTime: { color: "#64748B", fontSize: 11.5, fontWeight: "600" },
  cardRightBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },

  // Swipe delete
  deleteAction: {
    width: 96,
    marginBottom: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  deleteActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    backgroundColor: "#EEF3FF",
    borderRadius: RADIUS.xl,
    marginTop: SPACING.md,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  emptyMessage: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
});
