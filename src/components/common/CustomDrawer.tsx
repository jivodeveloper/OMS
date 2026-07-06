import React, { useEffect, useState } from "react";
import {
  Alert,
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Text,
} from "react-native";
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/constants/theme";
import { orderService } from "@/src/services/order.service";
import { storage } from "@/src/utils/storage";

/** Per-route accent colour for the icon tile. */
const ACCENTS: Record<string, string> = {
  dashboard: "#2563EB",
  notifications: "#2563EB",
  "orders/create": "#2563EB",
  "orders/drafts": "#7C3AED",
  "orders/foc": "#16A34A",
  "orders/orderlist": "#2563EB",
  "reports/daily-report": "#F59E0B",
  "orders/ordertracking": "#EC4899",
  "sap/sap-sync": "#2563EB",
  "sap/party-assignment": "#0891B2",
  "sap/party-product-assignment": "#0891B2",
  "admin/order-flow": "#7C3AED",
  "admin/sales-quotation": "#0891B2",
  "users/create": "#2563EB",
  "users/allUsers": "#2563EB",
  "users/pagePermissions": "#16A34A",
  "users/addScheme": "#F59E0B",
  "approver/pending_approval": "#16A34A",
  "orders/auditorapproval": "#16A34A",
};

/** Routes grouped after the primary block get a divider before them. */
const GROUP: Record<string, number> = {
  "sap/sap-sync": 1,
  "sap/party-assignment": 1,
  "sap/party-product-assignment": 1,
  "orders/ordertracking": 1,
};

const tint = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function CustomDrawer(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const notifications = await orderService.getNotifications();
        const hiddenIds = new Set(await storage.getHiddenNotificationIds());
        if (!active) return;
        setUnreadCount(
          (Array.isArray(notifications) ? notifications : []).filter(
            (n: any) => !n.is_read && !hiddenIds.has(n.id),
          ).length,
        );
      } catch {
        // badge simply stays hidden
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const performLogout = async () => {
    await logout();
    router.replace("/(auth)/login" as any);
  };

  const confirmLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out of your account?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: performLogout },
      ],
      { cancelable: true },
    );
  };

  const initial =
    user?.name?.charAt(0)?.toUpperCase() ||
    user?.username?.charAt(0)?.toUpperCase() ||
    "U";

  const focusedRouteName =
    props.state.routes[props.state.index]?.name ?? "";

  // Only render routes that are visible for this role (the navigator hides the
  // rest via `drawerItemStyle: { display: 'none' }`) and that expose an icon.
  const visibleItems = props.state.routes
    .map((route) => ({ route, options: props.descriptors[route.key].options }))
    .filter(
      ({ options }) =>
        (options.drawerItemStyle as any)?.display !== "none" &&
        !!options.drawerIcon,
    );

  const openItem = (routeName: string) => {
    if (routeName === "orders/create") {
      (props.navigation as any).navigate("orders/create", {
        openMode: "create",
        openedAt: String(Date.now()),
      });
      return;
    }
    props.navigation.navigate(routeName as never);
  };

  return (
    <View style={styles.container}>
      {/* ===== Header ===== */}
      <LinearGradient
        colors={["#2563EB", "#1E3A8A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 18 }]}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <View style={styles.avatarWrap}>
          <LinearGradient
            colors={["#60A5FA", "#1D4ED8"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <View style={styles.onlineDot} />
        </View>

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || user?.username || "User"}
            </Text>
            <Text style={styles.userRole} numberOfLines={1}>
              {user?.role || "Member"}
            </Text>
          </View>
          <View style={styles.onlinePill}>
            <View style={styles.onlinePillDot} />
            <Text style={styles.onlinePillText}>Online</Text>
          </View>
        </View>

        {!!user?.company && (
          <View style={styles.companyBadge}>
            <Ionicons name="business" size={13} color="#fff" />
            <Text style={styles.companyText}>{user.company.name}</Text>
          </View>
        )}
      </LinearGradient>

      {/* ===== Scrollable content ===== */}
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dark Mode card (UI only for now) */}
        <View style={styles.darkCard}>
          <View style={styles.darkIconBox}>
            <Ionicons name="moon-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.darkTitle}>Dark Mode</Text>
            <Text style={styles.darkSub}>Switch between light and dark theme</Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: "#CBD5E1", true: COLORS.primary }}
            thumbColor="#ffffff"
            ios_backgroundColor="#CBD5E1"
          />
        </View>

        {/* Menu items */}
        {visibleItems.map(({ route, options }, index) => {
          const accent = ACCENTS[route.name] ?? COLORS.primary;
          const group = GROUP[route.name] ?? 0;
          const prevGroup =
            index > 0 ? GROUP[visibleItems[index - 1].route.name] ?? 0 : group;
          const showDivider = index > 0 && group !== prevGroup;
          const focused = route.name === focusedRouteName;
          const label = (options.title as string) ?? route.name;
          const badge =
            route.name === "notifications" && unreadCount > 0
              ? unreadCount
              : null;

          return (
            <React.Fragment key={route.key}>
              {showDivider && <View style={styles.groupDivider} />}
              <TouchableOpacity
                style={[styles.item, focused && styles.itemActive]}
                activeOpacity={0.7}
                onPress={() => openItem(route.name)}
              >
                <View
                  style={[styles.itemIconBox, { backgroundColor: tint(accent, 0.12) }]}
                >
                  {options.drawerIcon?.({ color: accent, size: 20, focused })}
                </View>
                <Text
                  style={[styles.itemLabel, focused && styles.itemLabelActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {badge != null && (
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>
                      {badge > 99 ? "99+" : badge}
                    </Text>
                  </View>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={focused ? COLORS.primary : "#9CA3AF"}
                />
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </DrawerContentScrollView>

      {/* ===== Footer ===== */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.signOut}
          activeOpacity={0.8}
          onPress={confirmLogout}
        >
          <View style={styles.signOutIconBox}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </View>
          <Text style={styles.signOutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.error} />
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F9FC",
  },

  // Header
  header: {
    paddingBottom: 22,
    paddingHorizontal: 20,
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  decorCircle1: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -30,
    left: -25,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  avatarWrap: {
    position: "relative",
    marginBottom: 14,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.55)",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#22C55E",
    borderWidth: 3,
    borderColor: "#fff",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  userRole: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textTransform: "capitalize",
    marginTop: 2,
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  onlinePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  onlinePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  companyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },

  // Scroll content
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

  // Dark mode card
  darkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EEF1F6",
    shadowColor: "#1E3A5F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  darkIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
  },
  darkTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  darkSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Menu item
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 4,
  },
  itemActive: {
    backgroundColor: "#EAF1FE",
  },
  itemIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  itemLabelActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  itemBadge: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  itemBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  groupDivider: {
    height: 1,
    backgroundColor: "#EAEDF2",
    marginVertical: 10,
    marginHorizontal: 6,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EAEDF2",
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FBD5D5",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  signOutIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.error,
  },
  version: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 16,
  },
});
