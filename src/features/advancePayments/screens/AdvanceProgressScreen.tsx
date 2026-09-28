import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  advancePaymentError,
  advancePaymentService,
  type ApiRequest,
} from "@/src/services/advancePayment.service";

import EditChangeRows, {
  ManualAccountFlag,
} from "../components/EditChangeRows";
import { formatDateTime } from "../logic/requestLabels";

/**
 * Where one advance payment request has got to.
 *
 * THE PAYMENT PROGRESS TIMELINE, same vocabulary and same colours: a summary
 * card with the request number, then one card per stage down a connected line —
 * green for done, orange for the stage it is sitting at, grey for what is still
 * ahead, red for a refusal, and a blue SAP card at the end. The states come from
 * the server's own `stages` and `logs`, so this screen invents no history.
 */

const DONE_GREEN = "#52B760";
const DONE_LINE = "#84D58E";
const DONE_CARD = "#EAF9EC";
const DONE_BORDER = "#BFE6C4";
const REJECTED_RED = "#E25555";
const REJECTED_LINE = "#F1A3A3";
const REJECTED_CARD = "#FDECEC";
const REJECTED_BORDER = "#F3B6B6";
const PENDING_ORANGE = "#F59E0B";
const PENDING_LINE = "#F7C66B";
const PENDING_CARD = "#FFF5DF";
const PENDING_BORDER = "#F5D595";
const FUTURE_GREY = "#9CA3AF";
const FUTURE_LINE = "#D1D5DB";
const FUTURE_CARD = "#F9FAFB";
const FUTURE_BORDER = "#E5E7EB";
const INFO_BLUE = "#2563EB";
const INFO_LINE = "#93B4F5";
const INFO_CARD = "#EFF5FF";
const INFO_BORDER = "#C7DBFB";

type StageState = "DONE" | "REJECTED" | "CURRENT" | "FUTURE" | "INFO";

const TONE: Record<
  StageState,
  { accent: string; line: string; card: string; border: string }
> = {
  DONE: { accent: DONE_GREEN, line: DONE_LINE, card: DONE_CARD, border: DONE_BORDER },
  REJECTED: {
    accent: REJECTED_RED,
    line: REJECTED_LINE,
    card: REJECTED_CARD,
    border: REJECTED_BORDER,
  },
  CURRENT: {
    accent: PENDING_ORANGE,
    line: PENDING_LINE,
    card: PENDING_CARD,
    border: PENDING_BORDER,
  },
  FUTURE: {
    accent: FUTURE_GREY,
    line: FUTURE_LINE,
    card: FUTURE_CARD,
    border: FUTURE_BORDER,
  },
  INFO: { accent: INFO_BLUE, line: INFO_LINE, card: INFO_CARD, border: INFO_BORDER },
};

/** "1st Level", "2nd Level", … — the same wording as the orders timeline. */
const ordinalLevel = (position: number) => {
  const ten = position % 10;
  const hundred = position % 100;
  if (ten === 1 && hundred !== 11) return `${position}st Level`;
  if (ten === 2 && hundred !== 12) return `${position}nd Level`;
  if (ten === 3 && hundred !== 13) return `${position}rd Level`;
  return `${position}th Level`;
};

/** One note, attributed — who wrote it, and while doing what. */
interface StageRemark {
  by: string;
  text: string;
  at?: string;
  action?: string;
}

/** One rendered card: an approval stage, or the trailing SAP payment card. */
interface Stage {
  key: string;
  title: string;
  badge: string;
  state: StageState;
  /**
   * Who the stage is with, and how it went for them.
   *
   * SUBMITTED is the creator's own step. They did not approve their request —
   * they raised it — and a green "Approved" against the requester's name reads
   * as a decision nobody made.
   */
  approver?: {
    name: string;
    state: "APPROVED" | "REJECTED" | "PENDING" | "SUBMITTED";
  };
  stageLabel?: string;
  timestamp?: string;
  remarks?: StageRemark[];
  /** SAP card only. */
  info?: { label: string; value: string }[];
}

export default function AdvanceProgressScreen() {
  // Back goes where this page was opened from - the list, or the details
  // page behind a progress page - never to the dashboard. See the hook.
  useBackToOrigin("/(main)/advance-payments/tracking");

  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);

  const [request, setRequest] = useState<ApiRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /**
   * @param quiet update in place, keeping what is on screen while it reloads.
   *              Used for the focus refresh and pull-to-refresh, where the
   *              timeline is already the right request's.
   *
   * Anything else CLEARS FIRST. This screen is reached from a card, and the
   * navigator keeps it mounted: opening a second request reused the component
   * with a new id, and without clearing, the previous request's timeline sat on
   * screen — under the new request's number — until the fetch came back. A
   * spinner for half a second is honest; another request's history is not.
   */
  const load = useCallback(
    async (quiet = false) => {
      if (!Number.isFinite(requestId)) {
        setError("Missing request reference.");
        setLoading(false);
        return;
      }
      if (!quiet) {
        setRequest(null);
        setLoading(true);
      }
      setError("");
      try {
        setRequest(await advancePaymentService.request(requestId));
      } catch (err) {
        setError(advancePaymentError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [requestId],
  );

  // The id is in `load`'s dependencies, so this re-runs — and clears — whenever
  // a different request is opened.
  useEffect(() => {
    void load();
  }, [load]);

  // A decision taken on the details screen changes this timeline, so returning
  // here re-reads it. Quietly: the request is the same one, and blanking a
  // timeline the reader is looking at to fetch the same thing again reads as a
  // fault. `request(id)` is `no-store`, so this is always the server's answer.
  useRefreshOnFocus(() => load(true));

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DONE_GREEN} />
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color={REJECTED_RED} />
        <Text style={styles.emptyText}>{error || "This request could not be read."}</Text>
      </View>
    );
  }

  const stages = buildStages(request);

  const renderStage = ({ item, index }: { item: Stage; index: number }) => {
    const tone = TONE[item.state];
    const isLast = index === stages.length - 1;
    const circleIcon =
      item.state === "DONE"
        ? "checkmark"
        : item.state === "REJECTED"
          ? "close"
          : item.state === "CURRENT"
            ? "time-outline"
            : item.state === "INFO"
              ? "server-outline"
              : "ellipse-outline";
    const headerIcon =
      item.state === "DONE"
        ? "checkmark-done-circle"
        : item.state === "REJECTED"
          ? "close-circle"
          : item.state === "CURRENT"
            ? "hourglass-outline"
            : item.state === "INFO"
              ? "server"
              : "ellipse-outline";

    return (
      <View style={styles.timelineRow}>
        <View style={styles.leftColumn}>
          <View style={[styles.iconCircle, { backgroundColor: tone.accent }]}>
            <Ionicons name={circleIcon as never} size={15} color="#fff" />
          </View>
          {!isLast ? (
            <View style={[styles.connector, { backgroundColor: tone.line }]} />
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: tone.card, borderColor: tone.border }]}>
          <View style={styles.cardHeader}>
            <Ionicons
              name={headerIcon as never}
              size={22}
              color={tone.accent}
              style={styles.headerIcon}
            />
            <Text style={styles.statusText}>{item.title}</Text>
            <View style={[styles.stageBadge, { backgroundColor: tone.accent + "1A" }]}>
              <Text style={[styles.stageBadgeText, { color: tone.accent }]}>
                {item.badge}
              </Text>
            </View>
          </View>

          {item.approver ? (
            <View style={styles.detailRow}>
              <Ionicons
                name="people-outline"
                size={ms(18)}
                color="#1E1E1E"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>
                  {item.approver.state === "SUBMITTED"
                    ? "Submitted by"
                    : item.state === "CURRENT" || item.state === "FUTURE"
                      ? "Waiting on"
                      : "Decided by"}
                </Text>
                {(() => {
                  const personTone =
                    item.approver.state === "APPROVED"
                      ? DONE_GREEN
                      : item.approver.state === "REJECTED"
                        ? REJECTED_RED
                        : item.approver.state === "SUBMITTED"
                          ? INFO_BLUE
                          : PENDING_ORANGE;
                  const personIcon =
                    item.approver.state === "APPROVED"
                      ? "checkmark-circle"
                      : item.approver.state === "REJECTED"
                        ? "close-circle"
                        : item.approver.state === "SUBMITTED"
                          ? "paper-plane"
                          : "time-outline";
                  return (
                    <View style={styles.approverRow}>
                      <View
                        style={[styles.approverAvatar, { backgroundColor: personTone + "1A" }]}
                      >
                        <Text style={[styles.approverAvatarText, { color: personTone }]}>
                          {String(item.approver?.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.approverNameWrap}>
                        <Text style={styles.approverName} numberOfLines={1}>
                          {item.approver?.name}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.approverStatusChip,
                          { backgroundColor: personTone + "1A" },
                        ]}
                      >
                        <Ionicons name={personIcon} size={ms(11)} color={personTone} />
                        <Text style={[styles.approverStatusText, { color: personTone }]}>
                          {item.approver?.state === "APPROVED"
                            ? "Approved"
                            : item.approver?.state === "REJECTED"
                              ? "Rejected"
                              : item.approver?.state === "SUBMITTED"
                                ? "Submitted"
                                : "Pending"}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            </View>
          ) : null}

          {!!item.stageLabel && (
            <DetailRow icon="git-network-outline" label="Stage" value={item.stageLabel} />
          )}
          {!!item.timestamp && (
            <DetailRow icon="time-outline" label="Timestamp" value={item.timestamp} />
          )}

          {item.remarks?.length ? (
            <View style={styles.detailRow}>
              <Ionicons
                name="document-text-outline"
                size={fs(16)}
                color="#1E1E1E"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>Remarks</Text>
                {item.remarks.map((remark, i) => (
                  <View
                    key={`${item.key}-remark-${i}`}
                    style={i > 0 ? styles.remarkBlockSpaced : undefined}
                  >
                    <Text style={styles.detailValue}>{remark.text}</Text>
                    <Text style={styles.remarkAuthor}>
                      {remark.by}
                      {remark.action ? ` · ${remark.action}` : ""}
                      {remark.at && remark.at !== "—" ? ` · ${remark.at}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {item.info?.map((row) => (
            <DetailRow
              key={row.label}
              icon="ellipse-outline"
              label={row.label}
              value={row.value}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIconWrap}>
            <Ionicons name="wallet-outline" size={ms(20)} color={INFO_BLUE} />
          </View>
          <View style={styles.summaryMain}>
            <Text style={styles.summaryLabel}>Advance Payment</Text>
            <Text style={styles.summaryOrderNo} numberOfLines={1} adjustsFontSizeToFit>
              {request.request_no}
            </Text>
          </View>
        </View>

        <FlatList
          data={stages}
          keyExtractor={(item) => item.key}
          renderItem={renderStage}
          contentContainerStyle={[
            styles.listContent,
            stages.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              colors={[DONE_GREEN]}
              tintColor={DONE_GREEN}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                This request has no approval route yet.
              </Text>
            </View>
          }
          // THE WHOLE HISTORY, and only here. Every action the server logged,
          // oldest first, in one box under the timeline: the timeline says where
          // the request is, this says everything that has happened to it. The
          // details page deliberately carries neither.
          ListFooterComponent={<HistoryBox request={request} />}
        />
      </View>
    </View>
  );
}

/**
 * Everything that has happened to this request, in one box.
 *
 * ONE PLACE FOR THE HISTORY. It used to be split between this screen's timeline
 * and a card on the details page, which meant two lists that could disagree
 * about what had happened. The timeline answers "where is it?"; this answers
 * "what has been done to it?", and the details page answers neither.
 *
 * Oldest first, because a history is read forwards.
 */
/**
 * What each action looks like on the history line.
 *
 * ONE ICON PER ACTION, as the server names them (`LogAction`): a submission
 * flies, an approval ticks, a refusal crosses, a return turns back, money and
 * files carry their own marks. A single dot for all of them made the list
 * unreadable at a glance, which is the only thing a history is for.
 */
const HISTORY_MARK: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; tone: string }
> = {
  CREATED: { icon: "add-circle", tone: INFO_BLUE },
  SUBMITTED: { icon: "paper-plane", tone: INFO_BLUE },
  EDITED: { icon: "create", tone: INFO_BLUE },
  RESUBMITTED: { icon: "refresh-circle", tone: INFO_BLUE },
  APPROVED: { icon: "checkmark-circle", tone: DONE_GREEN },
  COMPLETED: { icon: "checkmark-done-circle", tone: DONE_GREEN },
  REJECTED: { icon: "close-circle", tone: REJECTED_RED },
  RETURNED: { icon: "arrow-undo-circle", tone: PENDING_ORANGE },
  SENT_BACK: { icon: "arrow-back-circle", tone: PENDING_ORANGE },
  CANCELLED: { icon: "ban", tone: FUTURE_GREY },
  PAYOUT_UPDATED: { icon: "wallet", tone: INFO_BLUE },
  UTR_RECORDED: { icon: "receipt", tone: DONE_GREEN },
  PARTNER_LINKED: { icon: "link", tone: INFO_BLUE },
  FILE_ADDED: { icon: "attach", tone: INFO_BLUE },
  FILE_REMOVED: { icon: "trash", tone: PENDING_ORANGE },
  SAP_POSTED: { icon: "server", tone: DONE_GREEN },
  SAP_REPOSTED: { icon: "server", tone: DONE_GREEN },
  SAP_POST_FAILED: { icon: "alert-circle", tone: REJECTED_RED },
  SAP_CANCELLED: { icon: "warning", tone: PENDING_ORANGE },
};

const MARK_FALLBACK = { icon: "ellipse" as const, tone: FUTURE_GREY };

/**
 * Everything that has happened to this request, on a line of its own.
 *
 * ONE PLACE FOR THE HISTORY. It used to be split between the timeline above and
 * a card on the details page, which meant two lists that could disagree. The
 * timeline answers "where is it?"; this answers "what has been done to it?",
 * and the details page answers neither.
 *
 * Built like the timeline above it — a connected line, a coloured mark per
 * action — so the page reads as one thing rather than a timeline with a table
 * stapled underneath. Oldest first, because a history is read forwards, and
 * collapsible because on a long-running request it is the longest thing here.
 */
function HistoryBox({ request }: { request: ApiRequest }) {
  const logs = request.logs ?? [];
  const [open, setOpen] = useState(true);
  if (logs.length === 0) return null;

  return (
    <View style={styles.historyCard}>
      <TouchableOpacity
        style={styles.historyHead}
        onPress={() => setOpen((current) => !current)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.historyHeadIcon}>
          <Ionicons name="time" size={ms(16)} color={INFO_BLUE} />
        </View>
        <Text style={styles.historyTitle}>History ({logs.length})</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {open
        ? logs.map((log, index) => {
            const mark = HISTORY_MARK[log.action] ?? MARK_FALLBACK;
            const isLast = index === logs.length - 1;
            return (
              <View key={log.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View
                    style={[styles.historyMark, { backgroundColor: mark.tone + "1A" }]}
                  >
                    <Ionicons name={mark.icon} size={ms(13)} color={mark.tone} />
                  </View>
                  {!isLast ? <View style={styles.historyConnector} /> : null}
                </View>

                <View style={styles.historyBody}>
                  <Text style={styles.historyAction}>{log.label || log.action}</Text>
                  <Text style={styles.historyMeta}>
                    {log.actor?.name ?? "System"}
                    {log.stage_name ? ` \u00b7 ${log.stage_name}` : ""}
                    {` \u00b7 ${formatDateTime(log.created_on)}`}
                  </Text>
                  {log.remarks ? (
                    <Text style={styles.historyRemarks}>{log.remarks}</Text>
                  ) : null}
                  <ManualAccountFlag log={log} />
                  <EditChangeRows log={log} />
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={fs(16)} color="#1E1E1E" style={styles.detailIcon} />
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * The server's stages and history, as cards.
 *
 * THE STATE IS THE SERVER'S WORD, not a guess from the status: `stages[].state`
 * already says what happened at each stage this round (CURRENT, UPCOMING,
 * APPROVED, REJECTED, RETURNED, SENT_BACK), which is the only thing that can
 * describe a request that went back a step and came forward again.
 */
function buildStages(request: ApiRequest): Stage[] {
  const logs = request.logs ?? [];
  const stages: Stage[] = (request.stages ?? []).map((stage) => {
    const state: StageState =
      stage.state === "APPROVED"
        ? "DONE"
        : stage.state === "REJECTED"
          ? "REJECTED"
          : stage.state === "CURRENT"
            ? "CURRENT"
            : stage.state === "RETURNED" || stage.state === "SENT_BACK"
              ? "REJECTED"
              : "FUTURE";

    // Every note left at this stage, in order: one stage can be returned,
    // corrected and approved again, and each of those carries its own note.
    const remarks: StageRemark[] = logs
      .filter((log) => log.stage_name === stage.name && log.remarks)
      .map((log) => ({
        by: log.actor?.name ?? "System",
        text: log.remarks,
        at: formatDateTime(log.created_on),
        action: log.label || log.action,
      }));

    return {
      key: `stage-${stage.stage_id}-${stage.sequence}`,
      title: stage.name,
      badge: ordinalLevel(stage.sequence),
      state,
      approver: stage.user_name
        ? {
            name: stage.user_name,
            state:
              state === "DONE" ? "APPROVED" : state === "REJECTED" ? "REJECTED" : "PENDING",
          }
        : undefined,
      stageLabel: stage.role ? `${stage.name} · ${stage.role}` : stage.name,
      timestamp: stage.acted_on ? formatDateTime(stage.acted_on) : undefined,
      remarks: remarks.length ? remarks : undefined,
    };
  });

  // The request being raised, first — the timeline starts with the person who
  // asked, as the payments one does.
  stages.unshift({
    key: "raised",
    title: "Request Raised",
    badge: "Created",
    state: "DONE",
    approver: { name: request.created_by?.name ?? "—", state: "SUBMITTED" },
    timestamp: formatDateTime(request.created_on),
    remarks: request.remarks
      ? [
          {
            by: request.created_by?.name ?? "—",
            text: request.remarks,
            at: formatDateTime(request.created_on),
            action: "Raised",
          },
        ]
      : undefined,
  });

  // SAP last, once Final's approval has posted the outgoing payment.
  if (request.voucher) {
    const voucher = request.voucher;
    stages.push({
      key: "sap",
      title: voucher.status === "POSTED" ? "Posted to SAP" : "SAP Posting Failed",
      badge: "SAP",
      state: voucher.status === "POSTED" ? "INFO" : "REJECTED",
      timestamp: voucher.posted_on ? formatDateTime(voucher.posted_on) : undefined,
      info: [
        { label: "Status", value: voucher.status },
        {
          label: "Payment No.",
          value: voucher.sap_doc_num != null ? String(voucher.sap_doc_num) : "—",
        },
        { label: "Posted By", value: voucher.posted_by?.name ?? "—" },
        ...(voucher.error ? [{ label: "SAP said", value: voucher.error }] : []),
      ],
    });
  }

  return stages;
}

/** Copied from `TrackingProgressScreen.styles` — one timeline, two modules. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: sp(14), paddingTop: sp(12) },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: sp(12),
    padding: sp(24),
  },
  emptyText: {
    fontSize: fs(14),
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(12),
    backgroundColor: COLORS.surface,
    borderRadius: sp(14),
    padding: sp(14),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryIconWrap: {
    width: ms(40),
    height: ms(40),
    borderRadius: sp(12),
    backgroundColor: INFO_CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryLabel: { fontSize: fs(11), color: COLORS.textSecondary, fontWeight: "600" },
  summaryOrderNo: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },

  listContent: { paddingBottom: sp(40) },
  timelineRow: { flexDirection: "row", gap: sp(10) },
  leftColumn: { alignItems: "center", width: ms(30) },
  iconCircle: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    alignItems: "center",
    justifyContent: "center",
  },
  connector: { width: 2, flex: 1, marginVertical: 2 },

  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: sp(14),
    padding: sp(14),
    marginBottom: sp(14),
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: sp(8) },
  headerIcon: { marginRight: 2 },
  statusText: { flex: 1, fontSize: fs(14), fontWeight: "800", color: "#1E1E1E" },
  stageBadge: {
    paddingHorizontal: sp(9),
    paddingVertical: sp(4),
    borderRadius: 999,
  },
  stageBadgeText: { fontSize: fs(10), fontWeight: "800" },

  detailRow: { flexDirection: "row", gap: sp(8), marginTop: sp(10) },
  detailIcon: { marginTop: 2 },
  detailTextWrap: { flex: 1, minWidth: 0 },
  detailLabel: { fontSize: fs(11), color: "#5B6472", fontWeight: "700" },
  detailValue: { fontSize: fs(13), color: "#1E1E1E", marginTop: 2 },
  remarkAuthor: { fontSize: fs(10), color: "#5B6472", marginTop: 2 },
  remarkBlockSpaced: { marginTop: sp(8) },

  approverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginTop: sp(6),
  },
  approverAvatar: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    alignItems: "center",
    justifyContent: "center",
  },
  approverAvatarText: { fontSize: fs(12), fontWeight: "800" },
  approverNameWrap: { flex: 1, minWidth: 0 },
  approverName: { fontSize: fs(13), fontWeight: "700", color: "#1E1E1E" },
  approverStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: 999,
  },
  approverStatusText: { fontSize: fs(10), fontWeight: "800" },

  // ── History box ──────────────────────────────────────────────────────
  historyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginTop: sp(2),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  historyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginBottom: sp(12),
  },
  historyHeadIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    backgroundColor: INFO_CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTitle: { flex: 1, fontSize: fs(14), fontWeight: "800", color: COLORS.text },
  historyRow: { flexDirection: "row", gap: sp(10) },
  // The same left rail as the timeline above: a mark, then the line down to
  // the next one.
  historyLeft: { alignItems: "center", width: ms(26) },
  historyMark: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    alignItems: "center",
    justifyContent: "center",
  },
  historyConnector: {
    width: 2,
    flex: 1,
    marginVertical: 2,
    backgroundColor: COLORS.border,
  },
  historyBody: { flex: 1, minWidth: 0, paddingBottom: sp(14) },
  historyAction: { fontSize: fs(13), fontWeight: "700", color: COLORS.text },
  historyMeta: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },
  historyRemarks: {
    fontSize: fs(12),
    color: COLORS.text,
    marginTop: sp(4),
    fontStyle: "italic",
  },
});
