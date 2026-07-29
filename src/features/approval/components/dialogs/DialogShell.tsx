import React, { useEffect, useRef } from "react";
import { Animated, Modal, StyleSheet, View } from "react-native";

interface DialogShellProps {
  visible: boolean;
  /** False for the loading dialog, which must not be interrupted. */
  dismissable?: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
}

/**
 * Animated modal container shared by every approval dialog: fade-in backdrop
 * plus a scale-up card. Centralising it here keeps the three dialogs visually
 * identical and stops each one re-implementing the same animation.
 */
export default function DialogShell({
  visible,
  dismissable = true,
  onRequestClose,
  children,
}: DialogShellProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!visible) {
      // Reset so the next open animates from the start rather than snapping in.
      opacity.setValue(0);
      scale.setValue(0.9);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 16,
        bounciness: 6,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      // Fade is handled by the animated views so open/close stay in sync.
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (dismissable) onRequestClose?.();
      }}
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Matches AppDialog's backdrop/card so approval dialogs feel native to the app.
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
  },
});

export const dialogShellStyles = styles;

/** Spacer used by dialogs that need a divider above their footer. */
export function DialogDivider() {
  return <View style={dividerStyles.divider} />;
}

const dividerStyles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: "#E8EEF4",
    marginVertical: 16,
  },
});
