import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";

import {
  payeeOf,
  paymentAgainstLabel,
  requestAmount,
  typeLabel,
  vendorRefs,
  type AdvanceRequestEntry,
} from "../logic/approvalData";
import { STATUS_LABEL } from "../logic/requestLabels";
import { allocationRows, allocationTotals, formatDate, resolveCase } from "../logic/rules";

/**
 * One request, as the list shows it.
 *
 * THE PAYMENT TRACKING CARD, to the pixel: the same 16pt card with its number
 * and status pill, the party row with chips on the right, the two-column money
 * strip and the green Progress / blue Details pair. The two lists sit in one app
 * and a person who has learnt one has learnt the other, so the geometry, the
 * type sizes and the shadow are taken from `PaymentTrackingScreen` rather than
 * re-invented — only what the columns MEAN differs.
 */

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#FFF7E6", fg: "#B45309" },
  RETURNED: { bg: "#EEF2FF", fg: "#4338CA" },
  APPROVED: { bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { bg: "#FEF2F2", fg: "#B91C1C" },
  CANCELLED: { bg: "#F3F4F6", fg: "#6B7280" },
};

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdvanceRequestCard({
  entry,
  onDetails,
  onProgress,
}: {
  entry: AdvanceRequestEntry;
  onDetails: () => void;
  onProgress: () => void;
}) {
  const { form } = entry;
  const tone = STATUS_TONE[entry.status] ?? { bg: "#F3F4F6", fg: "#6B7280" };
  const amount = requestAmount(form);
  const c = resolveCase(form);
  // A document-backed request compares what is OPEN with what is being asked
  // for — the same "is this settled?" question the payment card's invoice strip
  // answers. A typed-amount request has nothing to compare, so it shows a total.
  const open = c.reference ? allocationTotals(allocationRows(form)).open : 0;
  const refs = vendorRefs(form);
  const awaitingMe = entry.api.flow?.awaiting_me ?? false;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.docNo} numberOfLines={1}>
          {entry.requestNo}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.fg }]} numberOfLines={1}>
            {STATUS_LABEL[entry.status]}
          </Text>
        </View>
      </View>

      <View style={styles.partyRow}>
        <View style={styles.partyCol}>
          {/* WHO IS PAID. An Expense has no SAP partner — its payee is a
              typed name — so `payeeOf` answers for both rather than leaving
              an Expense card blank where every other card names someone. */}
          <Text style={styles.party} numberOfLines={2}>
            {payeeOf(form) || "—"}
          </Text>
          <Text style={styles.partyCode}>
            {typeLabel(form)} · {paymentAgainstLabel(form)}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {form.paymentDate ? formatDate(form.paymentDate) : "No date"}
            </Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="business-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {form.company}
            </Text>
          </View>
          {/* WHAT THE MONEY IS FOR, where the priority flag used to be:
              priority is no longer asked for, and the purpose is the thing a
              reader of the list is actually scanning for. */}
          {form.purposeLabel ? (
            <View style={styles.chip}>
              <Ionicons name="pricetag-outline" size={13} color={COLORS.primary} />
              <Text style={styles.chipText} numberOfLines={1}>
                {form.purposeLabel}
              </Text>
            </View>
          ) : null}
          {/* THE VENDOR'S OWN NUMBER, which is what they quote when they ring
              about a payment — OMS's request number means nothing to them. */}
          {refs.length ? (
            <View style={styles.chip}>
              <Ionicons name="pricetags-outline" size={13} color={COLORS.primary} />
              <Text style={styles.chipText} numberOfLines={1}>
                {refs.length === 1 ? refs[0] : `${refs[0]} +${refs.length - 1}`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Who raised it — the requester is who an approver chases, exactly as
          "Received from" names who carried the money on a payment card. */}
      <View style={styles.receivedFromRow}>
        <Ionicons
          name="person-circle-outline"
          size={ms(14)}
          color={COLORS.textSecondary}
        />
        <Text style={styles.receivedFromLabel}>Raised by</Text>
        <Text style={styles.receivedFromName} numberOfLines={1}>
          {entry.requestedBy}
        </Text>
      </View>

      {open > 0 ? (
        <>
          <View style={styles.divider} />
          <View style={styles.invoiceRow}>
            <View style={styles.invoiceIcon}>
              <Ionicons name="document-text" size={ms(16)} color={COLORS.primary} />
            </View>
            <View style={styles.invoiceCol}>
              <Text style={styles.invoiceLabel}>Open Amount</Text>
              <Text style={styles.invoiceValue} numberOfLines={1}>
                {formatMoney(open)}
              </Text>
              <Text style={styles.invoiceNo} numberOfLines={1}>
                {form.selected.length} document{form.selected.length === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={styles.invoiceDivider} />

            <View style={[styles.invoiceIcon, styles.receivedIcon]}>
              <Ionicons name="wallet" size={ms(16)} color={COLORS.success} />
            </View>
            <View style={styles.invoiceCol}>
              <Text style={styles.invoiceLabel}>Requested</Text>
              <Text style={styles.receivedValue} numberOfLines={1}>
                {formatMoney(amount)}
              </Text>
              <View
                style={[
                  styles.invoiceChip,
                  {
                    backgroundColor:
                      amount >= open - 0.005 ? COLORS.successLight : COLORS.warningLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.invoiceChipText,
                    { color: amount >= open - 0.005 ? COLORS.success : COLORS.warning },
                  ]}
                  numberOfLines={1}
                >
                  {amount >= open - 0.005
                    ? "Full amount"
                    : `Part of ${formatMoney(open)}`}
                </Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Request Amount</Text>
            <Text style={styles.totalValue}>{formatMoney(amount)}</Text>
          </View>
        </>
      )}

      {awaitingMe ? (
        <View style={styles.awaiting}>
          <Ionicons name="hand-right-outline" size={ms(13)} color={COLORS.primary} />
          <Text style={styles.awaitingText}>
            Awaiting your decision · {entry.api.flow?.current_stage || "—"}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      {/* The same pair as Payment Tracking: green Progress, blue Details.
          Details answers "what is this?", Progress "where has it got to?". */}
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

/** Copied from `PaymentTrackingScreen.styles` — the two cards must not drift. */
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
  receivedFromName: {
    flex: 1,
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.text,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: sp(12) },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: fs(13), color: COLORS.textSecondary, fontWeight: "600" },
  totalValue: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
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
  receivedIcon: { backgroundColor: COLORS.successLight },
  invoiceCol: { flex: 1, minWidth: ms(110) },
  invoiceDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(2),
  },
  invoiceLabel: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  invoiceValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.primary },
  receivedValue: { fontSize: fs(14), fontWeight: "800", color: COLORS.success },
  invoiceNo: { fontSize: fs(10), color: COLORS.textMuted, marginTop: sp(2) },
  invoiceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(2),
    marginTop: sp(4),
  },
  invoiceChipText: { fontSize: fs(10), fontWeight: "700" },
  awaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(10),
    backgroundColor: COLORS.primaryLighter,
    borderRadius: sp(8),
    paddingHorizontal: sp(10),
    paddingVertical: sp(7),
  },
  awaitingText: { fontSize: fs(11), fontWeight: "800", color: COLORS.primary },
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
