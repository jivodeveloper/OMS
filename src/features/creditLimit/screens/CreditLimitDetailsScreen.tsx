import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { appAlert } from "@/src/components/common/AppDialog";
import AttachmentViewerModal, {
  type AttachmentSource,
} from "@/src/features/advancePayments/components/AttachmentViewerModal";
import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";
import ApproveDialog from "@/src/features/approval/components/dialogs/ApproveDialog";
import RejectDialog from "@/src/features/approval/components/dialogs/RejectDialog";
import { can } from "@/src/constants/permissions";
import { COLORS } from "@/src/constants/theme";
import { useAuth } from "@/src/context/AuthContext";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  creditLimitError,
  creditLimitProblems,
  creditLimitService,
  type CreditLimitAttachment,
} from "@/src/services/creditLimit.service";

import {
  formatAmount,
  formatDate,
  formatDateTime,
  limitChange,
  statusLabel,
  statusOf,
} from "../logic";
import { useCreditLimitHistory, useCreditLimitRequest } from "../useCreditLimit";

/**
 * One credit-limit request, read the way an advance payment is read.
 *
 * THE ADVANCE PAYMENT DETAIL PAGE, part for part: the flush gradient header
 * stating the MOVEMENT (today's limit, an arrow, the limit asked for) with the
 * status pill; General Information as a two-column icon grid; the figures card;
 * what SAP said; the remarks and the history; and, for whoever holds it, the
 * decision at the foot.
 *
 * WHETHER THE BUTTONS APPEAR IS THE SERVER'S ANSWER, not this screen's guess:
 * `flow.current_user_username` is the stage's effective user, and the server
 * refuses anybody else regardless of what is drawn here. Holding the approval
 * key is not enough and never was.
 */
export default function CreditLimitDetailsScreen() {
  useBackToOrigin("/(main)/credit-limit/tracking");

  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);
  const { user } = useAuth();

  const { request, setRequest, loading, error, reload } = useCreditLimitRequest(requestId);
  const history = useCreditLimitHistory(requestId);

  const [asking, setAsking] = useState<"approve" | "reject" | null>(null);
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The file being looked at, if any — see `AttachmentViewerModal`. */
  const [viewing, setViewing] = useState<AttachmentSource | null>(null);

  useRefreshOnFocus(() => {
    void reload(true);
    void history.reload();
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={44} color={COLORS.error} />
        <Text style={styles.errorText}>{error || "This request could not be read."}</Text>
      </View>
    );
  }

  const status = statusOf(request);
  const change = limitChange(request);

  /**
   * MINE TO DECIDE? The server names the stage's effective user; the approval
   * key alone decides nothing, and neither does being the requester.
   */
  const mine =
    status === "PENDING" &&
    can(user, "Credit_Limit_Approval") &&
    Boolean(request.flow?.current_user_username) &&
    request.flow?.current_user_username === user?.username;

  const decide = async (action: "approve" | "reject", remarks: string) => {
    setAsking(null);
    setActing(action);
    try {
      const next =
        action === "approve"
          ? await creditLimitService.approve(request.id, remarks)
          : await creditLimitService.reject(request.id, remarks);
      setRequest(next);
      void history.reload();
      appAlert(
        action === "approve" ? "Approved" : "Rejected",
        action === "approve"
          ? next.flow?.status === "APPROVED"
            ? "Approved. The new limit has been written to SAP — its response is on this page."
            : "Approved and passed to the next stage."
          : "The request has been rejected and the requester told.",
        [
          {
            text: "Done",
            onPress: () => {
              // The last approval WRITES TO SAP, and what the approver wants
              // next is what SAP said — which is on this page. Anything else
              // ends on the list they acted from.
              if (action === "approve" && next.flow?.status === "APPROVED") return;
              router.replace("/(main)/credit-limit/tracking" as never);
            },
          },
        ],
      );
    } catch (err) {
      appAlert(
        "Could not be done",
        [creditLimitError(err), ...creditLimitProblems(err)].join("\n"),
      );
      // A refused SAP write is still recorded on the flow, so re-read rather
      // than leave the page showing what it showed before the attempt.
      void reload(true);
    } finally {
      setActing(null);
    }
  };

  const sapSaid = request.flow?.sap_response ?? "";

  /**
   * The documents on this request. A submission's files are shared by every
   * request it raised, so the same list appears on each of them.
   */
  const files = request.attachments ?? [];

  /** Open one in the app's viewer — the advance payment screen's own. */
  const openFile = (file: CreditLimitAttachment) =>
    setViewing({
      name: file.name,
      load: () => creditLimitService.attachmentImage(request.id, file.id),
      save: () => creditLimitService.saveAttachment(request.id, file.id, file.name),
    });

  /**
   * WHAT SOMEBODY SAID OR CHANGED, which is not the same as what the route
   * did. An approval with no words is a step of the route and lives on the
   * Progress page; it would be a line here saying nothing. Creating and
   * submitting are the route's first steps and are never remarks at all.
   */
  const notes = history.actions.filter(
    (action) =>
      Boolean(action.remarks?.trim()) &&
      !["CREATED", "SUBMITTED"].includes((action.action ?? "").toUpperCase()),
  );
  const hasNotes = Boolean(request.remarks?.trim()) || notes.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, mine && styles.contentWithActions]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void reload(true);
              void history.reload();
              setRefreshing(false);
            }}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* THE MOVEMENT, read left to right: the limit today, an arrow, the
            limit being asked for. That pair IS the request. */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <Text style={styles.requestNo} numberOfLines={1} adjustsFontSizeToFit>
              #{request.id}
            </Text>
            <View style={styles.statusPill}>
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      status === "APPROVED"
                        ? COLORS.success
                        : status === "REJECTED"
                          ? COLORS.error
                          : COLORS.warning,
                  },
                ]}
              >
                {statusLabel(request)}
              </Text>
            </View>
          </View>

          <View style={styles.partyRow}>
            <Ionicons name="card-outline" size={ms(14)} color="#BFDBFE" />
            <Text style={styles.partyGl} numberOfLines={1}>
              {formatAmount(request.current_credit_limit)}
            </Text>
            <Ionicons name="arrow-forward" size={ms(13)} color="#BFDBFE" />
            <Text style={styles.party} numberOfLines={1}>
              {formatAmount(request.new_credit_limit)}
            </Text>
          </View>
          <Text style={styles.routeNote} numberOfLines={1}>
            {request.card_name || request.card_code} · {request.company}
          </Text>
        </LinearGradient>

        {/* ── General Information ──────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <Ionicons name="information-circle" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>General Information</Text>
          </View>

          <View style={styles.grid}>
            <Field icon="person-outline" label="Raised By" value={request.created_by_username || "—"} />
            <Field icon="business-outline" label="Company" value={request.company} />
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            <Field icon="calendar-outline" label="Raised On" value={formatDateTime(request.created_at)} />
            <Field icon="time-outline" label="Valid Till" value={formatDate(request.valid_till)} />
          </View>

          <View style={styles.divider} />

          <Field
            icon="storefront-outline"
            label="Customer"
            value={request.card_name || request.card_code}
            sub={[request.card_code, request.main_group].filter(Boolean).join(" · ")}
            full
          />

        </View>

        {/* ── The figures ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <Ionicons name="cash" size={ms(16)} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>Credit Limit</Text>
          </View>

          <View style={styles.grid}>
            <Field
              icon="card-outline"
              label="Current Limit"
              value={formatAmount(request.current_credit_limit)}
            />
            <Field
              icon="trending-up-outline"
              label="Asked For"
              value={formatAmount(request.new_credit_limit)}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            <Field
              icon="wallet-outline"
              label="Balance At Request"
              value={formatAmount(request.current_balance)}
            />
            <Field
              icon={change.direction === "down" ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
              label={change.direction === "down" ? "Decrease" : "Increase"}
              value={change.direction === "same" ? "—" : formatAmount(change.delta)}
            />
          </View>

          {/* THE SNAPSHOT IS THE POINT. These were SAP's figures when the
              request was raised; SAP may have moved since, which is exactly
              what the approver is being asked to weigh. */}
          <Text style={styles.snapshotNote}>
            The balance and current limit are SAP&apos;s figures as at submission.
          </Text>
        </View>

        {/* ── What SAP said ────────────────────────────────────────────── */}
        {sapSaid ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.headerIcon,
                  {
                    backgroundColor:
                      status === "APPROVED" ? COLORS.successLight : COLORS.errorLight,
                  },
                ]}
              >
                <Ionicons
                  name={status === "APPROVED" ? "checkmark-circle" : "alert-circle"}
                  size={ms(16)}
                  color={status === "APPROVED" ? COLORS.success : COLORS.error}
                />
              </View>
              <Text style={styles.cardTitle}>SAP Response</Text>
            </View>
            <Text style={styles.sapText}>{sapSaid}</Text>
          </View>
        ) : null}

        {/* ── Remarks & Updates ─────────────────────────────
            ONLY WHEN THERE IS SOMETHING TO READ. An empty box under a heading
            promising remarks is a question answered with silence; the route's
            own steps are on the Progress page, where they belong. */}
        {hasNotes ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerIcon}>
                <Ionicons name="chatbox-ellipses" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.cardTitle}>
                Remarks &amp; Updates{notes.length ? ` (${notes.length})` : ""}
              </Text>
            </View>

            {request.remarks ? (
              <Field
                icon="chatbox-ellipses-outline"
                label={`Remarks by ${request.created_by_username || "the requester"}`}
                value={request.remarks}
                full
              />
            ) : null}

            {notes.map((action, index) => (
              <View
                key={`${action.id ?? index}`}
                style={[
                  styles.lineRow,
                  (index > 0 || !!request.remarks) && styles.lineRowBordered,
                ]}
              >
                <View style={styles.lineIcon}>
                  <Ionicons
                    name={
                      (action.action ?? "").toUpperCase().includes("REJECT")
                        ? "close-circle-outline"
                        : (action.action ?? "").toUpperCase().includes("APPROVE")
                          ? "checkmark-circle-outline"
                          : "create-outline"
                    }
                    size={ms(16)}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.lineText}>
                  <Text style={styles.lineNo} numberOfLines={1}>
                    {action.acted_by_username || "System"} · {action.action}
                  </Text>
                  <Text style={styles.lineParty} numberOfLines={1}>
                    {action.stage_name ? `${action.stage_name} · ` : ""}
                    {formatDateTime(action.acted_at)}
                  </Text>
                  <Text style={styles.remarkQuote}>“{action.remarks}”</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* THE DOCUMENTS, AND THEY OPEN. An approver deciding on a limit is
            deciding on the evidence attached to it, so naming the file and
            stopping there asked them to take it on trust. Each row opens the
            file in the app's own viewer — an image zooms, anything else is
            handed to whatever opens that kind. The bytes come through the
            service, which sends the bearer token these endpoints require. */}
        {files.length ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerIcon}>
                <Ionicons name="attach" size={ms(16)} color={COLORS.primary} />
              </View>
              <Text style={styles.cardTitle}>
                {files.length > 1 ? `Attachments (${files.length})` : "Attachment"}
              </Text>
            </View>

            {files.map((file, index) => (
              <TouchableOpacity
                key={file.id}
                style={[styles.fileRow, index > 0 && styles.fileRowBordered]}
                onPress={() => openFile(file)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Open ${file.name}`}
              >
                <Ionicons
                  name={isImage(file.name) ? "image-outline" : "document-text-outline"}
                  size={ms(16)}
                  color={COLORS.primary}
                />
                <Text style={styles.fileName} numberOfLines={2}>
                  {file.name}
                </Text>
                <Ionicons name="open-outline" size={ms(15)} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* WHAT THIS USER MAY DO. Only at their own stage, and only while the
          request is pending. */}
      {mine ? (
        <View style={styles.actionBox}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => setAsking("reject")}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="close-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => setAsking("approve")}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Approve</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* The receipt approval's own dialogs: same sheet, same remarks box, and
          a rejection insists on a reason, as the server does. */}
      <ApproveDialog
        visible={asking === "approve"}
        onClose={() => setAsking(null)}
        onConfirm={(remarks: string) => void decide("approve", remarks)}
      />
      <RejectDialog
        visible={asking === "reject"}
        onClose={() => setAsking(null)}
        onConfirm={(remarks: string) => void decide("reject", remarks)}
      />
      <ApprovalLoadingDialog
        visible={acting !== null}
        decision={acting === "reject" ? "reject" : "approve"}
      />
      <AttachmentViewerModal source={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

/** Which icon a file gets — the same extensions the viewer renders inline. */
const isImage = (name: string) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);

/** One labelled fact of the grid — the advance payment page's own field. */
function Field({
  icon,
  label,
  value,
  sub,
  full = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  full?: boolean;
}) {
  return (
    <View style={[styles.field, full ? styles.fieldFull : styles.fieldHalf]}>
      <Ionicons name={icon} size={ms(17)} color={COLORS.textMuted} style={styles.fieldIcon} />
      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={3}>
          {value || "—"}
        </Text>
        {sub ? (
          <Text style={styles.subValue} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const WIDTH = Dimensions.get("window").width;

/** Copied from `AdvanceDetailsScreen.styles` — the detail pages must not drift. */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: sp(28) },
  contentWithActions: { paddingBottom: sp(96) },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(12),
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: fs(14),
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: sp(32),
  },

  header: {
    width: WIDTH,
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
    marginBottom: sp(14),
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: sp(10) },
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
  statusText: { fontSize: fs(11), fontWeight: "800" },
  partyRow: { flexDirection: "row", alignItems: "center", gap: sp(6), marginTop: sp(12) },
  party: { flexShrink: 1, color: "#fff", fontSize: fs(14), fontWeight: "700" },
  partyGl: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },
  routeNote: { color: "rgba(255,255,255,0.75)", fontSize: fs(11), marginTop: sp(4) },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginHorizontal: sp(14),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: sp(10), marginBottom: sp(4) },
  headerIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  cardTitle: { flex: 1, fontSize: fs(14), fontWeight: "800", color: COLORS.text },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { flexDirection: "row", alignItems: "flex-start", gap: sp(8), paddingVertical: sp(6) },
  fieldHalf: { width: "50%", paddingRight: sp(8) },
  fieldFull: { width: "100%" },
  fieldIcon: { marginTop: sp(2) },
  fieldText: { flex: 1, minWidth: 0 },
  label: { fontSize: fs(11), fontWeight: "500", color: COLORS.textSecondary, marginBottom: sp(2) },
  value: { fontSize: fs(13.5), fontWeight: "700", color: COLORS.text },
  subValue: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(2) },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: sp(8) },

  snapshotNote: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(8), lineHeight: fs(16) },
  sapText: { fontSize: fs(12.5), color: COLORS.text, lineHeight: fs(18) },
  muted: { fontSize: fs(12.5), color: COLORS.textSecondary },

  lineRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(10), paddingVertical: sp(10) },
  lineRowBordered: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  lineIcon: {
    width: ms(30),
    height: ms(30),
    borderRadius: sp(10),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  lineText: { flex: 1, minWidth: 0 },
  lineNo: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  lineParty: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: sp(2) },
  remarkQuote: {
    fontSize: fs(12),
    color: COLORS.text,
    fontStyle: "italic",
    marginTop: sp(4),
    lineHeight: fs(17),
  },

  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingVertical: sp(10),
  },
  fileRowBordered: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  // `minWidth: 0` so a long name wraps inside the row rather than pushing the
  // open icon off it.
  fileName: { flex: 1, minWidth: 0, fontSize: fs(13), fontWeight: "600", color: COLORS.text },

  actionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(14),
    paddingVertical: sp(12),
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    height: ms(44),
    borderRadius: sp(12),
  },
  rejectBtn: { backgroundColor: COLORS.error },
  approveBtn: { backgroundColor: COLORS.success },
  actionBtnText: { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});
