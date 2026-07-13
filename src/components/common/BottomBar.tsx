import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/constants/theme";
import { canAccessScreen } from "@/src/constants/pages";
import { useDrawerOpen } from "@/src/utils/drawerState";

type TabKey = "home" | "orders" | "create" | "reports" | "profile";

// Each role's own "orders" destination for the Orders tab. A user can always
// reach their own orders screen, so this tab is never permission-blocked.
const ORDERS_BY_ROLE: Record<string, { screen: string; route: string }> = {
  billing: { screen: "orders/orderlist", route: "/orders/orderlist" },
  manager: { screen: "orders/ordertracking", route: "/orders/ordertracking" },
  approver: { screen: "approver/pending_approval", route: "/approver/pending_approval" },
  auditor: { screen: "orders/auditorapproval", route: "/orders/auditorapproval" },
};

/**
 * Shared bottom navigation for every role. The bar looks identical for all
 * users; tapping a tab opens its page only if the user has permission,
 * otherwise it shows a branded "no permission" dialog. This is the single
 * source of the app's bottom bar so every dashboard renders the same footer.
 */
export default function BottomBar({
  active,
  ordersBadge = 0,
}: {
  active?: TabKey;
  ordersBadge?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const drawerOpen = useDrawerOpen();
  const role = (user?.role || "").toLowerCase();
  const extraPages = user?.extra_pages || [];
  const [deniedLabel, setDeniedLabel] = useState<string | null>(null);

  const orders = ORDERS_BY_ROLE[role] ?? {
    screen: "orders/orderlist",
    route: "/orders/orderlist",
  };

  // Highlight the tab that matches the current route (so the global bar shows
  // the right active tab on every screen). An explicit `active` prop wins.
  const activeTab: TabKey = useMemo(() => {
    if (active) return active;
    const p = (pathname || "").toLowerCase();
    if (p.includes("create")) return "create";
    if (p.includes("profile")) return "profile";
    if (p.includes("report")) return "reports";
    if (
      p.includes("orderlist") ||
      p.includes("ordertracking") ||
      p.includes("pending_approval") ||
      p.includes("auditorapproval") ||
      p.includes("orderdetails") ||
      p.includes("orderprogress")
    )
      return "orders";
    return "home";
  }, [active, pathname]);

  // Hide the footer while the sidebar is open (the drawer covers the screen),
  // then show it again on close. All hooks above run unconditionally.
  if (drawerOpen) return null;

  // Navigate if permitted, otherwise surface the "no permission" dialog.
  const guarded = (screen: string, label: string, navigate: () => void) => {
    if (canAccessScreen(screen, role, extraPages)) navigate();
    else setDeniedLabel(label);
  };

  const tabs: {
    key: TabKey;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    fab?: boolean;
    badge?: number;
    onPress: () => void;
  }[] = [
    {
      key: "home",
      label: "Home",
      icon: "home",
      // Always return to the dashboard from any screen.
      onPress: () => {
        if (activeTab !== "home") router.navigate("/(main)/dashboard" as never);
      },
    },
    {
      key: "orders",
      label: "Orders",
      icon: "clipboard-outline",
      badge: ordersBadge,
      onPress: () =>
        guarded(orders.screen, "Orders", () =>
          router.push(orders.route as never),
        ),
    },
    {
      key: "create",
      label: "Create",
      icon: "add",
      fab: true,
      onPress: () =>
        guarded("orders/create", "Create Order", () =>
          router.push({
            pathname: "/orders/create",
            params: { openMode: "create", openedAt: String(Date.now()) },
          } as never),
        ),
    },
    {
      key: "reports",
      label: "Reports",
      icon: "bar-chart-outline",
      onPress: () =>
        guarded("reports/daily-report", "Reports", () =>
          router.push("/reports/daily-report" as never),
        ),
    },
    {
      key: "profile",
      label: "Profile",
      icon: "person-outline",
      // Every user can always open their own profile.
      onPress: () =>
        guarded("profile", "Profile", () =>
          router.push("/(main)/profile" as never),
        ),
    },
  ];

  return (
    <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            activeOpacity={0.8}
            onPress={tab.onPress}
          >
            {tab.fab ? (
              <View style={styles.fab}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
            ) : (
              <View>
                <Ionicons
                  name={tab.icon}
                  size={22}
                  color={isActive ? COLORS.primary : "#64748B"}
                />
                {!!tab.badge && tab.badge > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <Text style={[styles.tabLabel, isActive && { color: COLORS.primary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Branded "no permission" dialog */}
      <Modal
        visible={!!deniedLabel}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setDeniedLabel(null)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setDeniedLabel(null)}
        >
          <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={26} color={COLORS.error} />
            </View>
            <Text style={styles.cardTitle}>Access restricted</Text>
            <Text style={styles.cardMessage}>
              You don&apos;t have permission to open {deniedLabel}. Please contact
              your administrator if you need access.
            </Text>
            <TouchableOpacity
              style={styles.okBtn}
              activeOpacity={0.85}
              onPress={() => setDeniedLabel(null)}
            >
              <Text style={styles.okText}>Got it</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    // Clear top divider so the footer reads as a separate bar over content.
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: "#D3DAE6",
    paddingTop: 8,
    paddingHorizontal: 6,
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
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

  // No-permission dialog
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  lockCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  cardMessage: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  okBtn: {
    alignSelf: "stretch",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  okText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
