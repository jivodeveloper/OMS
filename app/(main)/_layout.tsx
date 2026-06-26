import React, { useCallback, useEffect, useState } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Text, TouchableOpacity, View } from "react-native";
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import CustomDrawer from "@/src/components/common/CustomDrawer";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS } from "@/src/constants/theme";
import { orderService } from "@/src/services/order.service";
import { notificationService } from "@/src/services/notification.service";
import { storage } from "@/src/utils/storage";
import { screensFromExtraPages } from "@/src/constants/pages";

const HEADER_ICON_HIT_SLOP = { top: 12, right: 12, bottom: 12, left: 12 };

export default function MainLayout() {
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const userRole = user?.role?.toLowerCase() || "";
  const grantedScreens = screensFromExtraPages(user?.extra_pages || []);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

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
    if (user) {
      notificationService.registerDeviceToken();
    }
  }, [user]);

  // Re-pull the profile (incl. extra_pages grants) when the app returns to the
  // foreground, so permissions granted elsewhere — e.g. from the web admin —
  // show up without the user logging out and back in.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshUser();
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

  useEffect(() => {
    if (!user) {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      () => {
        loadUnreadNotificationCount();
      },
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        loadUnreadNotificationCount();

        const screen = response.notification.request.content.data?.screen;
        if (screen === "notifications") {
          router.push("/notifications");
        }
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [loadUnreadNotificationCount, user]);

  const canSee: Record<string, string[]> = {
    dashboard: ["admin", "manager", "approver"],
    "orders/create": ["manager", "billing"],
    "orders/drafts": ["manager", "billing"],
    "orders/foc": ["manager", "billing"],
    "orders/orderlist": ["billing"],
    "reports/daily-report": ["admin", "billing"],
    "admin/order-flow": ["admin"],
    "admin/sales-quotation": ["admin"],
    "users/create": ["admin"],
    "users/allUsers": ["admin"],
    "users/pagePermissions": ["admin"],
    "users/addScheme": ["admin"],
    "sap/sap-sync": ["admin"],
    "sap/party-assignment": ["admin"],
    "sap/party-product-assignment": ["admin"],
    "approver/pending_approval": ["approver"],
    "orders/ordertracking": ["manager", "billing"],
    "orders/auditorapproval": ["auditor"],
  };

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
      <Drawer
        drawerContent={(props) => <CustomDrawer {...props} />}
        screenOptions={({ navigation, route }) => {
          const isDashboard = route.name === "dashboard";
          const isNotifications = route.name === "notifications";
          const canCreateOrderFromDashboard =
            isDashboard && ["manager", "billing"].includes(userRole);

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
                  {canCreateOrderFromDashboard ? (
                    <TouchableOpacity
                      hitSlop={HEADER_ICON_HIT_SLOP}
                      onPress={() =>
                        (navigation as any).navigate("orders/create", {
                          openMode: "create",
                          from: "dashboard",
                          openedAt: String(Date.now()),
                        })
                      }
                      style={styles.headerIconButton}
                    >
                      <Ionicons
                        name="add"
                        size={20}
                        color={COLORS.text}
                      />
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
