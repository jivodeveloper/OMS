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

import productionService, {
  type ProductionActionLog,
  type ProductionOrder,
} from "@/src/services/production.service";
import { formatInstant } from "@/src/utils/datetime";
import { fs, ms, sp } from "@/src/utils/responsive";
import { messageFrom } from "../hooks/useProductionTracking";
import { buildRail } from "../types";

/**
 * How far one production order has got.
 *
 * Built as the payment progress timeline, card for card: a rail of coloured
 * dots down the left, a tinted card per step, and the same Action / Waiting on
 * / Stage / Timestamp / Remarks rows inside it. The three screens answer the
 * same question about different documents, and a person who has read one
 * should not have to learn another layout to read the next.
 *
 * THE LADDER IS RECONSTRUCTED, not served. PRDO's history endpoint returns the
 * action log alone — unlike BackDate's, which hands over a ready-made stage
 * list — so `buildRail` derives the rungs from the log plus the flow. The
 * consequence is visible and deliberate: a stage nobody has reached yet shows
 * as "Stage 3" rather than by name, because no endpoint tells a viewer what
 * that stage is called and a plausible invented name would be believed.
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

export default function ProductionProgressScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);

  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [logs, setLogs] = useState<ProductionActionLog[] | null>(null);
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
        // Both, together. The ladder needs the flow as well as the log —
        // `total_stage` and the current sequence are what turn a list of
        // decisions into a rail — and fetching them in sequence would show a
        // timeline that briefly ends one step early.
        const [fresh, log] = await Promise.all([
          productionService.getOrder(id),
          productionService.history(id),
        ]);
        setOrder(fresh);
        setLogs(log);
      } catch (err) {
        setError(messageFrom(err, "Could not load this order's progress."));
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

  if (error || !order || !logs) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color={REJECTED_RED} />
        <Text style={styles.emptyText}>{error || "No progress to show."}</Text>
      </View>
    );
  }

  const steps = buildSteps(order, logs);

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
            <Ionicons name="cube-outline" size={ms(20)} color={INFO_BLUE} />
          </View>
          <View style={styles.summaryMain}>
            <Text style={styles.summaryLabel}>Production Order</Text>
            {/* The number alone. The item, quantity and dates all live on the
                Details page, and repeating them here pushed the first timeline
                card off the screen that exists to show it. */}
            <Text
              style={styles.summaryOrderNo}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              #{order.sap_doc_num ?? order.sap_doc_entry}
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
                This order has no approval route configured.
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

const asRemark = (row: ProductionActionLog): Remark => ({
  text: row.remarks,
  by: row.acted_by_name || "SAP sync",
  action: ACTION_LABEL[row.action] ?? row.action,
  at: formatInstant(row.acted_at),
});

const ACTION_LABEL: Record<ProductionActionLog["action"], string> = {
  SYNC: "Synced",
  APPROVE: "Approved",
  REJECT: "Rejected",
  OBSOLETE: "Withdrawn",
};

/**
 * The order's whole journey as timeline cards:
 *
 *     Synced from SAP -> stage 1 -> stage 2 ... -> SAP write-back
 *
 * Steps already acted on are green (or red); the one awaiting a decision is
 * amber; the rest are grey. The final blue card appears ONLY once the
 * write-back has been attempted.
 */
function buildSteps(
  order: ProductionOrder,
  logs: ProductionActionLog[],
): Step[] {
  const steps: Step[] = [];
  const flow = order.flow;

  // ── Synced from SAP ──────────────────────────────────────────────────
  // The equivalent of BackDate's "Created", except nobody in OMS did it. Any
  // later re-syncs fold in here as attributed remarks rather than becoming
  // steps: a refreshed snapshot is not a stage of approval.
  const syncs = logs.filter((row) => row.action === "SYNC");
  const first = syncs[0];
  steps.push({
    key: "synced",
    state: "DONE",
    title: "Planned in SAP",
    badge: "Synced",
    action: order.sap_created_by || "SAP",
    stageLabel: `DocEntry ${order.sap_doc_entry}`,
    timestamp: formatInstant(first?.acted_at ?? order.synced_at),
    remarks: syncs.filter((row) => row.remarks).map(asRemark),
  });

  // ── The approval ladder ──────────────────────────────────────────────
  for (const rung of buildRail(order, logs)) {
    const state: StepState =
      rung.state === "DONE"
        ? "DONE"
        : rung.state === "REJECTED"
          ? "REJECTED"
          : rung.state === "CURRENT"
            ? "CURRENT"
            : "FUTURE";

    steps.push({
      key: `stage-${rung.sequence}`,
      state,
      // Unnamed on purpose when nobody has reached it — see the file header.
      title: rung.name || `Stage ${rung.sequence}`,
      badge: RUNG_BADGE[rung.state],
      action:
        rung.state === "CURRENT"
          ? "Awaiting a decision"
          : rung.state === "FUTURE"
            ? "Not yet reached"
            : rung.log?.acted_by_name || "—",
      people:
        rung.state === "CURRENT" && flow?.current_user_name
          ? [{ name: flow.current_user_name, username: "", state: "PENDING" }]
          : rung.log?.acted_by_name
            ? [
                {
                  name: rung.log.acted_by_name,
                  username: "",
                  state: rung.state === "REJECTED" ? "REJECTED" : "APPROVED",
                },
              ]
            : [],
      stageLabel: `Stage ${rung.sequence}`,
      timestamp: rung.log ? formatInstant(rung.log.acted_at) : "",
      remarks: rung.log && rung.log.remarks ? [asRemark(rung.log)] : [],
    });
  }

  // ── Withdrawn ────────────────────────────────────────────────────────
  // SAP moved the order out of Planned before anyone decided it. Grey, not
  // red: nobody refused anything, the question stopped being asked.
  const retired = logs.find((row) => row.action === "OBSOLETE");
  if (retired) {
    steps.push({
      key: "obsolete",
      state: "FUTURE",
      title: "No longer planned",
      badge: "Withdrawn",
      action: "SAP moved this order out of Planned",
      timestamp: formatInstant(retired.acted_at),
      remarks: retired.remarks ? [asRemark(retired)] : [],
    });
  }

  // ── The write-back ───────────────────────────────────────────────────
  if (flow?.sap_status) {
    const ok = flow.sap_status === "SUCCESS";
    steps.push({
      key: "sap",
      state: ok ? "DONE" : "REJECTED",
      title: "SAP",
      badge: ok ? "Synced" : "Failed",
      action: ok
        ? "The decision was written back"
        : "The write-back failed — SAP is still holding the order",
      info: [{ label: "SAP Response", value: flow.sap_status_text || "—" }],
    });
  }

  return steps;
}

const RUNG_BADGE: Record<string, string> = {
  DONE: "Approved",
  REJECTED: "Rejected",
  CURRENT: "Pending",
  FUTURE: "Upcoming",
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
