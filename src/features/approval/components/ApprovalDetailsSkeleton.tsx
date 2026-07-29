import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { COLORS } from "@/src/constants/theme";

/**
 * Loading placeholder shaped like the details screen (gradient header, two
 * cards) so the swap to real content doesn't shift anything on screen.
 */
export default function ApprovalDetailsSkeleton() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  const Bar = ({
    width,
    height = 12,
    style,
  }: {
    width: number | `${number}%`;
    height?: number;
    style?: object;
  }) => (
    <Animated.View style={[styles.bar, { width, height, opacity }, style]} />
  );

  return (
    <View style={styles.wrapper}>
      {/* Header block */}
      <View style={styles.header}>
        <Bar width="55%" height={20} style={styles.onDark} />
        <Bar width="40%" style={[styles.onDark, styles.mt12]} />
        <Bar width="60%" height={10} style={[styles.onDark, styles.mt8]} />
      </View>

      <View style={styles.body}>
        {[0, 1].map((index) => (
          <View key={index} style={styles.card}>
            <Bar width="35%" height={10} />
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={styles.row}>
                <Bar width="30%" />
                <Bar width="45%" />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  onDark: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  body: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  bar: {
    backgroundColor: COLORS.border,
    borderRadius: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
});
