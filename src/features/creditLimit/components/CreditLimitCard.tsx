import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import type { CreditLimitRequest } from "@/src/services/creditLimit.service";

import { formatAmount, formatDate, limitChange, stageLine, statusLabel, statusOf } from "../logic";

/**
 * One credit-limit request, as the list shows it.
 *
 * THE ADVANCE PAYMENT CARD, part for part: the same 16pt card with its number
 * and status pill, the party column with chips to its right, the "Raised by"
 * line, the two-figure strip either side of a vertical rule, and the pair of
 * full-width buttons. A person who has learnt one module's list has learnt
 * this one, so the geometry is taken from `AdvanceRequestCard` rather than
 * re-invented — only what the columns MEAN differs.
 *
 * WHAT THE COLUMNS MEAN HERE: the limit today against the limit being asked
 * for, with the DIFFERENCE between them stated. An approver is not deciding
 * whether ₹5,00,000 is a good limit; they are deciding whether ₹2,00,000 more
 * than today is a good idea, and a card that shows only the new figure leaves
 * them doing the subtraction.
 */

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#FFF7E6", fg: "#B45309" },
  APPROVED: { bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { bg: "#FEF2F2", fg: "#B91C1C" },
};

export default function CreditLimitCard({
  request,
  onDetails,
  onProgress,
  /** The desk needs to know who asked; the requester already knows. */
  showRequester = false,
}: {
  request: CreditLimitRequest;
  onDetails: () => void;
  onProgress: () => void;
  showRequester?: boolean;
}) {
  const status = statusOf(request);
  const tone = STATUS_TONE[status] ?? { bg: "#F3F4F6", fg: "#6B7280" };
  const change = limitChange(request);
  const stage = stageLine(request);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.docNo} numberOfLines={1}>
          #{request.id}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.fg }]} numberOfLines={1}>
            {statusLabel(request)}
          </Text>
        </View>
      </View>

      <View style={styles.partyRow}>
        <View style={styles.partyCol}>
          <Text style={styles.party} numberOfLines={2}>
            {request.card_name || request.card_code}
          </Text>
          <Text style={styles.partyCode}>
            {request.card_code}
            {request.main_group ? ` · ${request.main_group}` : ""}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons name="business-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {request.company}
            </Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              Till {formatDate(request.valid_till)}
            </Text>
          </View>
        </View>
      </View>

      {showRequester ? (
        <View style={styles.receivedFromRow}>
          <Ionicons name="person-circle-outline" size={ms(14)} color={COLORS.textSecondary} />
          <Text style={styles.receivedFromLabel}>Raised by</Text>
          <Text style={styles.receivedFromName} numberOfLines={1}>
            {request.created_by_username || "—"}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      {/* TODAY'S LIMIT AGAINST THE ONE BEING ASKED FOR, and the move between
          them — which is the figure the decision is actually about. */}
      <View style={styles.invoiceRow}>
        <View style={styles.invoiceIcon}>
          <Ionicons name="card" size={ms(16)} color={COLORS.primary} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Current Limit</Text>
          <Text style={styles.invoiceValue} numberOfLines={1}>
            {formatAmount(request.current_credit_limit)}
          </Text>
          <Text style={styles.invoiceNo} numberOfLines={1}>
            Balance {formatAmount(request.current_balance)}
          </Text>
        </View>

        <View style={styles.invoiceDivider} />

        <View style={[styles.invoiceIcon, styles.askedIcon]}>
          <Ionicons name="trending-up" size={ms(16)} color={COLORS.success} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Asked For</Text>
          <Text style={styles.askedValue} numberOfLines={1}>
            {formatAmount(request.new_credit_limit)}
          </Text>
          {change.direction === "same" ? null : (
            <View
              style={[
                styles.invoiceChip,
                {
                  backgroundColor:
                    change.direction === "up" ? COLORS.successLight : COLORS.warningLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.invoiceChipText,
                  { color: change.direction === "up" ? COLORS.success : COLORS.warning },
                ]}
                numberOfLines={1}
              >
                {change.direction === "up" ? "+" : "−"}
                {formatAmount(change.delta)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {stage && status === "PENDING" ? (
        <View style={styles.stageRow}>
          <Ionicons name="git-branch-outline" size={ms(13)} color={COLORS.primary} />
          <Text style={styles.stageText} numberOfLines={1}>
            {stage}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      {/* The same pair every list in this app offers: green Progress, blue
          Details. Details answers "what is this?", Progress "where is it?". */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.progressBtn]}
          onPress={onProgress}
          activeOpacity={0.85}
        >
          <Ionicons name="git-branch-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>View Progress</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.detailsBtn]}
          onPress={onDetails}
          activeOpacity={0.85}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.actionBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Copied from `AdvanceRequestCard.styles` — the module's lists must not drift. */
const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(8),
  },
  docNo: { flex: 1, fontSize: fs(15), fontWeight: "800", color: COLORS.text },
  statusPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontSize: fs(11), fontWeight: "700" },
  partyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: sp(8),
    marginTop: sp(10),
  },
  partyCol: { flexShrink: 1, minWidth: ms(150) },
  party: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  partyCode: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: sp(8),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
  },
  chipText: { fontSize: fs(11), color: COLORS.textSecondary, fontWeight: "600" },
  receivedFromRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    marginTop: sp(6),
  },
  receivedFromLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  receivedFromName: { flex: 1, fontSize: fs(11), fontWeight: "700", color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: sp(12) },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(8),
    paddingVertical: sp(10),
  },
  invoiceIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(9),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  askedIcon: { backgroundColor: COLORS.successLight },
  invoiceCol: { flex: 1, minWidth: ms(110) },
  invoiceDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(2),
  },
  invoiceLabel: { fontSize: fs(11), color: COLORS.textSecondary, marginBottom: sp(2) },
  invoiceValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.primary },
  askedValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.success },
  invoiceNo: { fontSize: fs(10), color: COLORS.textMuted, marginTop: sp(2) },
  invoiceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(2),
    marginTop: sp(4),
  },
  invoiceChipText: { fontSize: fs(10), fontWeight: "700" },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(10),
    backgroundColor: COLORS.primaryLighter,
    borderRadius: sp(8),
    paddingHorizontal: sp(10),
    paddingVertical: sp(7),
  },
  stageText: { flex: 1, fontSize: fs(11), fontWeight: "800", color: COLORS.primary },
  actionRow: { flexDirection: "row", gap: sp(10), marginTop: sp(14) },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: sp(10),
    paddingVertical: sp(12),
  },
  detailsBtn: { backgroundColor: COLORS.primary },
  progressBtn: { backgroundColor: "#4CAF50" },
  actionBtnText: { color: "#fff", fontSize: fs(14), fontWeight: "600" },
});
