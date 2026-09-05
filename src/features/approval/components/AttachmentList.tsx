import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import AttachmentCard from "./AttachmentCard";
import type { ApprovalAttachment } from "../types";

interface AttachmentListProps {
  attachments: ApprovalAttachment[];
  onView: (attachment: ApprovalAttachment) => void;
  onDownload: (attachment: ApprovalAttachment) => void;
  /**
   * Outer spacing, supplied by the screen.
   *
   * The approval page wraps its cards in a padded container; the deposit page
   * margins each card itself. A fixed gutter here would be right on one and
   * doubled on the other.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Attachments that do NOT belong to a specific payment method.
 *
 * A cheque image or UPI screenshot is shown inside its own payment card, where
 * the approver is already looking. This card is for the remainder — supporting
 * documents attached to the request as a whole.
 *
 * It renders NOTHING when there is no remainder: an empty "No attachments"
 * panel on every single-method request is noise, and its absence already says
 * the same thing.
 */
function AttachmentList({
  attachments,
  onView,
  onDownload,
  style,
}: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name="attach" size={ms(16)} color={COLORS.primary} />
        </View>
        <Text style={styles.sectionTitle}>Attachments</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{attachments.length}</Text>
        </View>
      </View>

      {attachments.map((attachment) => (
        <AttachmentCard
          key={attachment.id}
          attachment={attachment}
          onView={onView}
          onDownload={onDownload}
        />
      ))}
    </View>
  );
}

export default React.memo(AttachmentList);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(12),
  },
  sectionIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
  countPill: {
    minWidth: ms(20),
    paddingHorizontal: sp(7),
    paddingVertical: sp(2),
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
  },
  countText: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.primary,
  },
});
