import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";

import { formatSize, type FileAttachment } from "../logic/attachments";

/**
 * One just-attached file, full screen.
 *
 * An image is shown here, in the app: the file is on this device — the picker
 * copied it into the cache — so it needs no download and no token, and what a
 * requester wants is to confirm they attached the right photo before they
 * submit.
 *
 * Anything else (a PDF, a spreadsheet) is handed to whatever app the device has
 * for it, the same `canOpenURL` / `openURL` pair the receipt viewer uses, and
 * says so plainly when the device has nothing that can open it.
 *
 * A file the SERVER holds — one already saved on a request being edited — has
 * no local uri. It is named rather than shown: downloading it would need the
 * request's file endpoint, which this form does not have.
 */
export default function PickedFileViewer({
  attachment,
  onClose,
}: {
  attachment: FileAttachment | null;
  onClose: () => void;
}) {
  const [error, setError] = useState("");

  if (!attachment) return null;

  const uri = attachment.file?.uri ?? "";
  const type = (attachment.file?.mimeType ?? "").toLowerCase();
  const isImage = type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(attachment.name);

  const openOutside = async () => {
    setError("");
    try {
      const can = await Linking.canOpenURL(uri).catch(() => false);
      if (!can) {
        setError("This device has no app that can open this file.");
        return;
      }
      await Linking.openURL(uri);
    } catch {
      setError("This file could not be opened on this device.");
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.name} numberOfLines={1}>
                {attachment.name}
              </Text>
              <Text style={styles.meta}>
                {formatSize(attachment.size)}
                {attachment.serverId ? " · already saved" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {isImage && uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons
                name="document-text-outline"
                size={ms(46)}
                color={COLORS.textMuted}
              />
              <Text style={styles.placeholderText}>
                {uri
                  ? "This file cannot be shown here."
                  : "This file is on the server — open the request to view it."}
              </Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {uri && !isImage ? (
            <TouchableOpacity style={styles.openBtn} onPress={openOutside} activeOpacity={0.85}>
              <Ionicons name="open-outline" size={ms(16)} color="#fff" />
              <Text style={styles.openBtnText}>Open with another app</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: sp(18),
  },
  sheet: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: COLORS.surface,
    borderRadius: sp(18),
    padding: sp(14),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    marginBottom: sp(12),
  },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: fs(14), fontWeight: "800", color: COLORS.text },
  meta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },
  image: {
    width: "100%",
    height: ms(380),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: sp(10),
    paddingVertical: sp(40),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
  },
  placeholderText: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: sp(24),
  },
  error: {
    fontSize: fs(12),
    color: COLORS.error,
    fontWeight: "600",
    marginTop: sp(10),
    textAlign: "center",
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    marginTop: sp(12),
    backgroundColor: COLORS.primary,
    borderRadius: sp(12),
    paddingVertical: sp(12),
  },
  openBtnText: { color: "#fff", fontSize: fs(13), fontWeight: "700" },
});
