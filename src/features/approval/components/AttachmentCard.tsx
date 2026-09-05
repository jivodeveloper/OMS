import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { ApprovalAttachment } from "../types";

interface AttachmentCardProps {
  attachment: ApprovalAttachment;
  onView: (attachment: ApprovalAttachment) => void;
  onDownload: (attachment: ApprovalAttachment) => void;
}

/** Icon + tint per file kind, so PDFs and images are distinguishable at a glance. */
const KIND_META = {
  image: { icon: "image-outline" as const, tint: COLORS.primary, bg: COLORS.primaryLight },
  pdf: { icon: "document-text-outline" as const, tint: COLORS.error, bg: COLORS.errorLight },
};

function AttachmentCard({ attachment, onView, onDownload }: AttachmentCardProps) {
  const meta = KIND_META[attachment.kind];

  return (
    <View style={styles.card}>
      <View style={[styles.thumb, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.tint} />
      </View>

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text style={styles.meta}>
          {attachment.kind.toUpperCase()} · {attachment.size}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.8}
          onPress={() => onView(attachment)}
          accessibilityLabel={`View ${attachment.name}`}
        >
          <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.8}
          onPress={() => onDownload(attachment)}
          accessibilityLabel={`Download ${attachment.name}`}
        >
          <Ionicons name="download-outline" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(AttachmentCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    padding: sp(10),
    marginBottom: 10,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  // `minWidth: 0` so a long file name wraps or ellipsises inside the row
  // instead of pushing the view/download buttons off the card.
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: fs(13),
    fontWeight: "600",
    color: COLORS.text,
  },
  meta: {
    fontSize: fs(11),
    color: COLORS.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: sp(6),
    // Never squeezed: the buttons keep their tap target whatever the name
    // beside them is doing.
    flexShrink: 0,
  },
  iconBtn: {
    // Scaled, not fixed 34px — a 44px-wide tap target on a small phone and a
    // proportionate one on a tablet, matching every other control in the app.
    width: ms(34),
    height: ms(34),
    borderRadius: sp(10),
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    alignItems: "center",
    justifyContent: "center",
  },
});
