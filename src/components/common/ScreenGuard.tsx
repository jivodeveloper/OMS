import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { useAuth } from "@/src/context/AuthContext";
import { canAccessScreen } from "@/src/constants/pages";

interface ScreenGuardProps {
  /** SCREEN_ROLES key for this route, e.g. "payments/receive-payment". */
  screen: string;
  children: React.ReactNode;
}

/**
 * Renders `children` only when the signed-in user may access `screen`.
 *
 * The drawer already hides menu items the user can't open, and the bottom bar
 * gates its taps — but neither stops the screen itself from mounting when it is
 * reached another way: a deep link, a `router.push` from elsewhere, restored
 * navigation state after a cold start, or a permission revoked while the user
 * sat on the page. This is the last line of defence, so access is decided where
 * the screen actually renders rather than only where it is launched from.
 *
 * Note this is a UI guard, not a security boundary — the API must enforce the
 * same rules server-side. It exists so a user never sees a page they have no
 * rights to, not to protect the data behind it.
 */
export default function ScreenGuard({ screen, children }: ScreenGuardProps) {
  const { user, isLoading } = useAuth();

  // Wait for the profile before deciding — rendering the denial while the user
  // is still loading would flash "Access restricted" on every cold start.
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const allowed = canAccessScreen(screen, user?.role, user?.extra_pages || []);

  if (allowed) return <>{children}</>;

  return (
    <View style={styles.centered}>
      <View style={styles.lockCircle}>
        <Ionicons name="lock-closed" size={28} color={COLORS.error} />
      </View>

      <Text style={styles.title}>Access restricted</Text>
      <Text style={styles.message}>
        You don&apos;t have permission to open this page. Please contact your
        administrator if you need access.
      </Text>

      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.85}
        onPress={() => {
          // Home is always reachable (see canAccessScreen), so this can't loop
          // back into another denial.
          if (router.canGoBack()) router.back();
          else router.replace("/(main)/dashboard" as never);
        }}
      >
        <Ionicons name="arrow-back" size={16} color="#fff" />
        <Text style={styles.buttonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 32,
  },
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
