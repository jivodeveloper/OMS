import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import type { ApprovalDetail } from "../types";

interface ApprovalHeaderCardProps {
  detail: ApprovalDetail;
}

/**
 * Gradient summary header — same construction as the Order Details header
 * (flush under the navbar, 24pt bottom corners) so the two screens match.
 */
function ApprovalHeaderCard({ detail }: ApprovalHeaderCardProps) {
  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.topRow}>
        <Text style={styles.requestNo} numberOfLines={1}>
          {detail.requestNo}
        </Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{detail.status}</Text>
        </View>
      </View>

      <Text style={styles.party} numberOfLines={1}>
        {detail.party}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="business-outline" size={13} color="#BFDBFE" />
        <Text style={styles.metaText} numberOfLines={1}>
          {detail.company}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={13} color="#BFDBFE" />
          <Text style={styles.footerText}>{detail.createdDate}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={13} color="#BFDBFE" />
          <Text style={styles.footerText}>{detail.createdTime}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export default React.memo(ApprovalHeaderCard);

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  requestNo: {
    flex: 1,
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusPill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.warning,
  },
  party: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  metaText: {
    flex: 1,
    color: "#DBEAFE",
    fontSize: 12,
  },
  footerRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
