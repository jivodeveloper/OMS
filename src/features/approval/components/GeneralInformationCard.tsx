import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { ApprovalDetail } from "../types";

interface GeneralInformationCardProps {
  detail: ApprovalDetail;
}

/**
 * The request's core facts, as a two-column icon grid.
 *
 * Paired fields sit side by side so the card stays short enough to read without
 * scrolling — an approver checks these against the paperwork in front of them,
 * and a long single column pushes fields off screen. The SAP branch and remarks
 * are full width: both carry values too long for a half-width cell.
 *
 * The amount is deliberately NOT here — the header card states it and Invoice
 * Summary states it again, so a third copy only crowded the grid.
 */
function GeneralInformationCard({ detail }: GeneralInformationCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerIcon}>
          <Ionicons
            name="information-circle"
            size={ms(16)}
            color={COLORS.primary}
          />
        </View>
        <Text style={styles.cardTitle}>General Information</Text>
      </View>

      <View style={styles.grid}>
        <Field icon="business-outline" label="Company" value={detail.company} />
        <Field icon="person-outline" label="Created By" value={detail.createdBy} />
      </View>

      <View style={styles.divider} />

      <View style={styles.grid}>
        <Field
          icon="document-text-outline"
          label="Invoice"
          value={detail.invoice}
          tone="link"
        />
        <Field
          icon="wallet-outline"
          label="Payment Type"
          value={detail.paymentType}
          tone="badge"
        />
      </View>

      {/* Who handed the money over. Its own row rather than squeezed into a
          pair above, because a collection person's name is the longest value
          on this card and would clip in a half-width cell. Hidden entirely
          when the party paid direct — see useApprovalDetails. */}
      {detail.sapBranch ? (
        <>
          <View style={styles.divider} />
          {/* Full width: the value carries its source — "FACTORY (Auto from
              Invoice)" — which wraps to two lines in a half-width cell. */}
          <Field
            icon="business-outline"
            label="SAP Branch"
            value={detail.sapBranch}
            full
          />
        </>
      ) : null}

      {detail.receivedFrom ? (
        <>
          <View style={styles.divider} />
          <Field
            icon="person-circle-outline"
            label="Received From"
            value={detail.receivedFrom}
            full
          />
        </>
      ) : null}

      {detail.remarks ? (
        <>
          <View style={styles.divider} />
          <Field
            icon="chatbox-ellipses-outline"
            label="Remarks"
            value={detail.remarks}
            full
          />
        </>
      ) : null}
    </View>
  );
}

/** One icon + label + value cell. `full` spans both columns. */
function Field({
  icon,
  label,
  value,
  tone = "plain",
  full = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "plain" | "link" | "badge" | "amount";
  full?: boolean;
}) {
  return (
    <View style={[styles.field, full ? styles.fieldFull : styles.fieldHalf]}>
      <Ionicons
        name={icon}
        size={ms(17)}
        color={COLORS.textMuted}
        style={styles.fieldIcon}
      />
      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        {tone === "badge" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.value,
              tone === "link" && styles.valueLink,
              tone === "amount" && styles.valueAmount,
            ]}
            numberOfLines={full ? 4 : 2}
          >
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

export default React.memo(GeneralInformationCard);

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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(14),
  },
  headerIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
  // Wraps rather than scrolls sideways, so two cells become one per row on a
  // narrow screen instead of clipping.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    paddingVertical: sp(6),
  },
  fieldHalf: {
    width: "50%",
    paddingRight: sp(8),
  },
  fieldFull: {
    width: "100%",
  },
  fieldIcon: {
    marginTop: sp(2),
  },
  fieldText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  value: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: fs(18),
  },
  valueLink: {
    color: COLORS.primary,
  },
  valueAmount: {
    fontSize: fs(17),
    fontWeight: "800",
    color: COLORS.success,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryLight,
    borderRadius: sp(8),
    paddingVertical: sp(3),
    paddingHorizontal: sp(8),
    marginTop: sp(1),
  },
  badgeText: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.primary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: sp(4),
  },
});
