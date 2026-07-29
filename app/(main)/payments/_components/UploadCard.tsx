import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

interface UploadCardProps {
  title: string;
  hint: string;
  icon: string;
  /** A dummy filename once "uploaded" — null shows the empty drop state. */
  fileName: string | null;
  onPress: () => void;
  onClear: () => void;
}

/** Single upload slot: dashed drop state, or a preview placeholder once filled. */
export default function UploadCard({
  title,
  hint,
  icon,
  fileName,
  onPress,
  onClear,
}: UploadCardProps) {
  if (fileName) {
    return (
      <View style={styles.filledCard}>
        <View style={styles.previewThumb}>
          <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
        </View>
        <View style={styles.filledText}>
          <Text style={styles.filledTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.filledName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onClear}
          accessibilityLabel={`Remove ${title}`}
        >
          <Ionicons name="close-circle" size={20} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon as any} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.hint} numberOfLines={1}>
        {hint}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.borderDashed,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
    textAlign: "center",
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  filledCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filledText: {
    flex: 1,
  },
  filledTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  filledName: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
