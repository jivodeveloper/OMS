import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import type { AttachmentStub } from "../_lib/types";
import {
  formatSize,
  pickFrom,
  type PickSource,
  type PickedFile,
} from "../_lib/pickAttachment";
import AttachmentSourceSheet from "./AttachmentSourceSheet";

interface AttachmentPickerProps {
  label: string;
  attachments: AttachmentStub[];
  /** Receives every file that passed type/size validation. */
  onAdd: (files: PickedFile[]) => void;
  onRemove: (id: string) => void;
  /** Cap per section — the sheet is refused once this many are attached. */
  maxFiles?: number;
}

/**
 * Dashed drop-zone plus a preview tile per file.
 *
 * Tapping it opens a source sheet (camera / gallery / files) rather than one
 * fixed picker, because a collector in the field photographs a cheque while
 * someone at a desk attaches a PDF that arrived by email.
 */
export default function AttachmentPicker({
  label,
  attachments,
  onAdd,
  onRemove,
  maxFiles = 5,
}: AttachmentPickerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const atLimit = attachments.length >= maxFiles;

  const handlePick = async (source: PickSource) => {
    setSheetOpen(false);
    setBusy(true);
    try {
      const picked = await pickFrom(source);
      if (!picked.length) return;
      // Never exceed the cap, even if the user multi-selected past it.
      const room = Math.max(0, maxFiles - attachments.length);
      onAdd(picked.slice(0, room));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        <Text style={styles.optional}> (Optional)</Text>
      </Text>

      <TouchableOpacity
        style={[styles.dropZone, atLimit && styles.dropZoneDisabled]}
        activeOpacity={0.8}
        onPress={() => setSheetOpen(true)}
        disabled={atLimit || busy}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label}`}
        accessibilityHint="Choose camera, gallery or files"
      >
        <View style={styles.iconCircle}>
          <Ionicons
            name={busy ? "hourglass-outline" : "cloud-upload-outline"}
            size={18}
            color={atLimit ? COLORS.textMuted : COLORS.primary}
          />
        </View>
        <View style={styles.dropText}>
          <Text style={[styles.dropTitle, atLimit && styles.dropTitleDisabled]}>
            {busy
              ? "Opening..."
              : atLimit
                ? `Limit reached (${maxFiles} files)`
                : "Tap to Upload"}
          </Text>
          <Text style={styles.dropHint}>
            {atLimit
              ? "Remove one to add another"
              : "Camera, gallery or files · JPG, PNG, PDF up to 5 MB"}
          </Text>
        </View>
        {!atLimit && !busy ? (
          <Ionicons name="add-circle" size={22} color={COLORS.primary} />
        ) : null}
      </TouchableOpacity>

      {attachments.length > 0 ? (
        <View style={styles.previewGrid}>
          {attachments.map((file) => {
            const isPdf = file.name.toLowerCase().endsWith(".pdf");
            return (
              <View key={file.id} style={styles.previewTile}>
                <View style={styles.previewImage}>
                  {/* A picked image has a local uri, so show the real thing —
                      a collector needs to confirm the cheque is legible. */}
                  {file.uri && !isPdf ? (
                    <Image
                      source={{ uri: file.uri }}
                      style={styles.previewThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={isPdf ? "document-text-outline" : "image-outline"}
                        size={22}
                        color={COLORS.textMuted}
                      />
                      <Text style={styles.previewImageHint}>
                        {isPdf ? "PDF" : "Preview"}
                      </Text>
                    </>
                  )}
                </View>

                <Text style={styles.previewName} numberOfLines={1}>
                  {file.name}
                </Text>
                {file.size ? (
                  <Text style={styles.previewSize}>{formatSize(file.size)}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.previewRemove}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => onRemove(file.id)}
                  accessibilityLabel={`Remove ${file.name}`}
                >
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : null}

      <AttachmentSourceSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={handlePick}
      />
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
  dropZoneDisabled: {
    backgroundColor: COLORS.inputBackground,
    borderColor: COLORS.border,
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
  dropTitleDisabled: {
    color: COLORS.textMuted,
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
    overflow: "hidden",
  },
  previewThumb: {
    width: "100%",
    height: "100%",
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
  previewSize: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  previewRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
  },
});
