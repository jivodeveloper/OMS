import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { COLORS } from "@/src/constants/theme";

interface ApprovalSkeletonProps {
  /** How many placeholder cards to render. */
  count?: number;
}

/** One shimmering block — the building unit of the skeleton card. */
function Bar({
  width,
  height = 12,
  opacity,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  opacity: Animated.AnimatedInterpolation<number>;
  style?: object;
}) {
  return (
    <Animated.View
      style={[styles.bar, { width, height, opacity }, style]}
    />
  );
}

/**
 * Loading placeholder matching ApprovalCard's layout, so the transition from
 * skeleton to real content doesn't shift anything on screen.
 */
export default function ApprovalSkeleton({ count = 4 }: ApprovalSkeletonProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  return (
    <View style={styles.wrapper}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Bar width="60%" height={16} opacity={opacity} />
              <Bar width="80%" opacity={opacity} style={styles.mt8} />
            </View>
            <Bar width={70} height={22} opacity={opacity} style={styles.radius12} />
          </View>

          <View style={styles.partyRow}>
            <Bar width={36} height={36} opacity={opacity} style={styles.radius10} />
            <View style={styles.partyText}>
              <Bar width="55%" opacity={opacity} />
              <Bar width="40%" height={10} opacity={opacity} style={styles.mt6} />
            </View>
          </View>

          <Bar width="45%" height={10} opacity={opacity} style={styles.mt4} />

          <View style={styles.chipRow}>
            <Bar width={64} height={24} opacity={opacity} style={styles.radius8} />
            <Bar width={84} height={24} opacity={opacity} style={styles.radius8} />
            <Bar width={80} height={24} opacity={opacity} style={styles.radius8} />
          </View>

          <View style={styles.actionRow}>
            <Bar width="48%" height={40} opacity={opacity} style={styles.radius12} />
            <Bar width="48%" height={40} opacity={opacity} style={styles.radius12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bar: {
    backgroundColor: COLORS.border,
    borderRadius: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  partyText: {
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 16,
  },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  radius8: { borderRadius: 8 },
  radius10: { borderRadius: 10 },
  radius12: { borderRadius: 12 },
});
