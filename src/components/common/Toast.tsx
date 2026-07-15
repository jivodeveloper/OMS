import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

/**
 * Lightweight app-wide toast. Mount <ToastHost /> once near the app root, then
 * call `showToast(...)` from anywhere (module-level store, same pattern as
 * AppDialog). Use for non-blocking feedback; use appAlert for anything the user
 * must acknowledge.
 */

export type ToastType = "success" | "error" | "info";

type ToastState = { message: string; type: ToastType; id: number } | null;

let notify: ((toast: ToastState) => void) | null = null;
let nextId = 1;

export const showToast = (message: string, type: ToastType = "info") => {
  notify?.({ message, type, id: nextId++ });
};

const TONE: Record<ToastType, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { color: COLORS.success, icon: "checkmark-circle" },
  error: { color: COLORS.error, icon: "alert-circle" },
  info: { color: COLORS.primary, icon: "information-circle" },
};

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    notify = setToast;
    return () => {
      notify = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setToast(null);
      });
    }, 2400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast, opacity, translateY]);

  if (!toast) return null;

  const tone = TONE[toast.type] ?? TONE.info;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { bottom: insets.bottom + 96, opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={[styles.toast, { borderLeftColor: tone.color }]}>
        <Ionicons name={tone.icon} size={18} color={tone.color} />
        <Text style={styles.text} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 460,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: COLORS.text,
  },
});
