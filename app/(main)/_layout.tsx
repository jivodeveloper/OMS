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
import { frameworkNotificationService } from "@/src/services/frameworkNotification.service";
import { storage } from "@/src/utils/storage";
import {
  canAccessScreen,
  isPaymentsOnlyUser,
} from "@/src/constants/pages";
import {
  getNotificationDedupeKey,
  originScreenForRole,
  resolveNotificationRoute,
  type OMSNotificationData,
} from "@/src/utils/notificationRouting";
import { shouldShowPermissionPrompt } from "@/src/utils/notificationPermission";
import { isNotificationSuppressed } from "@/src/utils/notificationGate";
import { useHeaderRefresh } from "@/src/utils/headerRefresh";
import { useHeaderEdit } from "@/src/utils/headerEdit";
import { refreshLiveData, refreshNotifications } from "@/src/cache";
import { DRAWER_WIDTH } from "@/src/utils/responsive";
import NotificationPermissionModal from "@/src/components/NotificationPermissionModal";
import BottomBar from "@/src/components/common/BottomBar";
import { showToast } from "@/src/components/common/Toast";

const HEADER_ICON_HIT_SLOP = { top: 12, right: 12, bottom: 12, left: 12 };

export default function MainLayout() {
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const userRole = user?.role?.toLowerCase() || "";
  // A screen (e.g. Create Order) can publish a refresh action; when present it
  // renders as a header button just before the notification bell.
  const headerRefresh = useHeaderRefresh();
  const headerEdit = useHeaderEdit();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);

  const loadUnreadNotificationCount = useCallback(async () => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      // Count unread across BOTH feeds (Orders + framework). Either can fail
      // independently without zeroing the badge. The inbox dismisses cards by
      // key, so honour both the legacy id set and the key set here.
      const [ordersRes, frameworkRes, hiddenIds, hiddenKeys] =
        await Promise.all([
          orderService.getNotifications().catch(() => []),
          frameworkNotificationService.getNotifications().catch(() => []),
          storage.getHiddenNotificationIds(),
          storage.getHiddenNotificationKeys(),
        ]);
      const hiddenIdSet = new Set(hiddenIds);
      const hiddenKeySet = new Set(hiddenKeys);
      const ordersUnread = ordersRes.filter(
        (item) =>
          !item.is_read &&
          !hiddenIdSet.has(item.id) &&
          !hiddenKeySet.has(`orders:${item.id}`),
      ).length;
      const frameworkUnread = frameworkRes.filter(
        (item) => !item.is_read && !hiddenKeySet.has(`framework:${item.id}`),
      ).length;
      setUnreadNotificationCount(ordersUnread + frameworkUnread);
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

  // Single source of truth for the header bell and the drawer's Notifications
  // item, so the two can never disagree.
  const canSeeNotifications = canAccessScreen("notifications", user);

  // Mirrors what dashboard.tsx renders, so the header and the page agree.
  const paymentsOnlyHome = isPaymentsOnlyUser(user);
  // Same choice dashboard.tsx makes: anyone holding payments sees the payments
  // home, everyone else on this branch is a deposits user. The header has to
  // follow, or a deposits user reads "Payments Dashboard" above deposit data.
  // Must match dashboard.tsx exactly, or a verifier reads "Deposits" above
  // payments data. Verification counts as payment work on both sides.
  const homeIsDeposits =
    paymentsOnlyHome &&
    !canAccessScreen("payments/payment-tracking", user) &&
    !canAccessScreen("payments/verification", user);

  /**
   * Whether a screen appears in the sidebar.
   *
   * Delegates to canAccessScreen — the SAME rule ScreenGuard enforces when the
   * page is opened. This used to be a second copy that only knew about roles
   * and grants, so once payments screens moved to action permissions the two
   * disagreed: the sidebar listed pages the guard then refused.
   */
  const isVisible = (screen: string) => {
    if (!userRole && screen === "dashboard") return true;
    return canAccessScreen(screen, user);
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
          // The payment/approval screens are admin-reachable but still want
          // header actions, so they opt out of the blanket "no header actions
          // for admin" rule.
          const isPaymentScreen =
            route.name === "payments/receive-payment" ||
            route.name === "payments/bank-deposit" ||
            route.name === "payments/payment-tracking" ||
            route.name === "payments/deposit-tracking" ||
            route.name === "payments/tracking-details" ||
            route.name === "payments/deposit-details" ||
            route.name === "payments/tracking-progress" ||
            route.name === "approval/approval-details";
          // Approval Details carries an Edit action next to the bell.
          const isApprovalDetails = route.name === "approval/approval-details";

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
              // ~50% of the screen, leaving a wide tap-to-close area.
              width: DRAWER_WIDTH,
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

                  // expo-router's own history knows where we came from even
                  // when the Drawer navigator does not: pushing between two
                  // drawer screens builds no navigator stack, so canGoBack()
                  // returned false and every Back reset to the dashboard —
                  // from Payment Details, Progress, everywhere.
                  if (router.canGoBack()) {
                    router.back();
                    return;
                  }
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                    return;
                  }
                  // Genuinely nothing behind us (a deep link, say). The
                  // dashboard is the only sensible destination.
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "dashboard" as never }],
                  });
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
              if (isNotifications) return null;
              if (userRole === "admin" && !isPaymentScreen) return null;

              return (
                <View style={styles.headerActions}>
                  {/* Edit lives here, beside the screen title. Rendered only
                      while the open screen has published a handler — that is
                      how the header knows whether THIS document may be edited,
                      which depends on its status and the viewer's permissions. */}
                  {headerEdit.available ? (
                    <TouchableOpacity
                      hitSlop={HEADER_ICON_HIT_SLOP}
                      onPress={() => headerEdit.run()}
                      style={styles.headerBellButton}
                      accessibilityLabel="Edit this entry"
                    >
                      <Ionicons
                        name="create-outline"
                        size={22}
                        color={COLORS.text}
                      />
                    </TouchableOpacity>
                  ) : null}
                  {/* The Approval Details "edit" icon was removed: an approver
                      decides on a request, they do not edit it — only the
                      creator can, by resubmitting a rejected entry. It only
                      ever showed a "coming soon" toast. */}
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
                  {/* Bell only for users who may actually open Notifications —
                      showing it otherwise leads to a denied screen. */}
                  {canSeeNotifications ? (
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
                  ) : null}
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
            // A payments-only user's home IS the payments dashboard — calling
            // it "Dashboard" suggested the sales one they cannot open.
            title: homeIsDeposits
              ? "Deposits Dashboard"
              : paymentsOnlyHome
                ? "Payments Dashboard"
                : "Dashboard",
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
            drawerItemStyle: canSeeNotifications ? visibleStyle : hiddenStyle,
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
          name="payments/receive-payment"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Receive Payment", color),
            title: "Receive Payment",
            drawerIcon: ({ color }) => (
              <Ionicons name="wallet-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/receive-payment")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        {/* Payment Requests has been REMOVED. The tracking screens serve
            approvers and creators alike, scoping themselves from the caller's
            action permissions — and keeping the retired route registered was
            actively harmful: resolveWorkQueueRoute sent deposit approvers
            there instead of to Deposit Tracking, so they had no way to reach
            their deposits at all. */}
        <Drawer.Screen
          name="approval/approval-details"
          options={{
            // Serves creators and approvers alike now, so the title is about
            // the document rather than about approving it.
            title: "Payment Details",
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/bank-deposit"
          options={{
            drawerLabel: ({ color }) => renderDrawerLabel("Bank Deposit", color),
            title: "Bank Deposit",
            drawerIcon: ({ color }) => (
              <Ionicons name="business-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/bank-deposit")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/dashboard"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Payments Dashboard", color),
            title: "Payments Dashboard",
            drawerIcon: ({ color }) => (
              <Ionicons name="pie-chart-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/dashboard")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        {/* Reached from a row in the dashboard, never from the menu. */}
        <Drawer.Screen
          name="payments/dashboard-person"
          options={{
            title: "Collection Details",
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/payment-tracking"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Payment Tracking", color),
            title: "Payment Tracking",
            drawerIcon: ({ color }) => (
              <Ionicons name="trail-sign-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/payment-tracking")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/verification"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Verify Payments", color),
            title: "Verify Payments",
            drawerIcon: ({ color }) => (
              <Ionicons name="shield-checkmark-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/verification")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/deposit-tracking"
          options={{
            drawerLabel: ({ color }) =>
              renderDrawerLabel("Deposit Tracking", color),
            title: "Deposit Tracking",
            drawerIcon: ({ color }) => (
              <Ionicons name="analytics-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("payments/deposit-tracking")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/deposit-details"
          options={{
            title: "Deposit Details",
            // Reached from a deposit card, never from the drawer itself.
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/tracking-details"
          options={{
            title: "Payment Details",
            // Reached from a tracking card, never from the drawer itself.
            drawerItemStyle: hiddenStyle,
          }}
        />
        <Drawer.Screen
          name="payments/tracking-progress"
          options={{
            title: "Payment Progress",
            // Reached from a tracking card, never from the drawer itself.
            drawerItemStyle: hiddenStyle,
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
