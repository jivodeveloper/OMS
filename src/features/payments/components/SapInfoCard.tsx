import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import ReceiptViewerModal from "./ReceiptViewerModal";

/**
 * What SAP did with this document — DocEntry, DocNum, TransId and SAP's own
 * words — on the detail page.
 *
 * The same facts already appear as the final card of View Progress, but an
 * approver who has just posted is standing on the DETAIL page, and going to
 * find the timeline to learn whether the money reached SAP is a detour. This
 * shows only the SAP outcome, deliberately: the ladder, the approvers and the
 * remarks stay on the progress screen, which is what that screen is for.
 *
 * Renders NOTHING before a posting has been attempted. A "Pending" SAP box on
 * a draft would imply something is in flight when nothing has been sent.
 */

type Tone = "ok" | "fail" | "pending" | "cancelled";

const TONE: Record<Tone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  ok: { bg: "#ECFDF5", fg: "#047857", icon: "checkmark-circle" },
  fail: { bg: "#FEF2F2", fg: "#B91C1C", icon: "alert-circle" },
  pending: { bg: "#EEF2FF", fg: "#4338CA", icon: "time-outline" },
  // Amber, not red: the posting SUCCEEDED and was cancelled afterwards in
  // SAP. Showing it in the failure palette would say the money never reached
  // SAP, which is the opposite of what happened.
  cancelled: { bg: "#FFFBEB", fg: "#B45309", icon: "warning" },
};

export interface SapInfoDocument {
  status: string;
  sap_doc_entry?: number | null;
  sap_doc_num?: number | null;
  sap_trans_id?: number | null;
  sap_posted_at?: string | null;
  sap_response?: string | null;
  /** Set only once reconciliation has read Canceled='Y' back from SAP ORCT. */
  sap_cancelled_at?: string | null;
  sap_cancellation_response?: string | null;
}

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function SapInfoCard({
  doc,
  kind,
  style,
  receiptId,
}: {
  doc: SapInfoDocument;
  /** Only used for the wording of the outcome line. */
  kind: "payment" | "deposit";
  /**
   * OMS receipt id. When supplied for a POSTED payment, a "View Payment
   * Receipt" button downloads the OMS-generated SAP-style PDF and opens it in
   * the device viewer. Omit for deposits or where the receipt id is unknown.
   */
  receiptId?: number | null;
  /**
   * Outer spacing, supplied by the host screen. The two detail screens gutter
   * their cards differently (one via marginHorizontal, one via the scroll
   * container's padding), so the card carries none of its own and cannot end
   * up flush to the edge on one screen and inset on the other.
   */
  style?: StyleProp<ViewStyle>;
}) {
  const status = doc.status;
  const posted = status === "POSTED";
  // Posted successfully, then cancelled by a person working in SAP. Kept
  // apart from `failed`: the document DID reach SAP and its identifiers are
  // still the way to find the cancelled original.
  const cancelledInSap = status === "CANCELLED_IN_SAP";
  const failed = status === "PENDING_ERROR" || status === "SAP_UNKNOWN";
  const inFlight = status === "POSTING_TO_SAP";

  // Nothing has been sent to SAP yet — a draft, awaiting approval, or
  // rejected. There is no SAP outcome to report, so the card stays away.
  if (!posted && !cancelledInSap && !failed && !inFlight) return null;

  const tone: Tone = posted
    ? "ok"
    : cancelledInSap
      ? "cancelled"
      : failed
        ? "fail"
        : "pending";
  const palette = TONE[tone];

  const badge = posted
    ? "Posted"
    : cancelledInSap
      ? "Cancelled in SAP"
      : status === "PENDING_ERROR"
        ? "Failed"
        : status === "SAP_UNKNOWN"
          ? "Unconfirmed"
          : "Posting";

  const headline = posted
    ? kind === "payment"
      ? "Payment created in SAP"
      : "Deposit created in SAP"
    : cancelledInSap
      ? "Cancelled in SAP"
      : status === "PENDING_ERROR"
        ? "SAP rejected the document"
        : status === "SAP_UNKNOWN"
          ? "SAP did not respond — verification needed"
          : "Posting to SAP…";

  // Same fields, same order, as the SAP card on View Progress.
  const rows: { label: string; value: string }[] = [];
  if (doc.sap_doc_entry != null) {
    rows.push({ label: "SAP DocEntry", value: String(doc.sap_doc_entry) });
    rows.push({ label: "SAP DocNum", value: String(doc.sap_doc_num ?? "—") });
    // The journal key. DocEntry finds the document; TransId finds its
    // accounting in JDT1. Hidden when absent — documents posted before it was
    // captured have none, and a dash would read as a failure.
    if (doc.sap_trans_id != null) {
      rows.push({ label: "SAP TransId", value: String(doc.sap_trans_id) });
    }
    const at = formatDateTime(doc.sap_posted_at);
    if (at) rows.push({ label: "Posted At", value: at });
    // ORCT.CancelDate, when SAP recorded the cancellation.
    const cancelledAt = formatDateTime(doc.sap_cancelled_at);
    if (cancelledInSap && cancelledAt) {
      rows.push({ label: "Cancelled At", value: cancelledAt });
    }
  }

  // "View Payment Receipt" — only for a POSTED payment whose id we know.
  // Deliberately NOT offered for CANCELLED_IN_SAP: handing out a receipt for
  // a payment SAP has reversed would misrepresent it as still valid.
  const canViewReceipt =
    kind === "payment" && posted && doc.sap_doc_entry != null && receiptId != null;
  const [receiptOpen, setReceiptOpen] = useState(false);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: palette.bg }]}>
          <Ionicons name={palette.icon} size={ms(16)} color={palette.fg} />
        </View>
        <Text style={styles.title}>SAP Information</Text>
        <View style={[styles.badge, { backgroundColor: palette.bg }]}>
          <Text style={[styles.badgeText, { color: palette.fg }]}>{badge}</Text>
        </View>
      </View>

      <Text style={[styles.headline, { color: palette.fg }]}>{headline}</Text>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value} numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}

      {/* SAP's exact words. On a failure this is the only thing that says WHY,
          so it is shown in full rather than truncated to a tidy line. */}
      {/* The cancellation, shown ABOVE the posting response so the current
          state is read first. They are separate on purpose: the response below
          is what SAP said when the document POSTED, which remains true. */}
      {cancelledInSap ? (
        <View style={[styles.response, { backgroundColor: TONE.cancelled.bg }]}>
          <Text style={[styles.responseLabel, { color: TONE.cancelled.fg }]}>
            Cancelled in SAP
          </Text>
          <Text style={styles.responseText}>
            {doc.sap_cancellation_response ||
              "This payment was posted successfully but was later cancelled in SAP."}
          </Text>
        </View>
      ) : null}

      {doc.sap_response ? (
        <View
          style={[
            styles.response,
            { backgroundColor: cancelledInSap ? "#F8FAFC" : palette.bg },
          ]}
        >
          <Text style={styles.responseLabel}>
            {cancelledInSap ? "Original SAP Response" : "SAP Response"}
          </Text>
          <Text style={styles.responseText}>{doc.sap_response}</Text>
        </View>
      ) : null}

      {canViewReceipt ? (
        <>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setReceiptOpen(true)}
            style={styles.receiptBtn}
            accessibilityRole="button"
            accessibilityLabel="View payment receipt"
          >
            <Ionicons name="document-text-outline" size={ms(16)} color="#fff" />
            <Text style={styles.receiptBtnText}>View Payment Receipt</Text>
          </TouchableOpacity>
          <ReceiptViewerModal
            visible={receiptOpen}
            receiptId={receiptId ?? null}
            onClose={() => setReceiptOpen(false)}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(12),
    padding: sp(14),
    marginBottom: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  header: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  icon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(8),
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: fs(13.5),
    fontWeight: "800",
    color: COLORS.text,
  },
  badge: {
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: sp(6),
  },
  badgeText: { fontSize: fs(10), fontWeight: "800", letterSpacing: 0.3 },

  headline: {
    fontSize: fs(12),
    fontWeight: "700",
    marginTop: sp(10),
    marginBottom: sp(2),
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sp(10),
    paddingVertical: sp(4),
  },
  label: { fontSize: fs(11.5), color: COLORS.textMuted, flexShrink: 0 },
  value: {
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    textAlign: "right",
  },

  response: {
    marginTop: sp(10),
    padding: sp(10),
    borderRadius: sp(8),
  },
  responseLabel: {
    fontSize: fs(10),
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    marginBottom: sp(3),
  },
  responseText: { fontSize: fs(11.5), lineHeight: fs(17), color: COLORS.text },
  receiptBtn: {
    marginTop: sp(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    backgroundColor: COLORS.primary,
    borderRadius: sp(10),
    paddingVertical: sp(11),
    paddingHorizontal: sp(14),
  },
  receiptBtnText: { color: "#fff", fontSize: fs(13), fontWeight: "700" },
});
