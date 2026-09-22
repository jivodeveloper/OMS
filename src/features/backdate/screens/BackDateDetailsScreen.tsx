import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { showToast } from "@/src/components/common/Toast";
import { setHeaderEditHandler } from "@/src/utils/headerEdit";
import { COLORS, RADIUS } from "@/src/constants/theme";
import ApprovalBottomBar from "@/src/features/approval/components/ApprovalBottomBar";
import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";
import ApproveDialog from "@/src/features/approval/components/dialogs/ApproveDialog";
import RejectDialog from "@/src/features/approval/components/dialogs/RejectDialog";
import backdateService, {
  BackDateApiError,
  type BackDateRequest,
  type DecisionResult,
} from "@/src/services/backdate.service";
import { formatDate, formatInstant } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import BackDateDecisionDoneDialog from "../components/BackDateDecisionDoneDialog";
import BackDateSapRefusedDialog from "../components/BackDateSapRefusedDialog";
import BackDateSapResultList from "../components/BackDateSapResultList";
import { messageFrom } from "../hooks/useBackDateMasters";
import {
  stageLabel,
  statusOf,
  type ApprovalDecision,
  type BackDateStatus,
} from "../types";

type Stage = "none" | "approve" | "reject" | "loading" | "done";

/** Pill colour follows the outcome, not one flat accent. */
const STATUS_COLOR: Record<BackDateStatus, string> = {
  Pending: COLORS.warning,
  Approved: COLORS.primary,
  Completed: COLORS.success,
  Rejected: COLORS.error,
  SapFailed: COLORS.error,
};

const STATUS_LABEL: Record<BackDateStatus, string> = {
  Pending: "Pending",
  Approved: "In Progress",
  Completed: "Completed",
  Rejected: "Rejected",
  SapFailed: "SAP Error",
};

const SAP_OK = {
  bg: "#ECFDF5",
  fg: "#047857",
  icon: "checkmark-circle" as const,
};
const SAP_FAIL = { bg: "#FEF2F2", fg: "#B91C1C", icon: "alert-circle" as const };

/**
 * What one request asked for — and, for the approver holding it, the decision.
 *
 * The same screen serves a requester and an approver. What differs is the
 * action bar, and that is decided by two server answers rather than by which
 * list opened it: membership of the approval queue (passed as `actionable`)
 * and `can_edit`.
 */
export default function BackDateDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    actionable?: string;
    from?: string;
    /**
     * Bumped by the edit screen on every save. The route and the id do not
     * change, so without something that DOES change this screen is reused and
     * redisplays the copy it already had — the user saves an edit and sees the
     * old values.
     */
    refreshAt?: string;
  }>();
  const id = Number(params.id);

  const [request, setRequest] = useState<BackDateRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [stage, setStage] = useState<Stage>("none");
  const [decision, setDecision] = useState<ApprovalDecision>("approve");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [refusal, setRefusal] = useState<BackDateApiError | null>(null);

  /**
   * Whether this is the viewer's to decide.
   *
   * A request carries no `can_decide` — the only server answer is membership
   * of the approval queue, so the list passes it through. Opened by deep link
   * (a push notification, a restored cold start) it is absent, and the queue
   * is asked directly rather than guessed at.
   */
  const [actionable, setActionable] = useState(params.actionable === "1");

  /** A second tap must not become a second POST before React has re-rendered. */
  const inFlight = useRef(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const fresh = await backdateService.getRequest(id);
        setRequest(fresh);
        if (params.actionable === undefined) {
          // Deep-linked: ask the queue whether this one is ours to decide.
          const queue = await backdateService.approvalQueue({
            search: String(id),
          });
          setActionable(queue.some((r) => r.id === id));
        }
      } catch (err) {
        setError(messageFrom(err, "Could not load this request."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, params.actionable],
  );

  useEffect(() => {
    load();
    // `params.refreshAt` is what makes an edit's save land here as fresh data
    // rather than the stale copy this screen was already showing.
  }, [load, params.refreshAt]);

  // Returning by the back button, or from the progress screen after a
  // decision. The `refreshAt` param above only covers callers that remember
  // to send it; this covers every other way back in.
  useRefreshOnFocus(() => load(true));

  const openEdit = useCallback(() => {
    router.push({
      pathname: "/(main)/backdate/edit-request",
      params: { id: String(id), from: "backdate/tracking-details" },
    } as never);
  }, [id]);

  /**
   * Edit lives in the header, next to the bell — not as a link at the foot of
   * the page, where it sat below the SAP response and was reached only by
   * scrolling past everything.
   *
   * Whether it appears is the SERVER's answer (`can_edit`), which depends on
   * who is holding the request and whether SAP has refused it. The header
   * cannot see that, so the screen publishes the handler while it applies and
   * clears it otherwise.
   *
   * Tied to FOCUS, not mount: pushing the edit form leaves this screen mounted
   * underneath, and an unmount-only cleanup would leave the pencil showing on
   * the form itself.
   */
  const isFocused = useIsFocused();
  const canEditRef = useRef(false);
  const openEditRef = useRef(openEdit);
  useFocusEffect(
    useCallback(() => {
      setHeaderEditHandler(canEditRef.current ? openEditRef.current : null);
      return () => setHeaderEditHandler(null);
    }, []),
  );
  useEffect(() => {
    canEditRef.current = !!request?.can_edit;
    openEditRef.current = openEdit;
    if (isFocused) {
      setHeaderEditHandler(request?.can_edit ? openEdit : null);
    }
  }, [request?.can_edit, openEdit, isFocused]);

  const submit = async (which: ApprovalDecision, remarks: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDecision(which);
    setStage("loading");
    try {
      const outcome =
        which === "approve"
          ? await backdateService.approve(id, remarks)
          : await backdateService.reject(id, remarks);
      setResult(outcome);
      setStage("done");
    } catch (err) {
      setStage("none");
      const apiError = err instanceof BackDateApiError ? err : null;

      // 502 is SAP refusing the grant — and because SAP is called BEFORE the
      // approval is written, it means NOTHING was approved. It is not a
      // generic failure and must never be reported as one.
      if (apiError?.status === 502) {
        setRefusal(apiError);
      } else {
        showToast(messageFrom(err, "The decision could not be recorded."), "error");
        // 403/409 mean the request moved on — someone else acted, or a
        // replacement took the stage. Re-read rather than leave a stale page.
        load(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

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
        <Ionicons
          name="cloud-offline-outline"
          size={ms(40)}
          color={COLORS.textMuted}
        />
        <Text style={styles.errorText}>{error || "Request not found."}</Text>
      </View>
    );
  }

  const flow = request.flow;
  const status = statusOf(request);
  const stageText = stageLabel(request);
  const tone = STATUS_COLOR[status];
  const sapTone = flow?.hana_status === "SUCCESS" ? SAP_OK : SAP_FAIL;
  const canDecide = actionable && !!flow?.current_stage;

  /**
   * Have the rights already expired?
   *
   * `time_limit` is when the SAP grant stops. A request can sit in a queue
   * until its own expiry goes by, and approving it then calls `OPEN_BKDT` with
   * an expiry already in the past — SAP accepts it, nobody sees a failure, and
   * the requester simply finds they still cannot post.
   *
   * The server refuses that now (`flow._guard_not_expired`); this is the same
   * fact shown BEFORE the approver spends a decision on it.
   */
  const expired =
    !!request.time_limit && new Date(request.time_limit).getTime() < Date.now();
  const blockedByExpiry = canDecide && expired;
  const isFinal = result?.flow_status === "APPROVED";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Gradient hero — the same construction as the payment detail
            header, flush under the navbar with 24pt bottom corners. Carries
            only what identifies the request; everything else is in the grid
            below, because repeating it here pushed the content off the first
            screen. */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <Text style={styles.heroDoc} numberOfLines={1} adjustsFontSizeToFit>
              #{request.id}
            </Text>
            <View style={styles.heroPill}>
              <Text style={[styles.heroPillText, { color: tone }]}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
          </View>

          <View style={styles.heroSubRow}>
            <Ionicons name="person-outline" size={ms(14)} color="#BFDBFE" />
            <Text style={styles.heroParty} numberOfLines={1}>
              {request.sap_username}
            </Text>
            <View style={styles.heroSeparator} />
            <Text style={styles.heroCode} numberOfLines={1}>
              {request.company_label}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.cards}>
          {/* ── General Information ───────────────────────────────────────
              Paired fields side by side so the card stays short enough to
              read without scrolling: an approver checks these against what
              they were told, and a long single column pushes half of it off
              screen. */}
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
              {stageText ? (
                <View style={styles.stagePill}>
                  <Text style={styles.stageText}>{stageText}</Text>
                </View>
              ) : null}
            </View>

            {/* FIRST row: who asked, and who has it now. The two ends of the
                request's journey, which is the first thing anybody opening
                this page wants to know. */}
            <View style={styles.grid}>
              <DetailField
                icon="person-outline"
                label="Raised By"
                value={request.created_by_username || "—"}
                sub={formatInstant(request.created_at)}
              />
              <DetailField
                icon="shield-checkmark-outline"
                label="With"
                value={flow?.effective_user_username || "Not assigned"}
                sub={flow?.current_stage_name || "—"}
                muted={!flow?.effective_user_username}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.grid}>
              <DetailField
                icon="document-text-outline"
                label="Document Type"
                value={request.document_type_name || "—"}
                tone="link"
              />
              <DetailField
                icon="swap-horizontal-outline"
                label="Action"
                value={request.action_label}
                tone="badge"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.grid}>
              <DetailField
                icon="business-outline"
                label="Company"
                value={request.company_label}
              />
              <DetailField
                icon="person-circle-outline"
                label="SAP User"
                value={request.sap_username}
              />
            </View>

            <View style={styles.divider} />

            {/* Full width: a window reads as one fact, and splitting it across
                two cells invited people to read only half of it. */}
            <DetailField
              icon="calendar-outline"
              label="Posting Window"
              value={`${formatDate(request.from_date)} – ${formatDate(request.to_date)}`}
              full
            />

            <View style={styles.divider} />

            <DetailField
              icon="alarm-outline"
              label="Rights Expire"
              value={formatInstant(request.time_limit)}
              // IN THE SAME ROW as the date, not a banner elsewhere: the date
              // and the fact it has passed are one piece of information, and
              // separating them makes a reader check two places to learn one
              // thing.
              badge={expired ? "EXPIRED" : undefined}
              full
            />
          </View>

          {/* ── SAP Information ───────────────────────────────────────────
              Only once SAP has actually been called. An empty box on a
              request nobody has approved yet would imply something is in
              flight when nothing has been sent. */}
          {flow?.hana_status ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.headerIcon,
                    { backgroundColor: sapTone.bg },
                  ]}
                >
                  <Ionicons
                    name={sapTone.icon}
                    size={ms(16)}
                    color={sapTone.fg}
                  />
                </View>
                <Text style={styles.cardTitle}>SAP Information</Text>
                <View style={[styles.sapPill, { backgroundColor: sapTone.bg }]}>
                  <Text style={[styles.sapPillText, { color: sapTone.fg }]}>
                    {flow.hana_status === "SUCCESS" ? "Success" : "Failed"}
                  </Text>
                </View>
              </View>

              <Text style={[styles.sapHeadline, { color: sapTone.fg }]}>
                {flow.hana_status === "SUCCESS"
                  ? "SAP accepted the request"
                  : "SAP rejected the request"}
              </Text>

              {/* SAP's own words, unedited. The stored query is deliberately
                  not shown — what a person needs is what SAP said. */}
              <View style={[styles.sapBox, { backgroundColor: sapTone.bg }]}>
                <Text style={styles.sapBoxLabel}>SAP Response</Text>
                <BackDateSapResultList
                  text={flow.hana_status_text}
                  status={flow.hana_status}
                />
              </View>
            </View>
          ) : null}
        </View>

      </ScrollView>

      {/* FORCE THE UPDATE BEFORE THE APPROVAL.
          Shown only to the person who could otherwise approve: to everyone
          else the badge on the expiry row already says it, and a red banner
          about an action they cannot take is noise. */}
      {blockedByExpiry ? (
        <View style={styles.expiryWarning}>
          <Ionicons name="alert-circle" size={ms(18)} color={COLORS.error} />
          <Text style={styles.expiryWarningText}>
            These rights expired on {formatInstant(request.time_limit)}.
            Approving now would send SAP a grant that is already over. Edit the
            request to set a new expiry, then approve it.
          </Text>
        </View>
      ) : null}

      {canDecide ? (
        <ApprovalBottomBar
          onReject={() => setStage("reject")}
          // REJECT STAYS OPEN. Only approving is blocked — refusing an expired
          // request is exactly what an approver should be able to do, and
          // disabling the whole bar would strand it with no way out.
          onApprove={() => {
            if (blockedByExpiry) {
              // The server refuses this too; catching it here saves the
              // approver a round trip and a dialog that can only fail.
              showToast(
                "These rights have expired. Edit the request to set a new expiry before approving.",
                "error",
              );
              return;
            }
            setStage("approve");
          }}
        />
      ) : null}

      <ApproveDialog
        visible={stage === "approve"}
        onClose={() => setStage("none")}
        onConfirm={(remarks) => submit("approve", remarks)}
      />
      <RejectDialog
        visible={stage === "reject"}
        onClose={() => setStage("none")}
        onConfirm={(remarks) => submit("reject", remarks)}
      />
      {/* Blocking and undismissable: the final approval writes to SAP, which
          takes seconds, and a second tap would be a second grant. */}
      <ApprovalLoadingDialog visible={stage === "loading"} decision={decision} />

      <BackDateDecisionDoneDialog
        visible={stage === "done"}
        decision={decision}
        requestNo={`#${request.id}`}
        isFinal={decision === "approve" && isFinal}
        statusText={result?.hana_status_text}
        onDone={() => {
          setStage("none");
          if (decision === "approve" && isFinal) {
            // Stay: the page now carries the SAP response and row ids the
            // approver could not see before they acted.
            load(true);
          } else {
            router.back();
          }
        }}
      />

      <BackDateSapRefusedDialog
        visible={refusal !== null}
        statusText={refusal?.sap?.hana_status_text}
        message={refusal?.message ?? ""}
        canEdit={request.can_edit}
        onEdit={() => {
          setRefusal(null);
          openEdit();
        }}
        onClose={() => {
          setRefusal(null);
          // The refetch is what flips `can_edit`: the server has just recorded
          // hana_status = FAILED, which is the exception that re-opens editing.
          load(true);
        }}
      />
    </View>
  );
}

/**
 * One icon + label + value cell in the information grid.
 *
 * `full` spans both columns; `sub` stacks a second line beneath the value,
 * which is what makes "raised by / with" readable as one comparison.
 */
function DetailField({
  icon,
  label,
  value,
  tone = "plain",
  full = false,
  sub,
  muted = false,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: "plain" | "link" | "badge";
  full?: boolean;
  sub?: string;
  /** Greys the value for a step that has not happened yet. */
  muted?: boolean;
  /**
   * A short alert chip beside the value, in the SAME row.
   *
   * For a fact ABOUT the value rather than a second value — "EXPIRED" next to
   * an expiry date. Putting it anywhere else would make a reader check two
   * places to learn one thing.
   */
  badge?: string;
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
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{label}</Text>
          {badge ? (
            <View style={styles.alertBadge}>
              <Ionicons
                name="alert-circle"
                size={ms(11)}
                color={COLORS.error}
              />
              <Text style={styles.alertBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {tone === "badge" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {value || "—"}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.fieldValue,
              tone === "link" && styles.fieldValueLink,
              muted && styles.fieldValueMuted,
            ]}
            numberOfLines={full ? 4 : 2}
          >
            {value || "—"}
          </Text>
        )}
        {!!sub && (
          <Text style={styles.fieldSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(10),
    padding: sp(24),
  },
  errorText: {
    fontSize: fs(14),
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  // No horizontal padding: the hero runs edge to edge under the navbar and
  // the cards inset themselves.
  body: { paddingBottom: sp(40) },

  // ── Hero ──────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: sp(18),
    paddingTop: sp(16),
    paddingBottom: sp(18),
    borderBottomLeftRadius: sp(24),
    borderBottomRightRadius: sp(24),
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: sp(10) },
  heroDoc: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: fs(19),
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  heroPill: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: sp(5),
    paddingHorizontal: sp(12),
  },
  heroPillText: { fontSize: fs(11), fontWeight: "800" },
  heroSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginTop: sp(12),
  },
  heroParty: {
    flexShrink: 1,
    color: "#fff",
    fontSize: fs(14),
    fontWeight: "700",
  },
  heroSeparator: {
    width: 1,
    height: ms(12),
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  heroCode: { color: "#DBEAFE", fontSize: fs(12), fontWeight: "600" },

  // ── Cards ─────────────────────────────────────────────────────────────
  cards: { padding: sp(16), paddingBottom: 0 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#0F172A",
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
  cardTitle: { flex: 1, fontSize: fs(15), fontWeight: "700", color: COLORS.text },
  stagePill: {
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    borderRadius: sp(20),
    backgroundColor: COLORS.primaryLighter,
    flexShrink: 0,
  },
  stageText: { fontSize: fs(11), fontWeight: "800", color: COLORS.primary },

  // Wraps rather than scrolls sideways, so two cells become one per row on a
  // narrow screen instead of clipping.
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    paddingVertical: sp(6),
  },
  fieldHalf: { width: "50%", paddingRight: sp(8) },
  fieldFull: { width: "100%" },
  fieldIcon: { marginTop: sp(2) },
  fieldText: { flex: 1, minWidth: 0 },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(6),
    marginBottom: sp(2),
  },
  fieldLabel: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    paddingHorizontal: sp(6),
    paddingVertical: sp(1),
    borderRadius: RADIUS.sm,
    backgroundColor: "#FEF2F2",
  },
  alertBadgeText: {
    fontSize: fs(9.5),
    fontWeight: "800",
    letterSpacing: 0.4,
    color: COLORS.error,
  },
  expiryWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(8),
    marginHorizontal: sp(14),
    marginBottom: sp(8),
    padding: sp(11),
    borderRadius: RADIUS.md,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  expiryWarningText: {
    flex: 1,
    fontSize: fs(12),
    lineHeight: ms(17),
    color: COLORS.error,
  },
  fieldValue: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: fs(18),
  },
  fieldValueLink: { color: COLORS.primary },
  // A step that has not happened yet — greyed rather than hidden, so the
  // column still lines up against its pair.
  fieldValueMuted: { color: COLORS.textSecondary, fontWeight: "600" },
  fieldSub: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginTop: sp(2),
    lineHeight: fs(15),
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryLight,
    borderRadius: sp(8),
    paddingVertical: sp(3),
    paddingHorizontal: sp(8),
    marginTop: sp(1),
  },
  badgeText: { fontSize: fs(11), fontWeight: "700", color: COLORS.primary },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: sp(4),
  },

  // ── SAP Information ───────────────────────────────────────────────────
  sapPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(4),
    borderRadius: 999,
    flexShrink: 0,
  },
  sapPillText: { fontSize: fs(11), fontWeight: "800" },
  sapHeadline: { fontSize: fs(13), fontWeight: "700", marginBottom: sp(10) },
  sapBox: { borderRadius: sp(12), padding: sp(12) },
  sapBoxLabel: {
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(6),
  },

});
