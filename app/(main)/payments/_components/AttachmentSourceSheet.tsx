import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import type { PickSource } from "../_lib/pickAttachment";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (source: PickSource) => void;
}

/**
 * Bottom sheet offering every way to attach a file.
 *
 * "Files" deliberately covers Drive, OneDrive, Dropbox and the rest: the OS
 * document picker lists whichever providers are installed, so a user reaches
 * Drive through the sheet they already know rather than through a per-provider
 * integration this app would have to build and maintain.
 */
const SOURCES: {
  key: PickSource;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
}[] = [
  {
    key: "camera",
    icon: "camera",
    title: "Take photo",
    hint: "Open the camera and capture now",
  },
  {
    key: "gallery",
    icon: "images",
    title: "Photo gallery",
    hint: "Choose from photos already on this device",
  },
  {
    key: "files",
    icon: "folder-open",
    title: "Files, Drive & more",
    hint:
      Platform.OS === "android"
        ? "Google Drive, Downloads, or any file app"
        : "iCloud Drive, Google Drive, or any file app",
  },
];

export default function AttachmentSourceSheet({
  visible,
  onClose,
  onPick,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tapping the dimmed area closes, matching the platform convention. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Add attachment</Text>
          <Text style={styles.subtitle}>JPG, PNG or PDF · up to 5 MB each</Text>

          {SOURCES.map((source) => (
            <Pressable
              key={source.key}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onPick(source.key)}
              accessibilityRole="button"
              accessibilityLabel={source.title}
              accessibilityHint={source.hint}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={source.icon} size={20} color={COLORS.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{source.title}</Text>
                <Text style={styles.rowHint}>{source.hint}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>
          ))}

          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    // Clears the home indicator / gesture bar without needing safe-area context.
    paddingBottom: SPACING.xl,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 56,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  rowPressed: {
    backgroundColor: COLORS.inputBackground,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  rowHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  cancel: {
    marginTop: SPACING.sm,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
});
