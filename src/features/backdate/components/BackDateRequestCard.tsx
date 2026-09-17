import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "@/src/constants/theme";
import type { BackDateRequest } from "@/src/services/backdate.service";
import { formatDate, formatInstant } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import { stageLabel, statusOf, type BackDateStatus } from "../types";

interface Props {
  request: BackDateRequest;
  onDetails: () => void;
  onProgress: () => void;
  /**
   * True when this row came from the approval queue — i.e. it is awaiting
   * THIS user's decision. Shown as a chip so an approver holding both keys can
   * tell their own requests apart from the ones waiting on them.
   */
  awaitingMe?: boolean;
}

/**
 * The same five-state palette the payment card uses, mapped onto BackDate's
 * statuses so the two lists never colour "done" or "refused" differently.
 */
const STATUS_TONE: Record<BackDateStatus, { bg: string; fg: string }> = {
  Pending: { bg: "#FFF7E6", fg: "#B45309" },
  Approved: { bg: "#EEF2FF", fg: "#4338CA" },
  Completed: { bg: "#ECFDF5", fg: "#047857" },
  Rejected: { bg: "#FEF2F2", fg: "#B91C1C" },
  SapFailed: { bg: "#FEF2F2", fg: "#B91C1C" },
};

const STATUS_LABEL: Record<BackDateStatus, string> = {
  Pending: "Pending",
  Approved: "In Progress",
  Completed: "Completed",
  Rejected: "Rejected",
  // Everyone said yes and SAP refused. "Pending" would hide the one state
  // that needs a person to do something.
  SapFailed: "SAP Error",
};

/**
 * One BackDate request in the tracking list.
 *
 * Built to the payment tracking card exactly: document number and status pill,
 * the subject and its chips on one row, who raised it, a two-column strip, and
 * the green Progress / blue Details pair. The strip answers the BackDate
 * equivalent of "is this settled?" — what window was asked for, and whether
 * the rights are still live — because that is what a person scanning a list
 * needs before deciding whether to open anything.
 */
function BackDateRequestCard({
  request,
  onDetails,
  onProgress,
  awaitingMe = false,
}: Props) {
  const status = statusOf(request);
  const tone = STATUS_TONE[status];
  const stage = stageLabel(request);
  const expiry = expiryState(request.time_limit);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.docNo} numberOfLines={1}>
          #{request.id}
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

      {/* Subject on the left, date/company chips on the right of the SAME row.
          The SAP user is what the eye looks for — it is who the rights are
          for — so the chips are not allowed to push it down the card. */}
      <View style={styles.partyRow}>
        <View style={styles.partyCol}>
          <Text style={styles.party} numberOfLines={2}>
            {request.sap_username}
          </Text>
          <Text style={styles.partyCode} numberOfLines={1}>
            {request.document_type_name || "—"}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {formatDate(request.created_at)}
            </Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="business-outline" size={13} color={COLORS.primary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {request.company_label}
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
        <Text style={styles.receivedFromLabel}>Raised by</Text>
        <Text style={styles.receivedFromName} numberOfLines={1}>
          {request.created_by_username || "—"}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* What was asked for, and whether it is still good. A window alone
          cannot answer "can this person post today?" — the expiry can, and it
          is the half people forget to check. */}
      <View style={styles.invoiceRow}>
        <View style={styles.invoiceIcon}>
          <Ionicons name="calendar" size={ms(16)} color={COLORS.primary} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Posting Window</Text>
          <Text style={styles.invoiceValue} numberOfLines={1}>
            {formatDate(request.from_date)} – {formatDate(request.to_date)}
          </Text>
          <Text style={styles.invoiceNo} numberOfLines={1}>
            {request.action_label}
          </Text>
        </View>

        <View style={styles.invoiceDivider} />

        <View style={[styles.invoiceIcon, styles.expiryIcon]}>
          <Ionicons name="alarm" size={ms(16)} color={COLORS.success} />
        </View>
        <View style={styles.invoiceCol}>
          <Text style={styles.invoiceLabel}>Rights Expire</Text>
          <Text style={styles.expiryValue} numberOfLines={1}>
            {formatInstant(request.time_limit)}
          </Text>
          <View style={[styles.invoiceChip, { backgroundColor: expiry.bg }]}>
            <Text
              style={[styles.invoiceChipText, { color: expiry.fg }]}
              numberOfLines={1}
            >
              {expiry.label}
            </Text>
          </View>
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

/**
 * Whether the granted rights are still usable, in the chip slot the payment
 * card gives to "Part payment" / "Full amount".
 *
 * Rights that have lapsed are the BackDate equivalent of a shortfall: the
 * request can read as Completed and still be of no use to anybody, and only
 * the clock says so.
 */
function expiryState(timeLimit: string | null): {
  label: string;
  bg: string;
  fg: string;
} {
  if (!timeLimit) {
    return { label: "No expiry set", bg: COLORS.warningLight, fg: COLORS.warning };
  }
  const at = new Date(timeLimit).getTime();
  if (Number.isNaN(at)) {
    return { label: "Expiry unknown", bg: COLORS.warningLight, fg: COLORS.warning };
  }

  const msLeft = at - Date.now();
  if (msLeft <= 0) {
    return { label: "Expired", bg: "#FEF2F2", fg: "#B91C1C" };
  }

  const hours = Math.floor(msLeft / 3_600_000);
  if (hours < 24) {
    // Hours, not "today": rights lapsing at 14:00 and at 23:59 are a very
    // different amount of time to get the posting done.
    return {
      label: hours <= 1 ? "Under an hour left" : `${hours} hours left`,
      bg: COLORS.warningLight,
      fg: COLORS.warning,
    };
  }
  const days = Math.floor(hours / 24);
  return {
    label: `${days} day${days === 1 ? "" : "s"} left`,
    bg: COLORS.successLight,
    fg: COLORS.success,
  };
}

export default React.memo(BackDateRequestCard);

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
  expiryIcon: { backgroundColor: COLORS.successLight },
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
  expiryValue: { fontSize: fs(13), fontWeight: "800", color: COLORS.success },
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
