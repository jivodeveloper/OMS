import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { API_BASE_URL } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import type { ApprovalAttachment } from "../types";

interface Props {
  attachment: ApprovalAttachment | null;
  onClose: () => void;
}

/**
 * Full-screen viewer for one attachment.
 *
 * The download endpoint is permission-checked, so the file cannot simply be
 * handed to <Image source={{ uri }} /> or Linking.openURL — either sends an
 * unauthenticated request and comes back 401, which is what produced the
 * "image error" on screen.
 *
 * Instead the bytes are fetched WITH the bearer token and rendered from a data
 * URI. That keeps everything in-app (no extra native module, no file left on
 * disk) and works identically on both platforms.
 */
export default function AttachmentViewer({ attachment, onClose }: Props) {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPdf = attachment?.kind === "pdf";

  const load = useCallback(async () => {
    if (!attachment?.downloadUrl || isPdf) return;
    setLoading(true);
    setError("");
    setDataUri(null);
    try {
      const token = await storage.getAccessToken();
      // `downloadUrl` is a server path ("/api/payments/attachments/7/download/")
      // while API_BASE_URL already ends in "/api" — strip the duplicate.
      const base = API_BASE_URL.replace(/\/api\/?$/, "");
      const res = await fetch(`${base}${attachment.downloadUrl}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        setError(
          res.status === 403
            ? "You do not have permission to view this file."
            : res.status === 404
              ? "The file is missing from the store."
              : `Could not load the file (${res.status}).`,
        );
        return;
      }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onerror = () => setError("The file could not be read.");
      reader.onloadend = () => setDataUri(reader.result as string);
      reader.readAsDataURL(blob);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  }, [attachment, isPdf]);

  useEffect(() => {
    if (attachment) void load();
  }, [attachment, load]);

  return (
    <Modal
      visible={!!attachment}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {attachment?.name}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={ms(24)} color="#fff" />
          </Pressable>
        </View>

        <Pressable style={styles.body} onPress={onClose}>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : error ? (
            <View style={styles.message}>
              <Ionicons
                name="alert-circle-outline"
                size={ms(40)}
                color={COLORS.error}
              />
              <Text style={styles.messageText}>{error}</Text>
            </View>
          ) : isPdf ? (
            // A PDF cannot be shown by <Image>. Saying so beats a blank screen.
            <View style={styles.message}>
              <Ionicons
                name="document-text-outline"
                size={ms(48)}
                color="#fff"
              />
              <Text style={styles.messageText}>
                {attachment?.name}
              </Text>
              <Text style={styles.messageHint}>
                PDF preview is not supported in the app yet.
              </Text>
            </View>
          ) : dataUri ? (
            <Image
              source={{ uri: dataUri }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>

        <Text style={styles.hint}>Tap anywhere to close</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(12),
    paddingTop: sp(48),
    paddingHorizontal: sp(16),
    paddingBottom: sp(12),
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "700",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sp(12),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  message: {
    alignItems: "center",
    gap: sp(10),
    paddingHorizontal: sp(24),
  },
  messageText: {
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "600",
    textAlign: "center",
  },
  messageHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: fs(12),
    textAlign: "center",
  },
  hint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: fs(12),
    textAlign: "center",
    paddingBottom: sp(32),
  },
});
