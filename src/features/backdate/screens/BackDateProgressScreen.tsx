import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import backdateService, {
  type BackDateActionRow,
  type BackDateHistory,
  type BackDateRequest,
} from "@/src/services/backdate.service";
import { formatInstant } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import { messageFrom } from "../hooks/useBackDateMasters";

/**
 * How far one request has got.
 *
 * Built as the payment progress timeline, card for card: a rail of coloured
 * dots down the left, a tinted card per step, and the same Action / Waiting on
 * / Stage / Timestamp / Remarks rows inside it. The two screens answer the
 * same question about different documents, and a person who has read one
 * should not have to learn a second layout to read the other.
 *
 * Remarks live on the step they explain, never collapsed into one field: the
 * reason for raising a request, for an edit, and for each decision are
 * separate statements by separate people.
 */

// The payments palette, shared verbatim so a green step is the same green on
// both screens.
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

type StepState = "DONE" | "REJECTED" | "CURRENT" | "FUTURE" | "INFO";

const TONE: Record<
  StepState,
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

interface Remark {
  text: string;
  by: string;
  action: string;
  at: string;
}

interface Person {
  name: string;
  username: string;
  state: "APPROVED" | "REJECTED" | "PENDING";
}

interface Step {
  key: string;
  state: StepState;
  title: string;
  badge: string;
  action?: string;
  people?: Person[];
  stageLabel?: string;
  timestamp?: string;
  remarks?: Remark[];
  info?: { label: string; value: string }[];
}

export default function BackDateProgressScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);

  const [request, setRequest] = useState<BackDateRequest | null>(null);
  const [history, setHistory] = useState<BackDateHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        // Both, together: the timeline comes from the history and the final
        // SAP card from the flow, and fetching them in sequence would show a
        // timeline that briefly ends one step early.
        const [fresh, log] = await Promise.all([
          backdateService.getRequest(id),
          backdateService.history(id),
        ]);
        setRequest(fresh);
        setHistory(log);
      } catch (err) {
        setError(messageFrom(err, "Could not load this request's progress."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={INFO_BLUE} />
      </View>
    );
  }

  if (error || !history) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color={REJECTED_RED} />
        <Text style={styles.emptyText}>{error || "No progress to show."}</Text>
      </View>
    );
  }

  const steps = buildSteps(history, request);

  const renderStep = ({ item, index }: { item: Step; index: number }) => {
    const tone = TONE[item.state];
    const isLast = index === steps.length - 1;
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
            <Ionicons name={circleIcon} size={15} color="#fff" />
          </View>
          {!isLast ? (
            <View style={[styles.connector, { backgroundColor: tone.line }]} />
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: tone.card, borderColor: tone.border },
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons
              name={headerIcon}
              size={22}
              color={tone.accent}
              style={styles.headerIcon}
            />
            <Text style={styles.statusText}>{item.title}</Text>
            <View
              style={[styles.stageBadge, { backgroundColor: tone.accent + "1A" }]}
            >
              <Text style={[styles.stageBadgeText, { color: tone.accent }]}>
                {item.badge}
              </Text>
            </View>
          </View>

          {!!item.action && (
            <DetailRow
              icon="sparkles-outline"
              label="Action"
              value={item.action}
            />
          )}

          {item.people?.length ? (
            <View style={styles.detailRow}>
              <Ionicons
                name="people-outline"
                size={ms(18)}
                color="#1E1E1E"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextWrap}>
                {/* "Waiting on" is what the reader actually wants while a step
                    is unfinished — it names who to go and ask. */}
                <Text style={styles.detailLabel}>
                  {item.state === "CURRENT" || item.state === "FUTURE"
                    ? "Waiting on"
                    : "Reviewer"}
                </Text>
                {item.people.map((person, i) => {
                  const personTone =
                    person.state === "APPROVED"
                      ? DONE_GREEN
                      : person.state === "REJECTED"
                        ? REJECTED_RED
                        : PENDING_ORANGE;
                  const personIcon =
                    person.state === "APPROVED"
                      ? "checkmark-circle"
                      : person.state === "REJECTED"
                        ? "close-circle"
                        : "time-outline";
                  return (
                    <View key={`${person.name}-${i}`} style={styles.approverRow}>
                      <View
                        style={[
                          styles.approverAvatar,
                          { backgroundColor: personTone + "1A" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.approverAvatarText,
                            { color: personTone },
                          ]}
                        >
                          {String(person.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.approverNameWrap}>
                        <Text style={styles.approverName} numberOfLines={1}>
                          {person.name}
                        </Text>
                        {!!person.username && (
                          <Text
                            style={styles.approverUsername}
                            numberOfLines={1}
                          >
                            @{person.username}
                          </Text>
                        )}
                      </View>
                      <View
                        style={[
                          styles.approverStatusChip,
                          { backgroundColor: personTone + "1A" },
                        ]}
                      >
                        <Ionicons
                          name={personIcon}
                          size={ms(11)}
                          color={personTone}
                        />
                        <Text
                          style={[
                            styles.approverStatusText,
                            { color: personTone },
                          ]}
                        >
                          {person.state === "APPROVED"
                            ? "Approved"
                            : person.state === "REJECTED"
                              ? "Rejected"
                              : "Pending"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!!item.stageLabel && (
            <DetailRow
              icon="git-network-outline"
              label="Stage"
              value={item.stageLabel}
            />
          )}
          {!!item.timestamp && (
            <DetailRow
              icon="time-outline"
              label="Timestamp"
              value={item.timestamp}
            />
          )}
          {!!item.remarks?.length && (
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
                    {/* Who wrote it, and while doing what — the question a
                        single unattributed line could never answer. */}
                    <Text style={styles.remarkAuthor}>
                      {remark.by}
                      {remark.action ? ` · ${remark.action}` : ""}
                      {remark.at && remark.at !== "—" ? ` · ${remark.at}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

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
            <Ionicons name="time-outline" size={ms(20)} color={INFO_BLUE} />
          </View>
          <View style={styles.summaryMain}>
            <Text style={styles.summaryLabel}>Request ID</Text>
            {/* The number alone. The SAP user, window and expiry all live on
                the Details page, and repeating them here pushed the first
                timeline card off the screen that exists to show it. */}
            <Text
              style={styles.summaryOrderNo}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              #{id}
            </Text>
          </View>
        </View>

        <FlatList
          data={steps}
          keyExtractor={(item) => item.key}
          renderItem={renderStep}
          contentContainerStyle={[
            styles.listContent,
            steps.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={[DONE_GREEN]}
              tintColor={DONE_GREEN}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                This request has no approval route configured.
              </Text>
            </View>
          }
        />
      </View>
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
      <Ionicons
        name={icon}
        size={18}
        color="#1E1E1E"
        style={styles.detailIcon}
      />
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const asRemark = (row: BackDateActionRow): Remark => ({
  text: row.remarks,
  by: row.acted_by_username || "—",
  action: row.action_label,
  at: formatInstant(row.acted_at),
});

/**
 * The request's whole journey as timeline cards:
 *
 *     Created -> stage 1 -> stage 2 ... -> SAP
 *
 * Steps already acted on are green (or red); the one awaiting a decision is
 * amber; the rest are grey. The SAP card is blue and appears ONLY once SAP has
 * been called — a "pending" SAP card on a request nobody has approved would
 * say something is in flight when nothing has been sent.
 */
function buildSteps(
  history: BackDateHistory,
  request: BackDateRequest | null,
): Step[] {
  const steps: Step[] = [];
  const actions = history.actions ?? [];

  // ── Created ──────────────────────────────────────────────────────────
  // Edits fold in here rather than becoming steps of their own: an edit is
  // not a stage of approval, it is a correction to what was asked for, and
  // each one is attributed where it belongs.
  const created = actions.find((row) => row.action === "CREATE");
  const edits = actions.filter((row) => row.action === "UPDATE");
  if (created || edits.length) {
    steps.push({
      key: "created",
      state: "DONE",
      title: "Created",
      badge: "Done",
      action: created?.acted_by_username || "—",
      stageLabel: "BackDate — Create",
      timestamp: formatInstant(created?.acted_at ?? null),
      remarks: [
        ...(created && created.remarks ? [asRemark(created)] : []),
        ...edits.map(asRemark),
      ],
    });
  }

  // ── The approval stages ──────────────────────────────────────────────
  for (const stage of history.stages ?? []) {
    const state: StepState =
      stage.status === "APPROVED"
        ? "DONE"
        : stage.status === "REJECTED"
          ? "REJECTED"
          : stage.status === "AWAITING"
            ? "CURRENT"
            : "FUTURE";

    // The decision taken AT this stage, which is what carries its remark.
    const decision = actions.find(
      (row) =>
        (row.action === "APPROVE" || row.action === "REJECT") &&
        row.stage === stage.stage_id,
    );

    steps.push({
      key: `stage-${stage.stage_id}`,
      state,
      title: stage.stage_name || `Stage ${stage.sequence}`,
      badge: STAGE_BADGE[stage.status],
      action:
        stage.status === "AWAITING"
          ? "Awaiting a decision"
          : stage.status === "UPCOMING"
            ? "Not yet reached"
            : stage.status === "SKIPPED"
              ? "Never reached"
              : stage.acted_by || stage.reviewer,
      people: [
        {
          name: stage.reviewer || stage.configured_reviewer || "Not assigned",
          // Shown only when a stand-in is acting, which is the one case where
          // "who is configured" and "who must act" are different people.
          username: stage.has_active_replacement
            ? stage.configured_reviewer
            : "",
          state:
            stage.status === "APPROVED"
              ? "APPROVED"
              : stage.status === "REJECTED"
                ? "REJECTED"
                : "PENDING",
        },
      ],
      stageLabel: `Stage ${stage.sequence}`,
      timestamp: stage.acted_at ? formatInstant(stage.acted_at) : "",
      remarks: decision && decision.remarks ? [asRemark(decision)] : [],
    });
  }

  // ── SAP ──────────────────────────────────────────────────────────────
  const flow = request?.flow;
  if (flow?.hana_status) {
    const ok = flow.hana_status === "SUCCESS";
    steps.push({
      key: "sap",
      state: ok ? "DONE" : "REJECTED",
      title: "SAP",
      badge: ok ? "Posted" : "Refused",
      action: ok
        ? "The rights were written to SAP"
        : "SAP refused the rights",
      // SAP's own words, unedited and unabridged — the stored query is not
      // shown, because what a person needs is what SAP said.
      info: [{ label: "SAP Response", value: flow.hana_status_text || "—" }],
    });
  }

  return steps;
}

const STAGE_BADGE: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  AWAITING: "Pending",
  UPCOMING: "Upcoming",
  SKIPPED: "Skipped",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7FB" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  listContent: { paddingBottom: 28 },

  timelineRow: { flexDirection: "row", marginBottom: 18 },
  leftColumn: { width: 44, alignItems: "center" },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  connector: {
    width: 3,
    flex: 1,
    minHeight: 132,
    borderRadius: 999,
    marginTop: 4,
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: sp(18),
    paddingHorizontal: sp(14),
    paddingVertical: sp(14),
    borderWidth: 1,
    shadowColor: "#A7B0C0",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  headerIcon: { marginRight: 8 },
  statusText: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(16),
    fontWeight: "800",
    color: "#1F2937",
  },
  stageBadge: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(4),
    borderRadius: 20,
    marginLeft: sp(8),
    flexShrink: 0,
  },
  stageBadgeText: { fontSize: fs(11), fontWeight: "800" },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: sp(16),
    borderWidth: 1,
    borderColor: "#EEF1F6",
    paddingHorizontal: sp(14),
    paddingVertical: sp(14),
    marginBottom: sp(12),
    gap: sp(12),
    shadowColor: "#A7B0C0",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  summaryIconWrap: {
    width: ms(44),
    height: ms(44),
    borderRadius: sp(12),
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryLabel: {
    fontSize: fs(11),
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryOrderNo: {
    fontSize: fs(16),
    fontWeight: "800",
    color: INFO_BLUE,
    marginTop: 2,
  },

  detailRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  detailIcon: { marginRight: 10, marginTop: 1 },
  detailTextWrap: { flex: 1 },
  detailLabel: {
    fontSize: fs(12),
    fontWeight: "700",
    color: "#111827",
    marginBottom: 1,
  },
  detailValue: { fontSize: fs(13), lineHeight: fs(18), color: "#4B5563" },
  // Attribution sits under its note, lighter and smaller, so a card with
  // several remarks still reads as note-then-author rather than a flat list.
  remarkAuthor: {
    fontSize: fs(11),
    lineHeight: fs(15),
    color: "#6B7280",
    fontWeight: "600",
    marginTop: 1,
  },
  remarkBlockSpaced: { marginTop: sp(8) },

  approverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(8),
    marginTop: sp(6),
  },
  approverAvatar: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    alignItems: "center",
    justifyContent: "center",
    // Or a long name squashes the circle into an ellipse on a narrow screen.
    flexShrink: 0,
  },
  approverAvatarText: { fontSize: fs(11), fontWeight: "800" },
  approverNameWrap: { flex: 1, minWidth: 0 },
  approverName: { fontSize: fs(13), fontWeight: "700", color: "#1F2937" },
  approverUsername: { fontSize: fs(11), color: "#6B7280" },
  approverStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: 20,
    flexShrink: 0,
  },
  approverStatusText: { fontSize: fs(10), fontWeight: "800" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
