import React, { useEffect, useRef } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

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
      <KeyboardAvoidingView
        style={styles.fill}
        // iOS does not resize the window for the keyboard; Android does.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity }]}>
          {/*
            THE DIM AREA IS A BUTTON. With a text box in the dialog the
            keyboard covers the footer, and the first thing anybody does is tap
            the blank space — which did nothing, because this was a plain
            View. One tap now puts the keyboard away and the buttons back.

            It does NOT close the dialog: a half-typed reason thrown away by a
            stray tap is worse than the keyboard.
          */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={Keyboard.dismiss}
            accessible={false}
          />

          {/*
            And the card SCROLLS. On a short screen a dialog with a remarks box
            is taller than what the keyboard leaves, so the footer has to be
            reachable by scrolling rather than only by closing the keyboard.
          */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
              {children}
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
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
  fill: { flex: 1 },
  // The scroll takes the backdrop's width so the card keeps its own margins,
  // and centres the card while it is short enough to fit.
  scroll: { width: "100%" },
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
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
