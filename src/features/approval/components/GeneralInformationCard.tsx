import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Surface } from "react-native-paper";
import { COLORS } from "@/src/constants/theme";
import type { ApprovalDetail } from "../types";

interface GeneralInformationCardProps {
  detail: ApprovalDetail;
  onPressInvoice: (invoice: string) => void;
}

const formatAmount = (amount: number) =>
  amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Label/value rows for the request's core fields. */
function GeneralInformationCard({
  detail,
  onPressInvoice,
}: GeneralInformationCardProps) {
  return (
    <Surface style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIndicator} />
        <Text style={styles.sectionTitle}>GENERAL INFORMATION</Text>
      </View>

      <Row label="Party" value={detail.party} />
      <Row label="Company" value={detail.company} />
      <Row label="Created By" value={detail.createdBy} />

      {/* Invoice reads as a link; navigation lands in a later phase. */}
      <View style={styles.row}>
        <Text style={styles.label}>Invoice Number</Text>
        <TouchableOpacity
          onPress={() => onPressInvoice(detail.invoice)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="link"
        >
          <Text style={styles.link}>{detail.invoice}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Payment Type</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{detail.paymentType}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.amount}>₹{formatAmount(detail.amount)}</Text>
      </View>

      <View style={styles.remarksWrap}>
        <Text style={styles.label}>Remarks</Text>
        <Text style={styles.remarks}>{detail.remarks}</Text>
      </View>
    </Surface>
  );
}

/** Plain label/value pair — the default row shape for this card. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default React.memo(GeneralInformationCard);

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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 7,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  value: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },
  link: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
  badge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.success,
  },
  remarksWrap: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  remarks: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
    marginTop: 6,
  },
});
