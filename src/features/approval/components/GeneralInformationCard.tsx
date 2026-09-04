import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import { handoverDays } from "@/src/features/payments/handoverSpan";
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
  // Measured from COLLECTION, not from when the entry was typed up: cash
  // taken on Monday and recorded on Thursday sat in a pocket for three days,
  // and an entry-to-verification figure would score that as same-day.
  const days = handoverDays(detail.collectedAt, detail.verifiedAt);
  // Two days matches the verification queue's own window, so "still in the
  // queue when it opens" and "flagged here" mean the same thing.
  const late = days != null && days > 2;
  const gapLabel =
    days == null
      ? ""
      : days === 0
        ? "Same day"
        : `${days} day${days === 1 ? "" : "s"}`;

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
        {/* The handover gap, stated once at the top: it is the thing an
            approver wants to know before reading anything else — how long was
            this money outstanding before somebody checked it. Absent until
            the receipt is verified, when there is no span to state. */}
        {gapLabel ? (
          <View
            style={[
              styles.gapPill,
              { backgroundColor: (late ? COLORS.warning : COLORS.success) + "1A" },
            ]}
          >
            <Text
              style={[
                styles.gapText,
                { color: late ? COLORS.warning : COLORS.success },
              ]}
            >
              {gapLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* FIRST row: the handover — who raised it, who checked it, and when.
          Created and verified are the two ends of the span in the badge
          above, so they belong next to each other and at the top: it is the
          first thing an approver wants to know. */}
      <View style={styles.grid}>
        <Field
          icon="person-outline"
          label="Created By"
          value={detail.createdBy}
          sub={formatStamp(detail.createdAt)}
        />
        <Field
          icon="shield-checkmark-outline"
          label="Verified By"
          value={detail.verifiedBy || "Not verified yet"}
          sub={detail.verifiedAt ? formatStamp(detail.verifiedAt) : "—"}
          muted={!detail.verifiedAt}
        />
      </View>

      <View style={styles.divider} />

      {/* SECOND row: who the money came from, and which company's books it
          belongs to. Paired because both are short, and because "received
          from Goldy, for OIL" is one fact read together. Company keeps its
          cell when nobody is named, so the column never collapses. */}
      <View style={styles.grid}>
        <Field
          icon="person-circle-outline"
          label="Received From"
          value={detail.receivedFrom || "Party direct"}
          muted={!detail.receivedFrom}
        />
        <Field icon="business-outline" label="Company" value={detail.company} />
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

/** "04 Sep 2026, 03:01 PM" in the device's local time. */
const formatStamp = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * One icon + label + value cell.
 *
 * `full` spans both columns; `sub` stacks an exact timestamp beneath the
 * value, which is what makes the created/verified pair readable as one
 * comparison.
 */
function Field({
  icon,
  label,
  value,
  tone = "plain",
  full = false,
  sub,
  muted = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "plain" | "link" | "badge" | "amount";
  full?: boolean;
  /** Second line — the exact date and time. */
  sub?: string;
  /** Greys the value for a step that has not happened yet. */
  muted?: boolean;
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
              muted && styles.valueMuted,
            ]}
            numberOfLines={full ? 4 : 2}
          >
            {value}
          </Text>
        )}
        {!!sub && (
          <Text style={styles.subValue} numberOfLines={2}>
            {sub}
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
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
  gapPill: {
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    borderRadius: sp(20),
    flexShrink: 0,
  },
  gapText: { fontSize: fs(11), fontWeight: "800" },
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
  // A step that has not happened yet — greyed rather than hidden, so the
  // column still lines up against its pair.
  valueMuted: {
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  subValue: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginTop: sp(2),
    lineHeight: fs(15),
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
