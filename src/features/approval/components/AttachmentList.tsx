import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Surface } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import AttachmentCard from "./AttachmentCard";
import type { ApprovalAttachment } from "../types";

interface AttachmentListProps {
  attachments: ApprovalAttachment[];
  onView: (attachment: ApprovalAttachment) => void;
  onDownload: (attachment: ApprovalAttachment) => void;
}

/** Attachments section, with its own empty state when nothing is uploaded. */
function AttachmentList({ attachments, onView, onDownload }: AttachmentListProps) {
  return (
    <Surface style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIndicator} />
        <Text style={styles.sectionTitle}>ATTACHMENTS</Text>
        {attachments.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{attachments.length}</Text>
          </View>
        ) : null}
      </View>

      {attachments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No attachments uploaded.</Text>
        </View>
      ) : (
        attachments.map((attachment) => (
          <AttachmentCard
            key={attachment.id}
            attachment={attachment}
            onView={onView}
            onDownload={onDownload}
          />
        ))
      )}
    </Surface>
  );
}

export default React.memo(AttachmentList);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIndicator: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  countPill: {
    minWidth: 20,
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },
  empty: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
