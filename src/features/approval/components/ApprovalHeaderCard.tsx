import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { ApprovalDetail } from "../types";

interface ApprovalHeaderCardProps {
  detail: ApprovalDetail;
}

/** Pill colour follows the outcome, not one flat accent. */
const STATUS_COLOR: Record<string, string> = {
  Pending: COLORS.warning,
  Approved: COLORS.success,
  Rejected: COLORS.error,
};

/**
 * Gradient summary header — same construction as the Order Details header
 * (flush under the navbar, 24pt bottom corners) so the two screens match.
 *
 * Carries only what identifies the document: its number, who paid, and where it
 * has got to. Company, created-by, date and time all live in General
 * Information — repeating them here made the header tall enough to push the
 * actual content off the first screen.
 */
function ApprovalHeaderCard({ detail }: ApprovalHeaderCardProps) {
  const statusColor = STATUS_COLOR[detail.status] ?? COLORS.warning;

  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.topRow}>
        <Text style={styles.requestNo} numberOfLines={1} adjustsFontSizeToFit>
          {detail.requestNo}
        </Text>


        <View style={styles.statusPill}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {detail.status}
          </Text>
        </View>
      </View>

      {/* Party and its SAP code share a row: the name is what a person reads,
          the code is what they quote to accounts. */}
      <View style={styles.partyRow}>
        <Ionicons name="person-outline" size={ms(14)} color="#BFDBFE" />
        <Text style={styles.party} numberOfLines={1}>
          {detail.party}
        </Text>
        {!!detail.partyCode && (
          <>
            <View style={styles.separator} />
            <Text style={styles.partyCode} numberOfLines={1}>
              {detail.partyCode}
            </Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

export default React.memo(ApprovalHeaderCard);

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
  },
  requestNo: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: fs(19),
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusPill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: sp(5),
    paddingHorizontal: sp(12),
  },
  statusText: {
    fontSize: fs(11),
    fontWeight: "800",
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(12),
  },
  party: {
    flexShrink: 1,
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "700",
  },
  separator: {
    width: 1,
    height: ms(12),
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  partyCode: {
    color: "#DBEAFE",
    fontSize: fs(12),
    fontWeight: "600",
  },
});
