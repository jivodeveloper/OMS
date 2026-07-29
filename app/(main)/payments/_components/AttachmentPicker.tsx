import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import type { AttachmentStub } from "../_lib/types";

interface AttachmentPickerProps {
  label: string;
  attachments: AttachmentStub[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}

/**
 * Dashed drop-zone matching the app's upload affordance, followed by a preview
 * tile per file. UI only — onAdd appends a dummy entry rather than opening a
 * real document picker, and the preview is a placeholder rather than an Image.
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
          <Text style={styles.dropTitle}>Tap to Upload</Text>
          <Text style={styles.dropHint}>PNG, JPG or PDF up to 5 MB</Text>
        </View>
      </TouchableOpacity>

      {attachments.length > 0 ? (
        <View style={styles.previewGrid}>
          {attachments.map((file) => (
            <View key={file.id} style={styles.previewTile}>
              <View style={styles.previewImage}>
                <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                <Text style={styles.previewImageHint}>Preview</Text>
              </View>

              <Text style={styles.previewName} numberOfLines={1}>
                {file.name}
              </Text>

              <TouchableOpacity
                style={styles.previewRemove}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => onRemove(file.id)}
                accessibilityLabel={`Remove ${file.name}`}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
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
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  previewTile: {
    width: 96,
  },
  previewImage: {
    height: 72,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  previewImageHint: {
    fontSize: 9,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  previewName: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  previewRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
  },
});
