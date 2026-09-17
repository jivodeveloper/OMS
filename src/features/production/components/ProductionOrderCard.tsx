import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import {
  SAP_ORDER_TYPE_LABEL,
  type ProductionOrder,
} from "@/src/services/production.service";
import { formatDate } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import { stageLabel, statusOf, type ProductionStatus } from "../types";

interface Props {
  order: ProductionOrder;
  onDetails: () => void;
  onProgress: () => void;
  /**
   * True when this row came from the approval queue — i.e. it is awaiting
   * THIS user's decision. Shown as a chip because the list mixes orders the
   * viewer is merely watching with the ones waiting on them, and those are
   * very different obligations.
   */
  awaitingMe?: boolean;
}

/** The same palette the payment and BackDate cards use. */
const STATUS_TONE: Record<ProductionStatus, { bg: string; fg: string }> = {
  Pending: { bg: "#FFF7E6", fg: "#B45309" },
  Approved: { bg: "#EEF2FF", fg: "#4338CA" },
  Completed: { bg: "#ECFDF5", fg: "#047857" },
  Rejected: { bg: "#FEF2F2", fg: "#B91C1C" },
  SapFailed: { bg: "#FEF2F2", fg: "#B91C1C" },
  // Grey, not red. Nobody refused this — SAP moved on without us.
  Obsolete: { bg: "#F3F4F6", fg: "#6B7280" },
};

const STATUS_LABEL: Record<ProductionStatus, string> = {
  Pending: "Pending",
  Approved: "In Progress",
  Completed: "Completed",
  Rejected: "Rejected",
  SapFailed: "SAP Error",
  Obsolete: "No Longer Planned",
};

/**
 * One production order in the tracking list.
 *
 * Built to the payment tracking card exactly — document number and status
 * pill, subject with its chips on one row, who raised it in SAP, a
 * two-column strip and the green Progress / blue Details pair — so the three
 * lists in this app read as one product.
 *
 * The strip is the PRDO equivalent of Invoice vs Received: what is being made,
 * and how much of it. A quantity in pieces answers almost nothing on its own —
 * 24,000 means a different amount of work depending on the pack — so the boxes
 * and litres derived from the pack-size snapshots sit under it.
 */
function ProductionOrderCard({
  order,
  onDetails,
  onProgress,
  awaitingMe = false,
}: Props) {
  const status = statusOf(order);
  const tone = STATUS_TONE[status];
  const stage = stageLabel(order);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.docNo} numberOfLines={1}>
          #{order.sap_doc_num ?? order.sap_doc_entry}
        </Text>
        <View style={styles.headRight}>
          {awaitingMe ? (
            <View style={styles.awaitingChip}>
              <Text style={styles.awaitingText}>Awaiting you</Text>
            </View>
          ) : null}
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <Text
              style={[styles.statusPillText, { color: tone.fg }]}
              numberOfLines={1}
            >
              {STATUS_LABEL[status]}
            </Text>
          </View>
        </View>
      </View>

      {/* The item on the left, date/company chips on the right of the SAME
          row. The item name is what the eye looks for — it is what is being
          made — so the chips are not allowed to push it down the card. */}
      <View style={styles.partyRow}>
        <View style={styles.partyCol}>
          <Text style={styles.party} numberOfLines={2}>
            {order.item_name || order.item_code}
          </Text>
          <Text style={styles.partyCode} numberOfLines={1}>
            {order.item_code}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={COLORS.primary}
            />
            <Text style={styles.chipText} numberOfLines={1}>
              {formatDate(order.post_date)}
            </Text>
          </View>
          <View style={styles.chip}>
            <Ionicons
              name="business-outline"
              size={13}
              color={COLORS.primary}
            />
            <Text style={styles.chipText} numberOfLines={1}>
              {order.company}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.receivedFromRow}>
        <Ionicons
          name="person-circle-outline"
          size={ms(14)}
          color={COLORS.textSecondary}
        />
        <Text style={styles.receivedFromLabel}>Raised in SAP by</Text>
        <Text style={styles.receivedFromName} numberOfLines={1}>
          {order.sap_created_by || "—"}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.invoiceRow}>
        <View style={styles.invoiceIcon}>
          <Ionicons name="cube" size={ms(16)} color={COLORS.primary} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Planned Qty</Text>
          <Text style={styles.invoiceValue} numberOfLines={1}>
            {formatQty(order.planned_qty)} pcs
          </Text>
          <Text style={styles.invoiceNo} numberOfLines={1}>
            {packSummary(order)}
          </Text>
        </View>

        <View style={styles.invoiceDivider} />

        <View style={[styles.invoiceIcon, styles.warehouseIcon]}>
          <Ionicons name="file-tray-full" size={ms(16)} color={COLORS.success} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Warehouse</Text>
          <Text style={styles.warehouseValue} numberOfLines={1}>
            {order.warehouse || "—"}
          </Text>
          {/* SAP's release gate would not have stopped this order anyway.
              Stated on the card because an approval that was never going to
              be enforced should not look identical to one that was. */}
          {order.gate_exempt ? (
            <View
              style={[
                styles.invoiceChip,
                { backgroundColor: COLORS.warningLight },
              ]}
            >
              <Text
                style={[styles.invoiceChipText, { color: COLORS.warning }]}
                numberOfLines={1}
              >
                Outside SAP gate
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.invoiceChip,
                { backgroundColor: COLORS.successLight },
              ]}
            >
              <Text
                style={[styles.invoiceChipText, { color: COLORS.success }]}
                numberOfLines={1}
              >
                {SAP_ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
              </Text>
            </View>
          )}
        </View>
      </View>

      {stage ? (
        <View style={styles.stageRow}>
          <Ionicons
            name="git-branch-outline"
            size={ms(13)}
            color={COLORS.textMuted}
          />
          <Text style={styles.stageText} numberOfLines={1}>
            {stage}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      {/* Two actions, matching payment tracking: green Progress, blue Details.
          Details answers "what is this?", Progress answers "where has it got
          to?" — separate questions, separate screens. */}
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

/** Plain thousands separators. The API sends decimals as strings. */
export function formatQty(value: string | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * Boxes and litres, when the pack-size snapshots allow them.
 *
 * Omitted rather than guessed when they do not: an item with no pack size on
 * it in SAP has no box count, and printing "0 boxes" would be a made-up fact
 * about a real production run.
 */
function packSummary(order: ProductionOrder): string {
  const parts: string[] = [];
  if (order.planned_boxes) parts.push(`${formatQty(order.planned_boxes)} box`);
  if (order.planned_litres) parts.push(`${formatQty(order.planned_litres)} L`);
  return parts.join(" · ") || order.item_group || "";
}

export default React.memo(ProductionOrderCard);

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
  headRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    flexShrink: 0,
  },
  statusPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontSize: fs(11), fontWeight: "700" },
  awaitingChip: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: 20,
    paddingHorizontal: sp(8),
    paddingVertical: sp(4),
  },
  awaitingText: { fontSize: fs(9), fontWeight: "700", color: COLORS.primary },

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

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: sp(12),
  },

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
  warehouseIcon: { backgroundColor: COLORS.successLight },
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
  warehouseValue: { fontSize: fs(13), fontWeight: "800", color: COLORS.success },
  invoiceNo: { fontSize: fs(10), color: COLORS.textMuted, marginTop: sp(2) },
  invoiceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(2),
    marginTop: sp(4),
  },
  invoiceChipText: { fontSize: fs(10), fontWeight: "700" },

  stageRow: { flexDirection: "row", alignItems: "center", gap: sp(5) },
  stageText: { fontSize: fs(11), color: COLORS.textMuted, fontWeight: "600" },

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
