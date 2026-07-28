import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import type { AttachmentStub } from "../types";

interface AttachmentPickerProps {
  label: string;
  attachments: AttachmentStub[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/**
 * Dashed drop-zone matching the app's upload affordance. UI only — onAdd is
 * wired to a dummy file entry rather than a real document picker.
 */
export default function AttachmentPicker({
  label,
  attachments,
  onAdd,
  onRemove,
}: AttachmentPickerProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.optional}> (Optional)</Text>
      </Text>

      <TouchableOpacity style={styles.dropZone} activeOpacity={0.8} onPress={onAdd}>
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.dropText}>
          <Text style={styles.dropTitle}>Tap to upload</Text>
          <Text style={styles.dropHint}>PNG, JPG or PDF up to 5 MB</Text>
        </View>
      </TouchableOpacity>

      {attachments.map((file) => (
        <View key={file.id} style={styles.fileRow}>
          <Ionicons name="document-attach-outline" size={16} color={COLORS.primary} />
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => onRemove(file.id)}
          >
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  optional: {
    color: COLORS.textMuted,
    fontWeight: "400",
  },
  dropZone: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.borderDashed,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dropText: {
    flex: 1,
  },
  dropTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  dropHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  fileName: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "500",
  },
});
