import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { fs, ms, sp } from "@/src/utils/responsive";
import type {
  CreditLimitActionRow,
  CreditLimitRequest,
  CreditLimitStageProgress,
} from "@/src/services/creditLimit.service";

import { formatAmount, formatDateTime } from "../logic";
import { useCreditLimitHistory, useCreditLimitRequest } from "../useCreditLimit";

/**
 * Where one credit-limit request has got to.
 *
 * THE ADVANCE PAYMENT PROGRESS TIMELINE, same vocabulary, same colours and the
 * same metrics: a summary card with the request number, then one card per stage
 * down a connected line — green for done, orange for the stage it is sitting
 * at, grey for what is still ahead, red for a refusal, and a blue SAP card at
 * the end — with the full history under it on the same rail.
 *
 * Copied rather than imported, as `AdvanceProgressScreen` itself copies the
 * payment timeline: the data behind it is a different shape (`stages` and
 * `actions` from `requests/<id>/history/`, not logs on the request), and
 * sharing the component would mean bending one module's rows around the other.
 * The STATES are the server's own word, so this screen invents no history.
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

/** "1st Level", "2nd Level", … — the same wording as the other timelines. */
const ordinalLevel = (position: number) => {
  const ten = position % 10;
  const hundred = position % 100;
  if (ten === 1 && hundred !== 11) return `${position}st Level`;
  if (ten === 2 && hundred !== 12) return `${position}nd Level`;
  if (ten === 3 && hundred !== 13) return `${position}rd Level`;
  return `${position}th Level`;
};

/** One rendered card: an approval stage, or the trailing SAP card. */
interface Stage {
  key: string;
  title: string;
  badge: string;
  state: StageState;
  /**
   * Who the stage is with, and how it went for them.
   *
   * A stage nobody has reached names its REVIEWER; a decided one names who
   * actually decided, which can differ when a replacement acted.
   */
  approver?: { name: string; state: "APPROVED" | "REJECTED" | "PENDING" };
  stageLabel?: string;
  timestamp?: string;
  remarks?: { by: string; text: string; at?: string }[];
  /** SAP card only. */
  info?: { label: string; value: string }[];
}

export default function CreditLimitProgressScreen() {
  useBackToOrigin("/(main)/credit-limit/tracking");

  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);

  const { request, loading, error, reload } = useCreditLimitRequest(requestId);
  const history = useCreditLimitHistory(requestId);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * RE-READ ON ARRIVAL. A decision taken on the details screen changes this
   * timeline, so returning here re-reads it — quietly, because the request is
   * the same one and blanking a timeline to fetch the same thing reads as a
   * fault.
   */
  useRefreshOnFocus(() => {
    void reload(true);
    void history.reload();
  });

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

  const stages = buildStages(request, history.stages);

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
          {!isLast ? <View style={[styles.connector, { backgroundColor: tone.line }]} /> : null}
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
              <Text style={[styles.stageBadgeText, { color: tone.accent }]}>{item.badge}</Text>
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
                  {item.state === "CURRENT" || item.state === "FUTURE"
                    ? "Waiting on"
                    : "Decided by"}
                </Text>
                {(() => {
                  const personTone =
                    item.approver.state === "APPROVED"
                      ? DONE_GREEN
                      : item.approver.state === "REJECTED"
                        ? REJECTED_RED
                        : PENDING_ORANGE;
                  const personIcon =
                    item.approver.state === "APPROVED"
                      ? "checkmark-circle"
                      : item.approver.state === "REJECTED"
                        ? "close-circle"
                        : "time-outline";
                  return (
                    <View style={styles.approverRow}>
                      <View style={[styles.approverAvatar, { backgroundColor: personTone + "1A" }]}>
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
                        style={[styles.approverStatusChip, { backgroundColor: personTone + "1A" }]}
                      >
                        <Ionicons name={personIcon} size={ms(11)} color={personTone} />
                        <Text style={[styles.approverStatusText, { color: personTone }]}>
                          {item.approver?.state === "APPROVED"
                            ? "Approved"
                            : item.approver?.state === "REJECTED"
                              ? "Rejected"
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
                      {remark.at && remark.at !== "—" ? ` · ${remark.at}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {item.info?.map((row) => (
            <DetailRow key={row.label} icon="ellipse-outline" label={row.label} value={row.value} />
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
            <Ionicons name="card-outline" size={ms(20)} color={INFO_BLUE} />
          </View>
          <View style={styles.summaryMain}>
            <Text style={styles.summaryLabel}>Credit Limit</Text>
            <Text style={styles.summaryOrderNo} numberOfLines={1} adjustsFontSizeToFit>
              #{request.id} · {formatAmount(request.new_credit_limit)}
            </Text>
          </View>
        </View>

        <FlatList
          data={stages}
          keyExtractor={(item) => item.key}
          renderItem={renderStage}
          contentContainerStyle={[styles.listContent, stages.length === 0 && { flexGrow: 1 }]}
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
              colors={[DONE_GREEN]}
              tintColor={DONE_GREEN}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {history.error || "This request has no approval route yet."}
              </Text>
            </View>
          }
          // THE WHOLE HISTORY, and only here. Every action the server recorded,
          // oldest first, under the timeline: the timeline says where the
          // request is, this says everything that has happened to it. The
          // details page deliberately carries neither.
          ListFooterComponent={<HistoryBox actions={history.actions} />}
        />
      </View>
    </View>
  );
}

/**
 * What each action looks like on the history line.
 *
 * ONE MARK PER ACTION, as the server names them: a submission flies, an
 * approval ticks, a refusal crosses. A single dot for all of them made the list
 * unreadable at a glance, which is the only thing a history is for.
 */
const HISTORY_MARK: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: string }> = {
  CREATED: { icon: "add-circle", tone: INFO_BLUE },
  SUBMITTED: { icon: "paper-plane", tone: INFO_BLUE },
  APPROVED: { icon: "checkmark-circle", tone: DONE_GREEN },
  COMPLETED: { icon: "checkmark-done-circle", tone: DONE_GREEN },
  REJECTED: { icon: "close-circle", tone: REJECTED_RED },
  SAP_UPDATED: { icon: "server", tone: DONE_GREEN },
  SAP_FAILED: { icon: "alert-circle", tone: REJECTED_RED },
};

const MARK_FALLBACK = { icon: "ellipse" as const, tone: FUTURE_GREY };

/** Everything that has happened to this request, on a line of its own. */
function HistoryBox({ actions }: { actions: CreditLimitActionRow[] }) {
  const [open, setOpen] = useState(true);
  if (actions.length === 0) return null;

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
        <Text style={styles.historyTitle}>History ({actions.length})</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={COLORS.textSecondary}
        />
      </TouchableOpacity>

      {open
        ? actions.map((action, index) => {
            const mark = HISTORY_MARK[action.action?.toUpperCase() ?? ""] ?? MARK_FALLBACK;
            const isLast = index === actions.length - 1;
            return (
              <View key={`${action.id ?? index}`} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View style={[styles.historyMark, { backgroundColor: mark.tone + "1A" }]}>
                    <Ionicons name={mark.icon} size={ms(13)} color={mark.tone} />
                  </View>
                  {!isLast ? <View style={styles.historyConnector} /> : null}
                </View>

                <View style={styles.historyBody}>
                  <Text style={styles.historyAction}>{action.action}</Text>
                  <Text style={styles.historyMeta}>
                    {action.acted_by_username || "System"}
                    {action.stage_name ? ` · ${action.stage_name}` : ""}
                    {` · ${formatDateTime(action.acted_at)}`}
                  </Text>
                  {action.remarks ? (
                    <Text style={styles.historyRemarks}>{action.remarks}</Text>
                  ) : null}
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
 * The server's stages, as cards.
 *
 * THE STATE IS THE SERVER'S WORD, not a guess from the status: `stages[].status`
 * already says what happened at each one (AWAITING, UPCOMING, APPROVED,
 * REJECTED, SKIPPED), which is the only thing that can describe a route where a
 * stage was passed over.
 */
function buildStages(
  request: CreditLimitRequest,
  rows: CreditLimitStageProgress[],
): Stage[] {
  const stages: Stage[] = rows.map((row) => {
    const state: StageState =
      row.status === "APPROVED"
        ? "DONE"
        : row.status === "REJECTED"
          ? "REJECTED"
          : row.status === "AWAITING"
            ? "CURRENT"
            : "FUTURE";

    return {
      key: `stage-${row.stage_id}`,
      title:
        row.status === "APPROVED"
          ? "Approved"
          : row.status === "REJECTED"
            ? "Rejected"
            : row.status === "AWAITING"
              ? "Waiting for approval"
              : row.status === "SKIPPED"
                ? "Skipped"
                : "Upcoming",
      badge: ordinalLevel(row.sequence),
      state,
      approver: {
        name: row.acted_by || row.reviewer || "—",
        state:
          row.status === "APPROVED"
            ? "APPROVED"
            : row.status === "REJECTED"
              ? "REJECTED"
              : "PENDING",
      },
      stageLabel: row.stage_name,
      timestamp: row.acted_at ? formatDateTime(row.acted_at) : undefined,
      remarks: row.remarks
        ? [
            {
              by: row.acted_by || row.reviewer || "—",
              text: row.remarks,
              at: row.acted_at ? formatDateTime(row.acted_at) : undefined,
            },
          ]
        : undefined,
    };
  });

  // SAP last, once the final approval has written the new limit.
  const sap = request.flow?.sap_response;
  if (sap) {
    const failed = request.flow?.status !== "APPROVED";
    stages.push({
      key: "sap",
      title: failed ? "SAP Write Failed" : "Written to SAP",
      badge: "SAP",
      state: failed ? "REJECTED" : "INFO",
      timestamp: request.flow?.updated_at ? formatDateTime(request.flow.updated_at) : undefined,
      info: [
        { label: "New limit", value: formatAmount(request.new_credit_limit) },
        { label: "SAP said", value: sap },
      ],
    });
  }

  return stages;
}

/** Copied from `AdvanceProgressScreen.styles` — one timeline, three modules. */
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
  emptyText: { fontSize: fs(14), color: COLORS.textSecondary, textAlign: "center" },

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
  stageBadge: { paddingHorizontal: sp(9), paddingVertical: sp(4), borderRadius: 999 },
  stageBadgeText: { fontSize: fs(10), fontWeight: "800" },

  detailRow: { flexDirection: "row", gap: sp(8), marginTop: sp(10) },
  detailIcon: { marginTop: 2 },
  detailTextWrap: { flex: 1, minWidth: 0 },
  detailLabel: { fontSize: fs(11), color: "#5B6472", fontWeight: "700" },
  detailValue: { fontSize: fs(13), color: "#1E1E1E", marginTop: 2 },
  remarkAuthor: { fontSize: fs(10), color: "#5B6472", marginTop: 2 },
  remarkBlockSpaced: { marginTop: sp(8) },

  approverRow: { flexDirection: "row", alignItems: "center", gap: sp(8), marginTop: sp(6) },
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
  historyLeft: { alignItems: "center", width: ms(26) },
  historyMark: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    alignItems: "center",
    justifyContent: "center",
  },
  historyConnector: { width: 2, flex: 1, marginVertical: 2, backgroundColor: COLORS.border },
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
