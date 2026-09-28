import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
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

import { appAlert } from "@/src/components/common/AppDialog";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * One attached file, opened.
 *
 * AN IMAGE STAYS IN THE APP, pinch-to-zoom and pan, exactly as the payment
 * receipt does — someone checking a photographed bill needs to read the figures
 * on it, and a thumbnail cannot answer that. ANYTHING ELSE goes to the device:
 * a PDF is downloaded and handed to whatever app opens PDFs, because rendering
 * one here would mean a PDF engine this app does not carry.
 *
 * Both paths go through the service, which fetches WITH the bearer token: these
 * endpoints are permission-checked, so handing the URL to `<Image>` or
 * `openURL` would send an unauthenticated request and come back 401.
 */
export interface AttachmentSource {
  /** What the file is called — and, by its extension, how it is opened. */
  name: string;
  /** The bytes as a data URI, for an image. */
  load: () => Promise<string>;
  /** The bytes as a local file, for everything else. */
  save: () => Promise<string>;
}

const isImageName = (name: string) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);

export default function AttachmentViewerModal({
  source,
  onClose,
}: {
  source: AttachmentSource | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
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

  const image = source ? isImageName(source.name) : false;

  useEffect(() => {
    if (!source) {
      setUri(null);
      setError(null);
      resetZoom();
      return;
    }
    if (!image) return; // A PDF is opened outside; nothing to render here.
    let alive = true;
    setLoading(true);
    setError(null);
    setUri(null);
    source
      .load()
      .then((dataUri) => {
        if (!alive) return;
        Image.getSize(
          dataUri,
          (w, h) => alive && setRatio(w > 0 ? h / w : 1.414),
          () => alive && setRatio(1.414),
        );
        setUri(dataUri);
      })
      .catch((err) => {
        if (alive) setError((err as Error)?.message || "That file could not be opened.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [source, image, resetZoom]);

  /**
   * Hand the file to the device.
   *
   * Also the whole of what happens for a PDF: the modal opens, this runs, and
   * the user lands in their PDF app — so the modal closes itself rather than
   * leaving an empty sheet behind them.
   */
  const openOutside = useCallback(
    async (thenClose: boolean) => {
      if (!source || saving) return;
      setSaving(true);
      try {
        const fileUri = await source.save();
        const can = await Linking.canOpenURL(fileUri).catch(() => false);
        if (can) {
          await Linking.openURL(fileUri);
          if (thenClose) onClose();
        } else {
          appAlert(
            "Saved to this device",
            `${source.name} was downloaded, but no app on this device can open it.`,
          );
          if (thenClose) onClose();
        }
      } catch (err) {
        appAlert("Could not open", (err as Error)?.message || "That file could not be opened.");
        if (thenClose) onClose();
      } finally {
        setSaving(false);
      }
    },
    [source, saving, onClose],
  );

  // A PDF never renders here — it goes straight out to the device.
  useEffect(() => {
    if (source && !image) void openOutside(true);
    // openOutside changes with `saving`, which would re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, image]);

  // Gestures: pinch to zoom, pan when zoomed, double-tap to toggle.
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
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
    .onUpdate((event) => {
      if (scale.value <= MIN_SCALE) return;
      tx.value = savedTx.value + event.translationX;
      ty.value = savedTy.value + event.translationY;
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

  const imgWidth = width - sp(24);
  const imgHeight = imgWidth * ratio;

  // The sheet is for images only; a PDF has already left for another app.
  if (!source || !image) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + sp(10) }]}>
          <Text style={styles.title} numberOfLines={1}>
            {source.name}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : uri ? (
            <GestureDetector gesture={composed}>
              <Animated.Image
                source={{ uri }}
                style={[{ width: imgWidth, height: imgHeight }, imgStyle]}
                resizeMode="contain"
              />
            </GestureDetector>
          ) : null}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + sp(12) }]}>
          <Text style={styles.hint}>Pinch to zoom · double-tap to reset</Text>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => openOutside(false)}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={18} color="#fff" />
            )}
            <Text style={styles.saveBtnText}>
              {saving ? "Saving…" : "Save / open outside"}
            </Text>
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(12),
    paddingHorizontal: sp(16),
    paddingBottom: sp(10),
  },
  title: { flex: 1, color: "#fff", fontSize: fs(14), fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    color: "#FCA5A5",
    fontSize: fs(13),
    textAlign: "center",
    paddingHorizontal: sp(32),
  },
  footer: { paddingHorizontal: sp(16), gap: sp(10), alignItems: "center" },
  hint: { color: "rgba(255,255,255,0.6)", fontSize: fs(11) },
  saveBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    backgroundColor: COLORS.primary,
    borderRadius: sp(12),
    paddingVertical: sp(13),
  },
  saveBtnText: { color: "#fff", fontSize: fs(13), fontWeight: "700" },
});
