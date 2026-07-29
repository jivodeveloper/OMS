import React, { useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import ApprovalStatusBadge from "./ApprovalStatusBadge";
import ApprovalTags from "./ApprovalTags";
import type { ApprovalRequest } from "../types";

interface ApprovalCardProps {
  request: ApprovalRequest;
  onViewDetails: (request: ApprovalRequest) => void;
  onReject: (request: ApprovalRequest) => void;
}

/** Icon per approval type, so the card is scannable without reading the label. */
const TYPE_ICON: Record<string, string> = {
  "Invoice Approval": "document-text-outline",
  "Payment Approval": "cash-outline",
  "Bank Deposit Approval": "business-outline",
};

const formatAmount = (amount: number) =>
  amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function ApprovalCard({ request, onViewDetails, onReject }: ApprovalCardProps) {
  // Subtle press-in scale, matching the tactile feel of the order cards.
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: true,
        speed: 40,
        bounciness: 0,
      }).start();
    },
    [scale],
  );

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={styles.card}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        onPress={() => onViewDetails(request)}
        accessibilityRole="button"
        accessibilityLabel={`Approval request ${request.requestNo}`}
      >
        {/* Row 1 — request number + status */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.requestNo}>{request.requestNo}</Text>
            {/* Row 2 — created date */}
            <Text style={styles.createdText}>Created: {request.createdDate}</Text>
          </View>
          <ApprovalStatusBadge status={request.status} />
        </View>

        {/* Row 3 — party */}
        <View style={styles.partyRow}>
          <View style={styles.iconBox}>
            <Ionicons name="person-outline" size={18} color={COLORS.primary} />
          </View>
          <View style={styles.partyText}>
            <Text style={styles.partyName} numberOfLines={1}>
              {request.party}
            </Text>
            {/* Row 4 — approval type */}
            <View style={styles.typeRow}>
              <Ionicons
                name={(TYPE_ICON[request.type] ?? "document-outline") as any}
                size={12}
                color={COLORS.textSecondary}
              />
              <Text style={styles.typeText} numberOfLines={1}>
                {request.type}
              </Text>
            </View>
          </View>
        </View>

        {/* Row 5 — company */}
        <View style={styles.companyRow}>
          <Ionicons name="business-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.companyText} numberOfLines={1}>
            {request.company}
          </Text>
        </View>

        {/* Info chips — invoice type · amount · approval level */}
        <View style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipText}>{request.invoiceType}</Text>
          </View>
          <View style={[styles.infoChip, styles.amountChip]}>
            <Text style={styles.amountChipText}>₹{formatAmount(request.amount)}</Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipText}>{request.level}</Text>
          </View>
        </View>

        <Text style={styles.createdBy}>Created By: {request.createdBy}</Text>

        <ApprovalTags tags={request.tags} />

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            activeOpacity={0.85}
            onPress={() => onReject(request)}
          >
            <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.detailsBtn]}
            activeOpacity={0.85}
            onPress={() => onViewDetails(request)}
          >
            <Ionicons name="eye-outline" size={16} color="#fff" />
            <Text style={styles.detailsText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// The list re-renders on every keystroke in the search box; without this each
// card would re-render even though its own data never changed.
export default React.memo(ApprovalCard);

const styles = StyleSheet.create({
  // Mirrors `orderCard` in the Order List so both lists read as one system.
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  requestNo: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  createdText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  partyText: {
    flex: 1,
  },
  partyName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  typeText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  companyText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  infoChip: {
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  infoChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  amountChip: {
    backgroundColor: COLORS.primaryLighter,
    borderColor: COLORS.borderBlue,
  },
  amountChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  createdBy: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  rejectBtn: {
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  rejectText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.error,
  },
  detailsBtn: {
    backgroundColor: COLORS.success,
  },
  detailsText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
