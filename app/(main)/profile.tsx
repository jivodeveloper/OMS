import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/theme";
import { useAuth } from "@/src/context/AuthContext";
import { authService, type User } from "@/src/services/auth.service";
import { deviceService } from "@/src/services/device.service";
import { orderService } from "@/src/services/order.service";
import { storage } from "@/src/utils/storage";
import { appAlert } from "@/src/components/common/AppDialog";
import { CacheKeys, invalidateQueries } from "@/src/cache";
import { fs, ms, sp } from "@/src/utils/responsive";

// USR-000123 style id shown on the card.
const formatUserId = (id?: number | null) =>
  id != null ? `USR-${String(id).padStart(6, "0")}` : "-";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return String(value);
  }
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState<User | null>(authUser ?? null);
  const [loading, setLoading] = useState(!authUser);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const loadProfile = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const token = await storage.getAccessToken();
      if (token) {
        const res = await authService.getProfile(token);
        if (res?.success && res.data) setProfile(res.data);
      }
    } catch (err) {
      console.log("Profile load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const notifications = await orderService.getNotifications();
      const hidden = new Set(await storage.getHiddenNotificationIds());
      setUnread(
        (Array.isArray(notifications) ? notifications : []).filter(
          (item: any) => !item.is_read && !hidden.has(item.id),
        ).length,
      );
    } catch {
      // best-effort badge only
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadUnread();
  }, [loadProfile, loadUnread]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Explicit refresh: drop cached profile/notification payloads first.
    await invalidateQueries([CacheKeys.profile, CacheKeys.notifications]);
    loadProfile(true);
    loadUnread();
  };

  const handleEditProfile = useCallback(() => {
    appAlert("Edit Profile", "Profile editing will be available soon.");
  }, []);

  if (loading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const displayName = profile?.name || profile?.username || "User";

  const companyText = profile?.company
    ? `${profile.company.name}${profile.company.id != null ? ` (${profile.company.id})` : ""}`
    : "-";
  const mainGroupText = profile?.main_group
    ? `${profile.main_group.name}${profile.main_group.id != null ? ` (${profile.main_group.id})` : ""}`
    : "-";
  const stateText = profile?.state
    ? `${profile.state.name}${profile.state.code ? ` (${profile.state.code})` : ""}`
    : "-";
  const categoryText =
    profile?.category?.category || profile?.category?.name || "-";
  const subGroupText = profile?.sub_group || "-";
  const roleText = profile?.role_display || profile?.role || "-";

  // Read-only build/device facts for support triage. Sourced from native app
  // metadata via DeviceService — never a hand-maintained string.
  const device = deviceService.getSummary();
  const platformLabel =
    device.platform === "ANDROID"
      ? "Android"
      : device.platform === "IOS"
        ? "iOS"
        : device.platform;
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.navigate("/(main)/dashboard" as never)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>
            View and manage your account details
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.push("/(main)/notifications" as never)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
          {unread > 0 && (
            <View style={styles.headerBellBadge}>
              <Text style={styles.headerBellBadgeText}>
                {unread > 99 ? "99+" : unread}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile summary card — the whole card is tappable (not just the
            button), so the primary action has a full-card touch target. The
            "Active" chip is gone: the avatar's green dot already conveys it and
            a signed-in user is active by definition. */}
        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.85}
          onPress={handleEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={ms(34)} color={COLORS.primary} />
            <View style={styles.avatarDot} />
          </View>
          <View style={styles.profileMain}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.profileUsername} numberOfLines={1}>
              {profile?.username || ""}
            </Text>
          </View>
          <View style={styles.editBtn}>
            <Ionicons name="pencil" size={ms(14)} color={COLORS.primary} />
            <Text style={styles.editBtnText}>Edit</Text>
          </View>
        </TouchableOpacity>

        {/* Account Information */}
        <Section icon="id-card-outline" iconBg="#EAF1FF" iconColor={COLORS.primary} title="Account Information">
          <InfoRow icon="id-card-outline" label="ID" value={formatUserId(profile?.id)} />
          <InfoRow icon="person-outline" label="Username" value={profile?.username || "-"} />
          <InfoRow icon="mail-outline" label="Email" value={profile?.email || "-"} valueColor={COLORS.primary} />
          <InfoRow icon="call-outline" label="Phone" value={profile?.phone || "-"} valueColor={COLORS.primary} />
          <InfoRow icon="calendar-outline" label="Date Joined" value={formatDateTime(profile?.date_joined || profile?.created_at)} last />
        </Section>

        {/* Organization Information */}
        <Section icon="git-network-outline" iconBg="#F3EEFF" iconColor="#7C3AED" title="Organization Information" defaultExpanded={false}>
          <InfoRow icon="shield-checkmark-outline" iconColor="#7C3AED" label="Role" value={roleText} chevron />
          <InfoRow icon="business-outline" iconColor="#7C3AED" label="Company" value={companyText} chevron />
          <InfoRow icon="people-outline" iconColor="#7C3AED" label="Main Group" value={mainGroupText} chevron />
          <InfoRow icon="location-outline" iconColor="#7C3AED" label="State" value={stateText} chevron />
          <InfoRow icon="pricetag-outline" iconColor="#7C3AED" label="Category" value={categoryText} chevron />
          <InfoRow icon="share-social-outline" iconColor="#7C3AED" label="Sub Group" value={subGroupText} chevron last />
        </Section>

        {/* App & Device — read-only build info to help users and support
            identify exactly which build is running. */}
        <Section icon="phone-portrait-outline" iconBg="#E6F7F1" iconColor="#0EA47A" title="App & Device Info" defaultExpanded={false}>
          <InfoRow icon="pricetag-outline" iconColor="#0EA47A" label="App Version" value={device.appVersion || "-"} />
          <InfoRow icon="construct-outline" iconColor="#0EA47A" label="Build Number" value={String(device.buildNumber)} />
          <InfoRow icon="phone-portrait-outline" iconColor="#0EA47A" label="Platform" value={platformLabel || "-"} last />
        </Section>

        <View style={{ height: insets.bottom + 90 }} />
      </ScrollView>
    </View>
  );
}

function Section({
  icon,
  iconBg,
  iconColor,
  title,
  children,
  defaultExpanded = true,
}: {
  icon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity
        style={[styles.sectionHeader, expanded && styles.sectionHeaderOpen]}
        activeOpacity={0.7}
        onPress={() => setExpanded((v) => !v)}
      >
        <View style={[styles.sectionIconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color="#94A3B8"
        />
      </TouchableOpacity>
      {expanded && children}
    </View>
  );
}

function InfoRow({
  icon,
  iconColor = "#475569",
  label,
  value,
  valueColor,
  pill,
  pillOn,
  chevron,
  onPress,
  last,
}: {
  icon: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  valueColor?: string;
  pill?: string;
  pillOn?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Ionicons name={icon} size={18} color={iconColor} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {pill != null ? (
          <View style={[styles.pill, pillOn ? styles.pillOn : styles.pillOff]}>
            <Text style={[styles.pillText, pillOn ? styles.pillTextOn : styles.pillTextOff]}>
              {pill}
            </Text>
          </View>
        ) : (
          <Text
            style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
            numberOfLines={2}
          >
            {value}
          </Text>
        )}
        {chevron && (
          <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 6 }} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6FB" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E9F0",
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F4F6FB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  headerTitle: { fontSize: fs(20), fontWeight: "800", color: COLORS.text },
  headerSubtitle: { fontSize: fs(12), color: "#64748B", marginTop: 2 },
  headerBellBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  headerBellBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  content: { padding: sp(16) },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    shadowColor: "#A7B0C0",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E8F0FE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileMain: { flex: 1 },
  profileName: { fontSize: fs(18), fontWeight: "800", color: COLORS.text },
  profileUsername: { fontSize: fs(13), color: "#94A3B8", marginTop: 4 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EAF1FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editBtnText: { fontSize: fs(13), fontWeight: "700", color: COLORS.primary },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#A7B0C0",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionHeaderOpen: {
    marginBottom: 6,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { flex: 1, fontSize: fs(16), fontWeight: "800", color: COLORS.text },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F4F9",
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { marginRight: 12 },
  rowLabel: { fontSize: fs(14), color: "#475569", fontWeight: "500" },
  rowRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
    flexShrink: 1,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillOn: { backgroundColor: "#DCFCE7" },
  pillOff: { backgroundColor: "#FEE2E2" },
  pillText: { fontSize: fs(13), fontWeight: "700" },
  pillTextOn: { color: "#16A34A" },
  pillTextOff: { color: "#DC2626" },

});
