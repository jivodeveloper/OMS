import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import {
  DrawerContentScrollView,
  DrawerItemList,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { Text, Divider } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS } from "@/src/constants/theme";

export default function CustomDrawer(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();

  const performLogout = async () => {
    await logout();
    router.replace("/(auth)/login" as any);
  };

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        {/* User Avatar */}
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={["rgba(255,255,255,0.2)", "rgba(255,255,255,0.1)"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() ||
                user?.username?.charAt(0)?.toUpperCase() ||
                "U"}
            </Text>
          </LinearGradient>
          <View style={styles.onlineIndicator} />
        </View>

        {/* User Info */}
        <Text style={styles.userName}>
          {user?.name || user?.username || "User"}
        </Text>
        <Text style={styles.userRole}>{user?.role || "Member"}</Text>

        {/* Company Badge */}
        {user?.company && (
          <View style={styles.companyBadge}>
            <Text style={styles.companyText}>{user.company.name}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Navigation Items */}
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.drawerContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.menuSection}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Divider style={styles.divider} />

        <TouchableOpacity style={styles.logoutButton} onPress={performLogout}>
          <View style={styles.logoutIconContainer}>
            <Text style={styles.logoutIcon}>⎋</Text>
          </View>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 20,
    position: "relative",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.textLight,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#22C55E",
    borderWidth: 3,
    borderColor: COLORS.primaryDark,
  },
  userName: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textLight,
    marginBottom: 2,
  },
  userRole: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    textTransform: "capitalize",
    marginBottom: 12,
  },
  companyBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  companyText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textLight,
  },
  drawerContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  menuSection: {
    paddingHorizontal: 10,
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginLeft: 16,
    marginBottom: 8,
    marginTop: 8,
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
  },
  divider: {
    backgroundColor: COLORS.border,
    marginBottom: 16,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  logoutIcon: {
    fontSize: 16,
    color: COLORS.textLight,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.error,
  },
  version: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 16,
  },
});
