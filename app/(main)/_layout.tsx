import React, { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  AppState,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import CustomDrawer from "@/src/components/common/CustomDrawer";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS } from "@/src/constants/theme";
import { orderService } from "@/src/services/order.service";
import { notificationService } from "@/src/services/notification.service";
import { storage } from "@/src/utils/storage";
import { screensFromExtraPages, SCREEN_ROLES } from "@/src/constants/pages";
import {
  getNotificationDedupeKey,
  originScreenForRole,
  resolveNotificationRoute,
  type OMSNotificationData,
} from "@/src/utils/notificationRouting";
import { shouldShowPermissionPrompt } from "@/src/utils/notificationPermission";
import { isNotificationSuppressed } from "@/src/utils/notificationGate";
import { useHeaderRefresh } from "@/src/utils/headerRefresh";
import { refreshLiveData, refreshNotifications } from "@/src/cache";
import NotificationPermissionModal from "@/src/components/NotificationPermissionModal";
import BottomBar from "@/src/components/common/BottomBar";

const HEADER_ICON_HIT_SLOP = { top: 12, right: 12, bottom: 12, left: 12 };

export default function MainLayout() {
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const userRole = user?.role?.toLowerCase() || "";
  const grantedScreens = screensFromExtraPages(user?.extra_pages || []);
  // A screen (e.g. Create Order) can publish a refresh action; when present it
  // renders as a header button just before the notification bell.
  const headerRefresh = useHeaderRefresh();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);

  const loadUnreadNotificationCount = useCallback(async () => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      const notifications = await orderService.getNotifications();
      const hiddenNotificationIds = await storage.getHiddenNotificationIds();
      const hiddenNotificationIdSet = new Set(hiddenNotificationIds);
      setUnreadNotificationCount(
        notifications.filter(
          (item) => !item.is_read && !hiddenNotificationIdSet.has(item.id),
        ).length,
      );
    } catch (error) {
      console.log("Error loading unread notification count:", error);
    }
  }, [user]);

  useEffect(() => {
    loadUnreadNotificationCount();
  }, [loadUnreadNotificationCount, pathname]);

  useEffect(() => {
    if (!user) {
      return;
    }

    // Make sure the Android channel exists with production settings before any
    // push arrives, then register this device's token.
    notificationService.ensureAndroidChannel();
    notificationService.registerDeviceToken();

    // Keep the backend token current if Expo rotates it while logged in.
    const tokenRefreshSubscription =
      notificationService.subscribeToTokenRefresh();

    return () => {
      tokenRefreshSubscription.remove();
    };
  }, [user]);

  // Custom "explain first" permission prompt. Never fires during splash/login;
  // waits ~2.5s after the user reaches Home, and only shows when appropriate
  // (never asked, or 7 days since the last dismissal). If the OS permission is
  // already granted, we just record it and stay silent (existing users).
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [{ status, canAskAgain }, promptState] = await Promise.all([
          notificationService.getPermissionStatus(),
          storage.getNotificationPromptState(),
        ]);
        if (cancelled) return;

        if (status === "granted") {
          // Already granted (incl. existing users) — record and never prompt.
          if (promptState.status !== "granted") {
            await storage.saveNotificationPromptState({ status: "granted" });
          }
          return;
        }

        if (shouldShowPermissionPrompt(status, canAskAgain, promptState)) {
          setShowPermissionModal(true);
        }
      } catch (error) {
        console.log("Permission prompt check failed:", error);
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const handleAllowNotifications = useCallback(async () => {
    setPermissionSubmitting(true);
    try {
      const status = await notificationService.requestPermissionAndRegister();
      await storage.saveNotificationPromptState({
        status: status === "granted" ? "granted" : "denied",
        lastPromptAt: Date.now(),
      });
    } catch (error) {
      console.log("Permission request failed:", error);
    } finally {
      setPermissionSubmitting(false);
      setShowPermissionModal(false);
    }
  }, []);

  const handleDismissPermission = useCallback(async () => {
    setShowPermissionModal(false);
    try {
      const current = await storage.getNotificationPromptState();
      await storage.saveNotificationPromptState({
        status: "dismissed",
        lastPromptAt: Date.now(),
        dismissCount: current.dismissCount + 1,
      });
    } catch (error) {
      console.log("Failed to persist permission dismissal:", error);
    }
  }, []);

  // Re-pull the profile (incl. extra_pages grants) when the app returns to the
  // foreground, so permissions granted elsewhere — e.g. from the web admin —
  // show up without the user logging out and back in.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshUser();
        // Drop cached order/notification payloads on foreground so the screen
        // the user lands on re-fetches instead of showing what was on screen
        // when they switched away.
        void refreshLiveData();
        loadUnreadNotificationCount();
      }
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also refresh on every navigation (mirrors the web sidebar) so a freshly
  // granted page can be reached just by moving around the app.
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Foreground receipts only refresh the unread badge — the OS itself renders
  // the banner/sound (see setNotificationHandler in notification.service).
  useEffect(() => {
    if (!user) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      async () => {
        // A push means the server state just changed — drop the cached
        // notification payload so the badge reflects it immediately.
        await refreshNotifications();
        loadUnreadNotificationCount();
      },
    );

    return () => {
      receivedSubscription.remove();
    };
  }, [loadUnreadNotificationCount, user]);

  // Single authoritative tap handler for EVERY entry point:
  //   - app already open   (foreground tap)
  //   - app in background   (resumed via tap)
  //   - app terminated      (cold-started via tap)
  // `useLastNotificationResponse` surfaces the launch notification on cold
  // start as well as subsequent taps; a ref-based dedupe guarantees each
  // notification navigates exactly once, avoiding duplicate navigation/races.
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledNotificationKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !lastNotificationResponse) {
      return;
    }

    const request = lastNotificationResponse.notification.request;
    const data = (request.content.data || {}) as OMSNotificationData;
    const dedupeKey = getNotificationDedupeKey(request.identifier, data);

    if (handledNotificationKeys.current.has(dedupeKey)) {
      return;
    }
    handledNotificationKeys.current.add(dedupeKey);

    // A notification that launched the app while the user was NOT authenticated
    // must not deep-link after they log in (CASE 4). It was recorded at startup;
    // consume it silently so the user stays on Home.
    if (isNotificationSuppressed(dedupeKey)) {
      return;
    }

    loadUnreadNotificationCount();

    // Remember which list this user belongs to, so Back from the order returns
    // there instead of Home. Prefer an explicit origin_role in the payload (if
    // a newer backend sends one), else use the logged-in user's role.
    const originRole =
      (data as { origin_role?: string | null }).origin_role || user.role;
    const originScreen = originScreenForRole(originRole);
    const route = resolveNotificationRoute(data, originScreen);
    if (route) {
      router.push(route);
    }
  }, [lastNotificationResponse, loadUnreadNotificationCount, user]);

  // Single source of truth shared with the bottom bar (see constants/pages).
  const canSee = SCREEN_ROLES;

  const visibleStyle = {
    borderRadius: RADIUS.md,
    marginHorizontal: 12,
    marginVertical: 4,
    minHeight: 50,
    justifyContent: "center" as const,
  };

  const hiddenStyle = { display: "none" as const };

  const renderDrawerLabel = (label: string, color: string) => (
    <Text
      style={{
        color,
        fontSize: 15,
        fontWeight: "600",
        lineHeight: 20,
        flexShrink: 1,
      }}
    >
      {label}
    </Text>
  );

  const isVisible = (screen: string) => {
    if (!userRole && screen === "dashboard") return true;
    if (grantedScreens.has(screen)) return true;
    const roles = canSee[screen];
    return roles?.includes(userRole);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Drawer content sits above the persistent global bottom bar. */}
      <View style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawer {...props} />}
        screenOptions={({ navigation, route }) => {
          const isDashboard = route.name === "dashboard";
          const isNotifications = route.name === "notifications";
          // The refresh action belongs to the order-entry screens only. Gate on
          // the route (not just "a handler is registered"), because the screen
          // can still be mounted mid-transition and would otherwise leak the
          // button onto Home/Orders.
          const isOrderEntry =
            route.name === "orders/create" || route.name === "orders/foc";

          return {
            headerShown: true,
            drawerPosition: "left" as const,
            swipeEnabled: isDashboard,
            unmountOnBlur: !isDashboard,
            drawerActiveTintColor: COLORS.primary,
            drawerInactiveTintColor: COLORS.textSecondary,
            drawerActiveBackgroundColor: "#E8F0FE",
            drawerStyle: {
              backgroundColor: COLORS.surface,
              width: 330,
            },
            headerRightContainerStyle: {
              paddingRight: 6,
            },
            headerLeft: () => (
              <TouchableOpacity
                hitSlop={HEADER_ICON_HIT_SLOP}
                onPress={() => {
                  if (isDashboard) {
                    navigation.toggleDrawer();
                    return;
                  }

                  const fromRoute = (route.params as any)?.from;
                  if (fromRoute && typeof fromRoute === "string") {
                    navigation.navigate(fromRoute as never);
                    return;
                  }

                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: "dashboard" as never }],
                    });
                  }
                }}
                style={{ marginLeft: 12 }}
              >
                <Ionicons
                  name={isDashboard ? "menu-outline" : "arrow-back-outline"}
                  size={24}
                  color={COLORS.text}
                />
              </TouchableOpacity>
            ),
            headerRight: () => {
              if (isNotifications || userRole === "admin") return null;

              return (
                <View style={styles.headerActions}>
                  {/* Top "+" create shortcut removed — the bottom bar's centre
                      Create button is the single entry point for new orders. */}
                  {isOrderEntry && headerRefresh.available ? (
                    <TouchableOpacity
                      hitSlop={HEADER_ICON_HIT_SLOP}
                      onPress={() => headerRefresh.run()}
                      disabled={headerRefresh.refreshing}
                      style={styles.headerBellButton}
                      accessibilityLabel="Refresh items"
                    >
                      {headerRefresh.refreshing ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Ionicons
                          name="sync-outline"
                          size={22}
                          color={COLORS.text}
                        />
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    hitSlop={HEADER_ICON_HIT_SLOP}
                    onPress={() => navigation.navigate("notifications" as never)}
                    style={styles.headerBellButton}
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={22}
                      color={COLORS.text}
                    />
                    {unreadNotificationCount > 0 ? (
                      <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>
                          {unreadNotificationCount > 99
                            ? "99+"
                            : unreadNotificationCount}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              );
            },
            // Centre every screen's title for a consistent header across pages.
            headerTitleAlign: "center" as const,
            headerTitleStyle: {
              fontSize: 19,
              fontWeight: "800" as const,
              color: COLORS.text,
              letterSpacing: 0.2,
            },
          };
        }}
      >
        <Drawer.Screen
          name="dashboard"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Dashboard", color),
            title: "Dashboard",
            drawerIcon: ({ color }) => (
              <Ionicons name="grid-outline" size={22} color={color} />
            ),
            drawerItemStyle: hiddenStyle,
          }}
        />
        {/* Profile is a bottom-bar tab with its own in-page header, so it is
            hidden from the drawer and shows no drawer header. */}
        <Drawer.Screen
          name="profile"
          options={{
            headerShown: false,
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="notifications"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Notifications", color),
            title: "Notifications",
            drawerIcon: ({ color }) => (
              <Ionicons name="notifications-outline" size={22} color={color} />
            ),
            drawerItemStyle: userRole === "admin" ? hiddenStyle : visibleStyle,
          }}
        />
        <Drawer.Screen
          name="orders/create"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Create Order", color),
            title: "Create Order",
            drawerIcon: ({ color }) => (
              <Ionicons name="add-circle-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/create")
              ? visibleStyle
              : hiddenStyle,
          }}
          listeners={({ navigation }) => ({
            drawerItemPress: (e: { preventDefault: () => void }) => {
              e.preventDefault();
              navigation.navigate(
                "orders/create" as never,
                {
                  openMode: "create",
                  openedAt: String(Date.now()),
                } as never,
              );
            },
          })}
        />
        <Drawer.Screen
          name="orders/drafts"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Drafts", color),
            title: "Drafts",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/drafts")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/foc"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("FOC", color),
            title: "FOC",
            drawerIcon: ({ color }) => (
              <Ionicons name="bag-add-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/foc") ? visibleStyle : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/orderlist"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Order List", color),
            title: "Order List",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/orderlist")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="reports/daily-report"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Daily Report", color),
            title: "Daily Report",
            drawerIcon: ({ color }) => (
              <Ionicons name="bar-chart-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("reports/daily-report")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="admin/order-flow"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Order Flow", color),
            title: "Order Flow",
            drawerIcon: ({ color }) => (
              <Ionicons name="git-branch-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("admin/order-flow")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="admin/sales-quotation"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Sales Quotation", color),
            title: "Sales Quotation",
            drawerIcon: ({ color }) => (
              <Ionicons name="receipt-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("admin/sales-quotation")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="users/create"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Create User", color),
            title: "Create User",
            drawerIcon: ({ color }) => (
              <Ionicons name="person-add-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("users/create")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="users/allUsers"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("All Users", color),
            title: "All Users",
            drawerIcon: ({ color }) => (
              <Ionicons name="people-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("users/allUsers")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="users/pagePermissions"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Page Permissions", color),
            title: "Page Permissions",
            drawerIcon: ({ color }) => (
              <Ionicons name="shield-checkmark-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("users/pagePermissions")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="users/addScheme"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Add Scheme", color),
            title: "All Schemes",
            drawerIcon: ({ color }) => (
              <Ionicons name="pricetag-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("users/addScheme")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="users/editUser"
          options={{
            title: "Edit User",
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="sap/sap-sync"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Sap Sync", color),
            title: "Sap Sync",
            drawerIcon: ({ color }) => (
              <Ionicons name="sync-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/sap-sync")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="sap/party-assignment"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Sap Party Assignment", color),
            title: "Sap Party Assignment",
            drawerIcon: ({ color }) => (
              <Ionicons name="business-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/party-assignment")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="sap/party-product-assignment"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Sap Party Product Assignment", color),
            title: "Sap Party Product Assignment",
            drawerIcon: ({ color }) => (
              <Ionicons name="cube-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/party-product-assignment")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/OrderFlow"
          options={{
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/orderdetails"
          options={{
            title: "Order Details",
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/orderprogress"
          options={{
            title: "Order Progress",
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/ordertracking"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Order Tracking", color),
            title: "Order Tracking",
            drawerIcon: ({ color }) => (
              <Ionicons name="locate-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/ordertracking")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="approver/pending_approval"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Pending Approvals", color),
            title: "Pending Approvals",
            drawerIcon: ({ color }) => (
              <Ionicons name="checkmark-done-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("approver/pending_approval")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="orders/auditorapproval"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Auditor Approvals", color),
            title: "Auditor Approvals",
            drawerIcon: ({ color }) => (
              <Ionicons name="checkmark-done-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/auditorapproval")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
      </Drawer>
        {/* Persistent bottom navigation, shown on every screen. */}
        <BottomBar />
      </View>

      <NotificationPermissionModal
        visible={showPermissionModal}
        onAllow={handleAllowNotifications}
        onDismiss={handleDismissPermission}
        submitting={permissionSubmitting}
      />
    </GestureHandlerRootView>
  );
}

const styles = {
  headerActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  headerIconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerBellButton: {
    marginRight: 6,
    width: 24,
    height: 24,
    position: "relative" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  notificationBadge: {
    position: "absolute" as const,
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  notificationBadgeText: {
    color: COLORS.textLight,
    fontSize: 9,
    fontWeight: "700" as const,
    lineHeight: 10,
  },
};
