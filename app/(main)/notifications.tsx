import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
 ActivityIndicator,
 FlatList,
 RefreshControl,
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
import {
 OrderNotification,
 orderService,
} from "@/src/services/order.service";
import { storage } from "@/src/utils/storage";
import {
 COLORS,
 GRADIENTS,
 RADIUS,
 SHADOWS,
 SPACING,
} from "@/src/constants/theme";

type NotificationFilter = "all" | "unread";
type NotificationTone = "info" | "success" | "warning";

type NotificationCard = {
 id: number;
 message: string;
 timeLabel: string;
 tone: NotificationTone;
 read: boolean;
 orderId: number | null;
};

const normalizeText = (value: string | null | undefined) =>
 String(value || "").trim().toLowerCase();

const getRoleBasedDescription = (role: string | null | undefined): string => {
 const normalizedRole = normalizeText(role);

 

 if (normalizedRole === "manager") {
 return "Stay updated on approvals, rejections, and progress for the orders you monitor.";
 }

 if (normalizedRole === "billing") {
 return "Review billing actions, pending decisions, and order updates that need your attention.";
 }

 if (normalizedRole === "approver") {
 return "See approval requests, decisions, and follow-up updates for the orders assigned to you.";
 }

 if (normalizedRole === "auditor") {
 return "Monitor auditor actions, completions, and order updates that move into your queue.";
 }

 return "Live updates for order approvals, billing changes, rejections, and completions.";
};

const getNotificationTone = (message: string): NotificationTone => {
 const normalizedMessage = normalizeText(message);

 if (normalizedMessage.includes("reject")) {
 return "warning";
 }

 if (
 normalizedMessage.includes("approved") ||
 normalizedMessage.includes("completed") ||
 normalizedMessage.includes("accepted")
 ) {
 return "success";
 }

 return "info";
};

const formatNotificationTime = (value: string): string => {
 const parsedDate = new Date(value);
 if (Number.isNaN(parsedDate.getTime())) return value;

 const now = new Date();
 const diffMs = now.getTime() - parsedDate.getTime();
 const diffMinutes = Math.floor(diffMs / (1000 * 60));
 const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
 const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

 if (diffMinutes < 1) return "Just now";
 if (diffMinutes < 60) return `${diffMinutes} min ago`;
 if (diffHours < 24) return `${diffHours} hr ago`;
 if (diffDays === 1) return "Yesterday";
 if (diffDays < 7) return `${diffDays} days ago`;

 return parsedDate.toLocaleString("en-IN", {
 day: "2-digit",
 month: "short",
 year: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 });
};

const toNotificationCard = (item: OrderNotification): NotificationCard => ({
 id: item.id,
 message: item.message,
 timeLabel: formatNotificationTime(item.created_at),
 tone: getNotificationTone(item.message),
 read: item.is_read,
 orderId: item.order_id || null,
});

export default function NotificationsScreen() {
 const { user } = useAuth();
 const userRole = normalizeText(user?.role);
 const [filter, setFilter] = useState<NotificationFilter>("all");
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [markingAll, setMarkingAll] = useState(false);
 const [activeNotificationId, setActiveNotificationId] = useState<number | null>(
 null,
 );
 const [error, setError] = useState<string | null>(null);
 const [notifications, setNotifications] = useState<NotificationCard[]>([]);

 const loadNotifications = useCallback(async (mode: "initial" | "refresh" | "silent" = "initial") => {
 try {
 if (mode === "refresh") {
 setRefreshing(true);
 } else if (mode === "initial") {
 setLoading(true);
 }

 setError(null);
 const response = await orderService.getNotifications();
 const hiddenNotificationIds = await storage.getHiddenNotificationIds();
 const hiddenNotificationIdSet = new Set(hiddenNotificationIds);
 setNotifications(
 response
 .filter((item) => !hiddenNotificationIdSet.has(item.id))
 .map(toNotificationCard),
 );
 } catch (loadError) {
 console.log("Error loading notifications:", loadError);
 setError(
 loadError instanceof Error
 ? loadError.message
 : "Failed to load notifications.",
 );
 } finally {
 if (mode === "refresh") {
 setRefreshing(false);
 } else if (mode === "initial") {
 setLoading(false);
 }
 }
 }, []);

 useFocusEffect(
 useCallback(() => {
 loadNotifications();
 }, [loadNotifications]),
 );

 useEffect(() => {
 const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
 loadNotifications("silent");
 });

 const responseSubscription =
 Notifications.addNotificationResponseReceivedListener(() => {
 loadNotifications("silent");
 });

 return () => {
 receivedSubscription.remove();
 responseSubscription.remove();
 };
 }, [loadNotifications]);

 const unreadCount = useMemo(
 () => notifications.filter((item) => !item.read).length,
 [notifications],
 );

 const visibleNotifications = useMemo(
 () =>
 filter === "unread"
 ? notifications.filter((item) => !item.read)
 : notifications,
 [filter, notifications],
 );

 const heroDescription = useMemo(
 () => getRoleBasedDescription(user?.role),
 [user?.role],
 );

 useEffect(() => {
 if (userRole === "admin") {
 router.replace("/dashboard" as never);
 }
 }, [userRole]);

 const markAllAsRead = useCallback(async () => {
 if (!unreadCount || markingAll) return;

 try {
 setMarkingAll(true);
 await orderService.markAllNotificationsRead();
 setNotifications((current) =>
 current.map((item) => ({
 ...item,
 read: true,
 })),
 );
 } catch (markError) {
 console.log("Error marking all notifications as read:", markError);
 setError(
 markError instanceof Error
 ? markError.message
 : "Failed to mark notifications as read.",
 );
 } finally {
 setMarkingAll(false);
 }
 }, [markingAll, unreadCount]);

 const dismissNotification = useCallback(async (notificationId: number) => {
 try {
 await storage.addHiddenNotificationIds([notificationId]);
 setNotifications((current) =>
 current.filter((item) => item.id !== notificationId),
 );
 } catch (dismissError) {
 console.log("Error hiding notification:", dismissError);
 }
 }, []);

 const clearAllNotifications = useCallback(async () => {
 try {
 await storage.addHiddenNotificationIds(
 notifications.map((item) => item.id),
 );
 setNotifications([]);
 } catch (clearError) {
 console.log("Error clearing notifications:", clearError);
 }
 }, [notifications]);

 const openNotification = useCallback(async (item: NotificationCard) => {
 try {
 setError(null);

 if (!item.read) {
 setActiveNotificationId(item.id);
 await orderService.markNotificationRead(item.id);
 setNotifications((current) =>
 current.map((currentItem) =>
 currentItem.id === item.id
 ? {
 ...currentItem,
 read: true,
 }
 : currentItem,
 ),
 );
 }

 if (item.orderId) {
 router.push({
 pathname: "/orders/orderdetails",
 params: {
 orderId: String(item.orderId),
 from: "notifications",
 },
 });
 }
 } catch (markError) {
 console.log("Error opening notification:", markError);
 setError(
 markError instanceof Error
 ? markError.message
 : "Failed to update notification.",
 );
 } finally {
 setActiveNotificationId(null);
 }
 }, []);

 if (userRole === "admin") {
 return null;
 }

 const renderHeader = () => (
 <View style={styles.headerBlock}>
 <LinearGradient
 colors={GRADIENTS.primary}
 start={{ x: 0, y: 0 }}
 end={{ x: 1, y: 1 }}
 style={styles.heroCard}
 >
 <View style={styles.heroTopRow}>
 <View style={styles.heroTextWrap}>
 <Text style={styles.heroEyebrow}>
 {user?.name ? `${user.name}'s inbox` : "Inbox"}
 </Text>
 <Text style={styles.heroTitle}>Notifications</Text>
 </View>
 <View style={styles.heroBadge}>
 <Text style={styles.heroBadgeText}>{unreadCount} unread</Text>
 </View>
 </View>
 <Text style={styles.heroDescription}>
 {heroDescription}
 </Text>
 </LinearGradient>

 <View style={styles.filterRow}>
 <View style={styles.filterGroup}>
 <TouchableOpacity
 onPress={() => setFilter("all")}
 style={[
 styles.filterChip,
 filter === "all" && styles.filterChipActive,
 ]}
 >
 <Text
 style={[
 styles.filterChipText,
 filter === "all" && styles.filterChipTextActive,
 ]}
 >
 All
 </Text>
 </TouchableOpacity>
 <TouchableOpacity
 onPress={() => setFilter("unread")}
 style={[
 styles.filterChip,
 filter === "unread" && styles.filterChipActive,
 ]}
 >
 <Text
 style={[
 styles.filterChipText,
 filter === "unread" && styles.filterChipTextActive,
 ]}
 >
 Unread
 </Text>
 </TouchableOpacity>
 </View>

 <View style={styles.actionsGroup}>
 <TouchableOpacity
 onPress={clearAllNotifications}
 style={styles.secondaryAction}
 disabled={!notifications.length}
 >
 <Text
 style={[
 styles.secondaryActionText,
 !notifications.length && styles.secondaryActionTextDisabled,
 ]}
 >
 Clear all
 </Text>
 </TouchableOpacity>
 <TouchableOpacity
 onPress={markAllAsRead}
 style={styles.secondaryAction}
 disabled={!unreadCount || markingAll}
 >
 <Text
 style={[
 styles.secondaryActionText,
 (!unreadCount || markingAll) && styles.secondaryActionTextDisabled,
 ]}
 >
 {markingAll ? "Updating..." : "Mark all read"}
 </Text>
 </TouchableOpacity>
 </View>
 </View>

 {error ? (
 <View style={styles.errorBanner}>
 <Ionicons
 name="alert-circle-outline"
 size={18}
 color={COLORS.error}
 />
 <Text style={styles.errorText}>{error}</Text>
 </View>
 ) : null}
 </View>
 );

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
 <FlatList
 data={visibleNotifications}
 keyExtractor={(item) => String(item.id)}
 showsVerticalScrollIndicator={false}
 contentContainerStyle={styles.contentContainer}
 refreshControl={
 <RefreshControl
 refreshing={refreshing}
 onRefresh={() => loadNotifications("refresh")}
 />
 }
 ListHeaderComponent={renderHeader}
 ListEmptyComponent={
 <View style={styles.emptyState}>
 <View style={styles.emptyIconWrap}>
 <Ionicons
 name="notifications-off-outline"
 size={28}
 color={COLORS.textSecondary}
 />
 </View>
 <Text style={styles.emptyTitle}>No notifications here</Text>
 <Text style={styles.emptyMessage}>
 {filter === "unread"
 ? "You have already read everything."
 : "New order updates from OMS_Backend will appear here."}
 </Text>
 </View>
 }
 renderItem={({ item }) => {
 const isUpdating = activeNotificationId === item.id;

 return (
 <Swipeable
 overshootRight={false}
 rightThreshold={40}
 renderRightActions={() => (
 <TouchableOpacity
 onPress={() => dismissNotification(item.id)}
 activeOpacity={0.85}
 style={styles.deleteAction}
 >
 <Ionicons
 name="trash-outline"
 size={18}
 color={COLORS.textLight}
 />
 <Text style={styles.deleteActionText}>Remove</Text>
 </TouchableOpacity>
 )}
 >
 <TouchableOpacity
 onPress={() => openNotification(item)}
 activeOpacity={0.9}
 style={[styles.card, !item.read && styles.unreadCard]}
 >
 <View style={styles.cardBody}>
 <View style={styles.cardHeader}>
 <Text style={styles.cardTitle}>{item.message}</Text>
 {!item.read ? <View style={styles.unreadDot} /> : null}
 </View>
 <View style={styles.cardFooter}>
 <View style={styles.cardMetaRow}>
 {isUpdating ? (
 <ActivityIndicator size="small" color={COLORS.primary} />
 ) : null}
 <Text style={styles.cardMeta}>{item.timeLabel}</Text>
 </View>
 </View>
 </View>
 </TouchableOpacity>
 </Swipeable>
 );
 }}
 />
 </View>
 );
}

const styles = StyleSheet.create({
 container: {
 flex: 1,
 backgroundColor: COLORS.background,
 },
 loadingContainer: {
 flex: 1,
 alignItems: "center",
 justifyContent: "center",
 backgroundColor: COLORS.background,
 paddingHorizontal: SPACING.lg,
 },
 loadingText: {
 marginTop: SPACING.md,
 color: COLORS.textSecondary,
 fontSize: 14,
 fontWeight: "600",
 },
 contentContainer: {
 padding: SPACING.md,
 paddingBottom: SPACING.xl,
 gap: SPACING.md,
 },
 headerBlock: {
 gap: SPACING.md,
 },
 heroCard: {
 borderRadius: RADIUS.xl,
 padding: SPACING.lg,
 ...SHADOWS.card,
 },
 heroTopRow: {
 flexDirection: "row",
 justifyContent: "space-between",
 alignItems: "flex-start",
 gap: SPACING.md,
 },
 heroTextWrap: {
 flex: 1,
 },
 heroEyebrow: {
 color: "rgba(255,255,255,0.72)",
 fontSize: 12,
 fontWeight: "600",
 textTransform: "uppercase",
 letterSpacing: 1,
 },
 heroTitle: {
 color: COLORS.textLight,
 fontSize: 26,
 fontWeight: "800",
 marginTop: 4,
 },
 heroBadge: {
 backgroundColor: "rgba(255,255,255,0.16)",
 borderRadius: RADIUS.full,
 paddingHorizontal: 12,
 paddingVertical: 8,
 },
 heroBadgeText: {
 color: COLORS.textLight,
 fontSize: 12,
 fontWeight: "700",
 },
 heroDescription: {
 color: "rgba(255,255,255,0.88)",
 fontSize: 14,
 lineHeight: 21,
 marginTop: SPACING.md,
 },
 filterRow: {
 flexDirection: "row",
 alignItems: "center",
 justifyContent: "space-between",
 gap: SPACING.sm,
 },
 filterGroup: {
 flexDirection: "row",
 gap: SPACING.sm,
 },
 actionsGroup: {
 flexDirection: "row",
 alignItems: "center",
 gap: SPACING.md,
 },
 filterChip: {
 backgroundColor: COLORS.surface,
 borderRadius: RADIUS.full,
 borderWidth: 1,
 borderColor: COLORS.border,
 paddingHorizontal: 14,
 paddingVertical: 10,
 },
 filterChipActive: {
 backgroundColor: COLORS.primary,
 borderColor: COLORS.primary,
 },
 filterChipText: {
 color: COLORS.textSecondary,
 fontSize: 13,
 fontWeight: "600",
 },
 filterChipTextActive: {
 color: COLORS.textLight,
 },
 secondaryAction: {
 paddingHorizontal: 4,
 paddingVertical: 6,
 },
 secondaryActionText: {
 color: COLORS.primary,
 fontSize: 13,
 fontWeight: "700",
 },
 secondaryActionTextDisabled: {
 color: COLORS.textMuted,
 },
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
 errorText: {
 flex: 1,
 color: COLORS.error,
 fontSize: 13,
 fontWeight: "600",
 },
 card: {
 flexDirection: "row",
 gap: SPACING.md,
 backgroundColor: COLORS.surface,
 borderRadius: RADIUS.lg,
 padding: SPACING.md,
 borderWidth: 1,
 borderColor: COLORS.border,
 ...SHADOWS.card,
 },
 unreadCard: {
 borderColor: COLORS.borderBlue,
 backgroundColor: COLORS.primaryLighter,
 },
 cardBody: {
 flex: 1,
 gap: 10,
 },
 cardHeader: {
 flexDirection: "row",
 alignItems: "flex-start",
 gap: 8,
 },
 cardTitle: {
 flex: 1,
 color: COLORS.text,
 fontSize: 14,
 lineHeight: 21,
 fontWeight: "600",
 },
 unreadDot: {
 width: 10,
 height: 10,
 borderRadius: RADIUS.full,
 backgroundColor: COLORS.primary,
 },
 cardMessage: {
 color: COLORS.textSecondary,
 fontSize: 13,
 lineHeight: 20,
 },
 cardFooter: {
 flexDirection: "row",
 justifyContent: "space-between",
 alignItems: "center",
 gap: SPACING.md,
 },
 cardMetaRow: {
 flexDirection: "row",
 alignItems: "center",
 gap: 6,
 },
 cardMeta: {
 color: COLORS.textSecondary,
 fontSize: 12,
 fontWeight: "600",
 },
 deleteAction: {
 width: 96,
 marginBottom: SPACING.md,
 borderRadius: RADIUS.lg,
 backgroundColor: COLORS.error,
 alignItems: "center",
 justifyContent: "center",
 gap: 6,
 },
 deleteActionText: {
 color: COLORS.textLight,
 fontSize: 12,
 fontWeight: "700",
 },
 emptyState: {
 alignItems: "center",
 justifyContent: "center",
 paddingVertical: SPACING.xxl,
 paddingHorizontal: SPACING.lg,
 backgroundColor: COLORS.surface,
 borderRadius: RADIUS.xl,
 borderWidth: 1,
 borderColor: COLORS.border,
 ...SHADOWS.card,
 },
 emptyIconWrap: {
 width: 56,
 height: 56,
 borderRadius: 18,
 backgroundColor: COLORS.inputBackground,
 alignItems: "center",
 justifyContent: "center",
 marginBottom: SPACING.md,
 },
 emptyTitle: {
 color: COLORS.text,
 fontSize: 18,
 fontWeight: "700",
 },
 emptyMessage: {
 color: COLORS.textSecondary,
 fontSize: 13,
 lineHeight: 20,
 marginTop: 8,
 textAlign: "center",
 },
});
