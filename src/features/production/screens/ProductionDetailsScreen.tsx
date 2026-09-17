import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { showToast } from "@/src/components/common/Toast";
import { COLORS } from "@/src/constants/theme";
import ApprovalBottomBar from "@/src/features/approval/components/ApprovalBottomBar";
import ApprovalLoadingDialog from "@/src/features/approval/components/dialogs/ApprovalLoadingDialog";
import ApproveDialog from "@/src/features/approval/components/dialogs/ApproveDialog";
import RejectDialog from "@/src/features/approval/components/dialogs/RejectDialog";
import productionService, {
  ProductionApiError,
  SAP_ORDER_STATUS_LABEL,
  SAP_ORDER_TYPE_LABEL,
  type DecisionResult,
  type ProductionOrder,
} from "@/src/services/production.service";
import { formatDate, formatInstant } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import ProductionDecisionDoneDialog from "../components/ProductionDecisionDoneDialog";
import { formatQty } from "../components/ProductionOrderCard";
import {
  canRetrySap,
  stageLabel,
  statusOf,
  type ApprovalDecision,
  type ProductionStatus,
} from "../types";

type Stage = "none" | "approve" | "reject" | "loading" | "done";

/** Pill colour follows the outcome, not one flat accent. */
const STATUS_COLOR: Record<ProductionStatus, string> = {
  Pending: COLORS.warning,
  Approved: COLORS.primary,
  Completed: COLORS.success,
  Rejected: COLORS.error,
  SapFailed: COLORS.error,
  Obsolete: COLORS.textSecondary,
};

const STATUS_LABEL: Record<ProductionStatus, string> = {
  Pending: "Pending",
  Approved: "In Progress",
  Completed: "Completed",
  Rejected: "Rejected",
  SapFailed: "SAP Error",
  Obsolete: "No Longer Planned",
};

const SAP_OK = { bg: "#ECFDF5", fg: "#047857", icon: "checkmark-circle" as const };
const SAP_FAIL = { bg: "#FEF2F2", fg: "#B91C1C", icon: "alert-circle" as const };

/**
 * What one production order is — and, for the approver holding it, the
 * decision.
 *
 * The same screen serves a watcher and an approver. What differs is the action
 * bar, and that is decided by a server answer rather than by which list opened
 * it: membership of the approval queue, passed as `actionable`.
 *
 * THERE IS NO EDIT. SAP is the point of origin and OMS never changes a
 * production order — the absence of a pencil here is the design, not an
 * omission.
 */
export default function ProductionDetailsScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    actionable?: string;
    from?: string;
  }>();
  const id = Number(params.id);

  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [stage, setStage] = useState<Stage>("none");
  const [decision, setDecision] = useState<ApprovalDecision>("approve");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [retrying, setRetrying] = useState(false);

  /**
   * Whether this is the viewer's to decide.
   *
   * An order carries no `can_decide` — the only server answer is membership of
   * the approval queue, so the list passes it through. Opened by deep link (a
   * push notification, a restored cold start) it is absent, and the queue is
   * asked directly rather than guessed at.
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
        const fresh = await productionService.getOrder(id);
        setOrder(fresh);
        if (params.actionable === undefined) {
          const queue = await productionService.approvalQueue();
          setActionable(queue.some((row) => row.id === id));
        }
      } catch (err) {
        setError(messageFor(err, "Could not load this order."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, params.actionable],
  );

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (which: ApprovalDecision, remarks: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDecision(which);
    setStage("loading");
    try {
      const outcome =
        which === "approve"
          ? await productionService.approve(id, remarks)
          : await productionService.reject(id, remarks);
      setResult(outcome);
      setStage("done");
    } catch (err) {
      setStage("none");
      showToast(messageFor(err, "The decision could not be recorded."), "error");
    } finally {
      inFlight.current = false;
    }
  };

  /**
   * Re-attempt the write-back.
   *
   * Worth a button rather than a support ticket: a lost approval leaves an
   * order blocked in SAP that everyone believes is released, and the only
   * evidence is a status nobody is looking at.
   */
  const retrySap = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const outcome = await productionService.retrySap(id);
      showToast(
        outcome.sap_status === "SUCCESS"
          ? "SAP has the decision now."
          : "SAP refused again — see the SAP Information card.",
        outcome.sap_status === "SUCCESS" ? "success" : "error",
      );
      await load(true);
    } catch (err) {
      showToast(messageFor(err, "The retry could not be sent."), "error");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="alert-circle-outline"
          size={ms(40)}
          color={COLORS.textMuted}
        />
        <Text style={styles.errorText}>{error || "Order not found."}</Text>
      </View>
    );
  }

  const flow = order.flow;
  const status = statusOf(order);
  const stageText = stageLabel(order);
  const tone = STATUS_COLOR[status];
  const sapTone = flow?.sap_status === "SUCCESS" ? SAP_OK : SAP_FAIL;
  const canDecide = actionable && !!flow?.current_stage;
  const showRetry = canRetrySap(order);
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
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <Text style={styles.heroDoc} numberOfLines={1} adjustsFontSizeToFit>
              #{order.sap_doc_num ?? order.sap_doc_entry}
            </Text>
            <View style={styles.heroPill}>
              <Text style={[styles.heroPillText, { color: tone }]}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
          </View>

          <View style={styles.heroSubRow}>
            <Ionicons name="cube-outline" size={ms(14)} color="#BFDBFE" />
            <Text style={styles.heroParty} numberOfLines={1}>
              {order.item_name || order.item_code}
            </Text>
            <View style={styles.heroSeparator} />
            <Text style={styles.heroCode} numberOfLines={1}>
              {order.company}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.cards}>
          {/* ── General Information ───────────────────────────────────────
              Paired fields side by side so the card stays short enough to
              read without scrolling: an approver checks these against the
              production plan in front of them, and a long single column
              pushes half of it off screen. */}
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

            <View style={styles.grid}>
              <DetailField
                icon="person-outline"
                label="Raised in SAP by"
                value={order.sap_created_by || "—"}
                sub={formatDate(order.post_date)}
              />
              <DetailField
                icon="shield-checkmark-outline"
                label="With"
                value={flow?.current_user_name || "Not assigned"}
                sub={flow?.current_stage_name || "—"}
                muted={!flow?.current_user_name}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.grid}>
              <DetailField
                icon="barcode-outline"
                label="Item Code"
                value={order.item_code}
                tone="link"
              />
              <DetailField
                icon="layers-outline"
                label="Order Type"
                value={SAP_ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
                tone="badge"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.grid}>
              <DetailField
                icon="cube-outline"
                label="Planned Qty"
                value={`${formatQty(order.planned_qty)} pcs`}
                sub={packLine(order)}
              />
              <DetailField
                icon="file-tray-full-outline"
                label="Warehouse"
                value={order.warehouse || "—"}
                sub={order.item_group || undefined}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.grid}>
              <DetailField
                icon="calendar-outline"
                label="Post Date"
                value={formatDate(order.post_date)}
              />
              <DetailField
                icon="alarm-outline"
                label="Due Date"
                value={formatDate(order.due_date)}
              />
            </View>

            {order.batch_no || order.mfg_date || order.expiry_date ? (
              <>
                <View style={styles.divider} />
                <View style={styles.grid}>
                  <DetailField
                    icon="pricetag-outline"
                    label="Batch"
                    value={order.batch_no || "—"}
                    sub={
                      order.mfg_date
                        ? `MFG ${formatDate(order.mfg_date)}`
                        : undefined
                    }
                  />
                  <DetailField
                    icon="hourglass-outline"
                    label="Expiry"
                    value={formatDate(order.expiry_date)}
                  />
                </View>
              </>
            ) : null}

            <View style={styles.divider} />

            {/* Full width: it carries its own explanation, which wraps to two
                lines in a half-width cell. */}
            <DetailField
              icon="git-compare-outline"
              label="SAP Document"
              value={`DocEntry ${order.sap_doc_entry} · ${
                SAP_ORDER_STATUS_LABEL[order.sap_status] ?? order.sap_status
              }`}
              sub={`Last synced ${formatInstant(order.synced_at)}`}
              full
            />

            {order.remarks ? (
              <>
                <View style={styles.divider} />
                <DetailField
                  icon="chatbox-ellipses-outline"
                  label="SAP Comments"
                  value={order.remarks}
                  full
                />
              </>
            ) : null}
          </View>

          {/* ── The SAP release gate ──────────────────────────────────────
              Stated, not hidden. SAP's rule ends `AND UserSign <> 33`, and
              that one user raised most of production — so an approval that
              was never going to be enforced must not look identical to one
              that was. An approver deciding this deserves to know which they
              are doing. */}
          {order.gate_exempt ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.headerIcon,
                    { backgroundColor: COLORS.warningLight },
                  ]}
                >
                  <Ionicons
                    name="information-circle"
                    size={ms(16)}
                    color={COLORS.warning}
                  />
                </View>
                <Text style={styles.cardTitle}>Outside SAP&rsquo;s gate</Text>
              </View>
              <Text style={styles.gateText}>
                {order.gate_exemption_reason ||
                  "SAP's release rule would not have held this order, so the decision here is a record rather than a control."}
              </Text>
            </View>
          ) : null}

          {/* ── SAP Information ───────────────────────────────────────────
              Only once the write-back has been attempted. A "pending" SAP box
              on an order nobody has approved would imply something is in
              flight when nothing has been sent. */}
          {flow?.sap_status ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View
                  style={[styles.headerIcon, { backgroundColor: sapTone.bg }]}
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
                    {flow.sap_status === "SUCCESS" ? "Synced" : "Failed"}
                  </Text>
                </View>
              </View>

              <Text style={[styles.sapHeadline, { color: sapTone.fg }]}>
                {flow.sap_status === "SUCCESS"
                  ? "The decision reached SAP"
                  : "SAP was not told — the order is still held"}
              </Text>

              <View style={[styles.sapBox, { backgroundColor: sapTone.bg }]}>
                <Text style={styles.sapBoxLabel}>SAP Response</Text>
                <Text style={styles.sapBoxText}>
                  {flow.sap_status_text || "—"}
                </Text>
              </View>

              {showRetry ? (
                <TouchableOpacity
                  style={[styles.retryBtn, retrying && styles.retryBtnOff]}
                  onPress={retrySap}
                  disabled={retrying}
                  activeOpacity={0.85}
                >
                  {retrying ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="refresh-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.retryText}>
                    {retrying ? "Retrying…" : "Retry SAP"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {canDecide ? (
        <ApprovalBottomBar
          onReject={() => setStage("reject")}
          onApprove={() => setStage("approve")}
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
      {/* Blocking and undismissable: a final approval writes back to SAP,
          which takes seconds, and a second tap would be a second write. */}
      <ApprovalLoadingDialog visible={stage === "loading"} decision={decision} />

      <ProductionDecisionDoneDialog
        visible={stage === "done"}
        decision={decision}
        docNo={`#${order.sap_doc_num ?? order.sap_doc_entry}`}
        isFinal={decision === "approve" && isFinal}
        sapStatus={result?.sap_status}
        statusText={result?.sap_status_text}
        onDone={() => {
          setStage("none");
          if (decision === "approve" && isFinal) {
            // Stay: the page now carries the SAP response the approver could
            // not see before they acted — and the Retry button, if it failed.
            load(true);
          } else {
            router.back();
          }
        }}
      />
    </View>
  );
}

/** Boxes and litres, omitted rather than guessed when SAP has no pack size. */
function packLine(order: ProductionOrder): string | undefined {
  const parts: string[] = [];
  if (order.planned_boxes) parts.push(`${formatQty(order.planned_boxes)} box`);
  if (order.planned_litres) parts.push(`${formatQty(order.planned_litres)} L`);
  return parts.length ? parts.join(" · ") : undefined;
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ProductionApiError && error.message) return error.message;
  const message = (error as { message?: string })?.message;
  return message && message.trim() ? message : fallback;
}

/**
 * One icon + label + value cell in the information grid.
 *
 * `full` spans both columns; `sub` stacks a second line beneath the value.
 */
function DetailField({
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
  tone?: "plain" | "link" | "badge";
  full?: boolean;
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
        <Text style={styles.fieldLabel}>{label}</Text>
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
  cardTitle: {
    flex: 1,
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
  },
  stagePill: {
    paddingHorizontal: sp(9),
    paddingVertical: sp(3),
    borderRadius: sp(20),
    backgroundColor: COLORS.primaryLighter,
    flexShrink: 0,
  },
  stageText: { fontSize: fs(11), fontWeight: "800", color: COLORS.primary },

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
  fieldLabel: {
    fontSize: fs(11),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  fieldValue: {
    fontSize: fs(13),
    fontWeight: "700",
    color: COLORS.text,
    lineHeight: fs(18),
  },
  fieldValueLink: { color: COLORS.primary },
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

  gateText: {
    fontSize: fs(13),
    lineHeight: fs(19),
    color: COLORS.textSecondary,
  },

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
  sapBoxText: {
    fontSize: fs(12),
    lineHeight: fs(17),
    color: COLORS.textSecondary,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    marginTop: sp(12),
    borderRadius: sp(10),
    paddingVertical: sp(12),
    backgroundColor: COLORS.primary,
  },
  retryBtnOff: { backgroundColor: COLORS.textMuted },
  retryText: { color: "#fff", fontSize: fs(14), fontWeight: "700" },
});
