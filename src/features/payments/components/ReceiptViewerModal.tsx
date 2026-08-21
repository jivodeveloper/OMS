import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import { paymentsService } from "@/src/services/payments.service";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * In-app receipt viewer. Shows the OMS-generated SAP-style receipt as an image
 * (rendered server-side to PNG), so no external PDF viewer is needed. The image
 * is pinch-to-zoom and pan (works on Android + iOS), with a Download button at
 * the bottom that saves the PDF and hands it to the OS.
 */
export default function ReceiptViewerModal({
  visible,
  receiptId,
  receiptNo,
  onClose,
}: {
  visible: boolean;
  receiptId: number | null;
  receiptNo?: string;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.414); // A4 portrait fallback (h/w)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pinch-zoom + pan state (shared values → run on the UI thread).
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  }, [scale, savedScale, tx, ty, savedTx, savedTy]);

  const load = useCallback(async () => {
    if (receiptId == null) return;
    setLoading(true);
    setError(null);
    setUri(null);
    try {
      const dataUri = await paymentsService.getReceiptImage(receiptId);
      Image.getSize(
        dataUri,
        (w, h) => setRatio(w > 0 ? h / w : 1.414),
        () => setRatio(1.414),
      );
      setUri(dataUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the receipt.");
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    if (visible && receiptId != null) void load();
    if (!visible) {
      setUri(null);
      setError(null);
      resetZoom();
    }
  }, [visible, receiptId, load, resetZoom]);

  const onDownload = useCallback(async () => {
    if (receiptId == null || saving) return;
    setSaving(true);
    try {
      const fileUri = await paymentsService.saveReceiptToDevice(receiptId, receiptNo);
      const canOpen = await Linking.canOpenURL(fileUri).catch(() => false);
      if (canOpen) {
        await Linking.openURL(fileUri);
      } else {
        Alert.alert(
          "Downloaded",
          "The receipt PDF was saved to the app. No app is installed to open a PDF, so it could not be opened automatically.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Download failed",
        e instanceof Error ? e.message : "Could not save the receipt.",
      );
    } finally {
      setSaving(false);
    }
  }, [receiptId, receiptNo, saving]);

  // Gestures: pinch to zoom, pan when zoomed, double-tap to toggle.
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= MIN_SCALE) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        runOnJS(resetZoom)();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // Fit the image inside the viewport, leaving top/bottom breathing room.
  const imgWidth = width - sp(24);
  const imgHeight = imgWidth * ratio;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + sp(10) }]}>
          <Text style={styles.title} numberOfLines={1}>
            {receiptNo ? `Receipt ${receiptNo}` : "Payment Receipt"}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close receipt"
          >
            <Ionicons name="close" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.viewport}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.hint}>Preparing receipt…</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : uri ? (
            <GestureDetector gesture={composed}>
              <Animated.View style={styles.imageWrap}>
                <Animated.Image
                  source={{ uri }}
                  style={[{ width: imgWidth, height: imgHeight }, imgStyle]}
                  resizeMode="contain"
                />
              </Animated.View>
            </GestureDetector>
          ) : null}
          {uri ? (
            <Text style={styles.zoomHint}>Pinch to zoom · double-tap to reset</Text>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + sp(12) }]}>
          <TouchableOpacity
            style={[styles.downloadBtn, (saving || !uri) && styles.downloadBtnDisabled]}
            onPress={onDownload}
            disabled={saving || !uri}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Download receipt"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={20} color="#fff" />
            )}
            <Text style={styles.downloadText}>{saving ? "Saving…" : "Download"}</Text>
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sp(16),
    paddingBottom: sp(12),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  title: { flex: 1, fontSize: fs(16), fontWeight: "800", color: COLORS.text, marginRight: sp(12) },
  // The viewport centers the image and provides top/bottom breathing room.
  viewport: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp(12),
    paddingTop: sp(16),
    paddingBottom: sp(8),
    overflow: "hidden",
  },
  imageWrap: { alignItems: "center", justifyContent: "center" },
  centered: { alignItems: "center", gap: sp(10) },
  hint: { color: COLORS.textSecondary, fontSize: fs(13) },
  errorText: { color: COLORS.error, fontSize: fs(13.5), textAlign: "center", paddingHorizontal: sp(24) },
  zoomHint: {
    position: "absolute",
    bottom: sp(8),
    color: COLORS.textMuted,
    fontSize: fs(11),
  },
  footer: {
    paddingHorizontal: sp(14),
    paddingTop: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    backgroundColor: COLORS.primary,
    borderRadius: sp(12),
    paddingVertical: sp(14),
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadText: { color: "#fff", fontSize: fs(15), fontWeight: "700" },
});
