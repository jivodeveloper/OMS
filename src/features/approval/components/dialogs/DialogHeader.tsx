import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";

interface DialogHeaderProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Drives the icon colour and its circle tint. */
  accent: string;
  title: string;
  subtitle: string;
  /** Omit to hide the close button (loading dialog). */
  onClose?: () => void;
  /** Pops the icon in — used for the success checkmark. */
  animateIcon?: boolean;
}

/** Close button + circled icon + title/subtitle, shared by all approval dialogs. */
export default function DialogHeader({
  icon,
  accent,
  title,
  subtitle,
  onClose,
  animateIcon = false,
}: DialogHeaderProps) {
  const scale = useRef(new Animated.Value(animateIcon ? 0.4 : 1)).current;

  useEffect(() => {
    if (!animateIcon) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 12,
      bounciness: 12,
    }).start();
  }, [animateIcon, scale]);

  return (
    <View style={styles.wrapper}>
      {onClose ? (
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <Animated.View
        style={[
          styles.iconWrap,
          { backgroundColor: accent + "1A", transform: [{ scale }] },
        ]}
      >
        <Ionicons name={icon} size={34} color={accent} />
      </Animated.View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    zIndex: 2,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },
});
