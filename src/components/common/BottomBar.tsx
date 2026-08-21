import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/constants/theme";
import {
  canAccessScreen,
  createTargetsFor,
  resolveReportsRoute,
  resolveWorkQueueRoute,
} from "@/src/constants/pages";
import { useDrawerOpen } from "@/src/utils/drawerState";

type TabKey = "home" | "orders" | "create" | "reports" | "profile";

// Each role's own "orders" destination now lives in constants/pages.ts, so the
// Orders tab and the post-create "Go to Orders" action resolve it identically.

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
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  // The second tab adapts to what the user actually has: an orders screen when
  // they hold one, otherwise their payments or deposits queue. Labelling it
  // "Orders" for a payments-only user sent them somewhere they cannot open.
  const workQueue = resolveWorkQueueRoute(role, extraPages, user?.roles);

  // Everything this user may create. None hides the button; one opens directly;
  // several open the chooser sheet.
  const createTargets = createTargetsFor(role, extraPages, user?.roles);

  // Where Reports goes for THIS user: the sales daily report when they hold
  // it, otherwise the Payments Dashboard. Null when they have neither, so the
  // tab shows the permission dialog instead of navigating somewhere refused.
  const reports = resolveReportsRoute(role, extraPages, user?.roles);

  // Highlight the tab that matches the current route (so the global bar shows
  // the right active tab on every screen). An explicit `active` prop wins.
  const activeTab: TabKey = useMemo(() => {
    if (active) return active;
    const p = (pathname || "").toLowerCase();
    if (p.includes("create")) return "create";
    if (p.includes("profile")) return "profile";
    if (p.includes("report")) return "reports";
    // Checked BEFORE the generic /payments/ match below, which would otherwise
    // light the work-queue tab while the user is looking at analytics.
    if (p.includes("/payments/dashboard")) return "reports";
    if (
      p.includes("orderlist") ||
      p.includes("ordertracking") ||
      p.includes("pending_approval") ||
      p.includes("auditorapproval") ||
      p.includes("orderdetails") ||
      p.includes("orderprogress")
    )
      return "orders";
    // The second tab is not always Orders — for a payments user it resolves to
    // Payments or Deposits (see resolveWorkQueueRoute). Those routes were not
    // matched here, so every payment screen fell through to "home" and lit the
    // wrong tab. Matching the whole section keeps the bar honest wherever the
    // tab happens to point.
    if (p.includes("/payments/") || p.includes("/approval/")) return "orders";
    return "home";
  }, [active, pathname]);

  // Guard: when the work-queue tab is absent (no orders/payments/deposits),
  // never leave "orders" selected — nothing would appear highlighted.
  const resolvedActiveTab: TabKey =
    activeTab === "orders" && !workQueue ? "home" : activeTab;

  // Hide the footer while the sidebar is open (the drawer covers the screen),
  // then show it again on close. All hooks above run unconditionally.
  if (drawerOpen) return null;

  // Navigate if permitted, otherwise surface the "no permission" dialog.
  const guarded = (screen: string, label: string, navigate: () => void) => {
    if (canAccessScreen(screen, role, extraPages, user?.roles)) navigate();
    else setDeniedLabel(label);
  };

  /** Open one create destination, closing the sheet first if it was showing. */
  const openCreateTarget = (target: (typeof createTargets)[number]) => {
    setCreateSheetOpen(false);
    guarded(target.screen, target.label, () => {
      // Only the order screen needs the openMode handshake; the payment and
      // deposit forms take no params.
      if (target.key === "order") {
        router.push({
          pathname: target.route,
          params: { openMode: "create", openedAt: String(Date.now()) },
        } as never);
      } else {
        router.push(target.route as never);
      }
    });
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
        if (resolvedActiveTab !== "home")
          router.navigate("/(main)/dashboard" as never);
      },
    },
    // Orders / Payments / Deposits, in that priority order. Omitted entirely
    // when the user holds none of them: this tab used to fall back to the
    // dashboard, which rendered a second "Home" beside the real one.
    ...(workQueue
      ? [
          {
            key: "orders" as TabKey,
            label: workQueue.label,
            icon: workQueue.icon as keyof typeof Ionicons.glyphMap,
            badge: ordersBadge,
            onPress: () =>
              guarded(workQueue.screen, workQueue.label, () =>
                router.push(workQueue.route as never),
              ),
          },
        ]
      : []),
    {
      key: "create",
      label: "Create",
      icon: "add",
      fab: true,
      onPress: () => {
        if (createTargets.length === 0) {
          setDeniedLabel("Create");
          return;
        }
        // A single option needs no sheet — that would be a tap for nothing.
        if (createTargets.length === 1) {
          openCreateTarget(createTargets[0]);
          return;
        }
        setCreateSheetOpen(true);
      },
    },
    {
      key: "reports",
      label: "Reports",
      icon: "bar-chart-outline",
      onPress: () => {
        if (!reports) {
          setDeniedLabel("Reports");
          return;
        }
        guarded(reports.screen, reports.label, () =>
          router.push(reports.route as never),
        );
      },
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
        const isActive = resolvedActiveTab === tab.key;
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

      {/* Create chooser — shown only when the user may create more than one
          kind of document, so a single-permission user never taps twice. */}
      <Modal
        visible={createSheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCreateSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setCreateSheetOpen(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create new</Text>

            {createTargets.map((target) => (
              <TouchableOpacity
                key={target.key}
                style={styles.sheetRow}
                activeOpacity={0.8}
                onPress={() => openCreateTarget(target)}
              >
                <View style={styles.sheetIcon}>
                  <Ionicons
                    name={target.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.sheetRowText}>
                  <Text style={styles.sheetRowLabel}>{target.label}</Text>
                  <Text style={styles.sheetRowDesc}>{target.description}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            ))}
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

  // ── Create chooser sheet ──────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(79,70,229,0.08)",
  },
  sheetRowText: { flex: 1, minWidth: 0 },
  sheetRowLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  sheetRowDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
