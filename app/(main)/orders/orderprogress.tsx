import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { orderService } from "@/src/services/order.service";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";

interface OrderLog {
  id: number;
  status_name: string;
  remarks: string;
  performed_by_name: string | null;
  created_at: string;
  stage_name?: string | null;
}

interface ProgressLog extends OrderLog {
  stage_key: string;
  display_status_name: string;
  action_name: string | null;
  round_number: number;
  // All raw logs grouped into this entry (e.g. each rate approver's action in the round)
  members: OrderLog[];
}

interface RateApprovalEntry {
  approver_name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

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

const getOrdinalStageLabel = (position: number) => {
  const stageNumber = position + 1;
  const remainderTen = stageNumber % 10;
  const remainderHundred = stageNumber % 100;

  if (remainderTen === 1 && remainderHundred !== 11) {
    return `${stageNumber}st Level`;
  }
  if (remainderTen === 2 && remainderHundred !== 12) {
    return `${stageNumber}nd Level`;
  }
  if (remainderTen === 3 && remainderHundred !== 13) {
    return `${stageNumber}rd Level`;
  }
  return `${stageNumber}th Level`;
};

const normalizeText = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

const isRejectedStatus = (statusName: string) =>
  normalizeText(statusName).includes("reject");

const isCompletedStatus = (statusName: string) =>
  normalizeText(statusName) === "completed";

const isApprovalAction = (statusName: string) => {
  const normalizedStatus = normalizeText(statusName);
  return normalizedStatus === "approved" || normalizedStatus === "accepted";
};

const getStageKey = (log: OrderLog, previousStageKey?: string | null) => {
  const normalizedStageName = normalizeText(log.stage_name);
  const normalizedStatus = normalizeText(log.status_name);

  if (normalizedStageName.includes("rate")) {
    return "rate_approval";
  }

  if (normalizedStageName.includes("billing")) {
    return "billing";
  }

  if (normalizedStageName.includes("auditor")) {
    return "auditor_approval";
  }

  if (normalizedStageName === "completed") {
    return "completed";
  }

  if (normalizedStatus.includes("rate")) {
    return "rate_approval";
  }

  if (normalizedStatus.includes("billing") || normalizedStatus === "accepted by billing") {
    return "billing";
  }

  if (normalizedStatus.includes("auditor")) {
    return "auditor_approval";
  }

  if (isApprovalAction(normalizedStatus) && previousStageKey) {
    return previousStageKey;
  }

  if (isRejectedStatus(normalizedStatus)) {
    return previousStageKey || "rejected";
  }

  if (isCompletedStatus(normalizedStatus)) {
    return "completed";
  }

  return normalizedStatus;
};

const getDisplayStatusName = (stageKey: string, fallbackName: string) => {
  if (stageKey === "rate_approval") {
    return "Rate Approval";
  }

  if (stageKey === "billing") {
    return "Billing";
  }

  if (stageKey === "auditor_approval") {
    return "Auditor Approval";
  }

  if (stageKey === "completed") {
    return "Completed";
  }

  return fallbackName;
};

const buildProgressLogs = (logs: OrderLog[]): ProgressLog[] => {
  const groupedLogs: ProgressLog[] = [];
  let currentRound = 1;
  let previousWasRejected = false;

  logs.forEach((log) => {
    const previousLog = groupedLogs.length > 0 ? groupedLogs[groupedLogs.length - 1] : null;
    const previousStageKey = previousLog?.stage_key || null;
    const normalizedRawStatus = normalizeText(log.status_name);
    const isRejected = isRejectedStatus(normalizedRawStatus);

    if (previousWasRejected && !isRejected) {
      currentRound += 1;
    }

    const stageKey = getStageKey(log, previousStageKey);
    const displayStatusName = getDisplayStatusName(stageKey, log.status_name);
    const actionName =
      (stageKey === "rate_approval" && normalizedRawStatus !== "rate approval")
        || (stageKey === "billing" && normalizedRawStatus !== "billing")
        || (stageKey === "auditor_approval" && normalizedRawStatus !== "auditor approval")
        ? log.status_name
        : null;

    const progressLog: ProgressLog = {
      ...log,
      stage_key: stageKey,
      display_status_name: displayStatusName,
      action_name: actionName,
      round_number: currentRound,
      members: [log],
    };

    if (
      previousLog
      && previousLog.stage_key === stageKey
      && previousLog.round_number === currentRound
    ) {
      // Keep the latest log as the representative entry, but retain every member
      // log of this group so all actors (e.g. each rate approver) can be shown.
      progressLog.members = [...previousLog.members, log];
      groupedLogs[groupedLogs.length - 1] = progressLog;
    } else {
      groupedLogs.push(progressLog);
    }

    previousWasRejected = isRejected;
  });

  return groupedLogs;
};

export default function OrderProgressScreen() {
  const navigation = useNavigation();
  const { orderId, from } = useLocalSearchParams<{ orderId?: string; from?: string }>();
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [rateApprovals, setRateApprovals] = useState<RateApprovalEntry[]>([]);
  const [orderStatus, setOrderStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!orderId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      const [logsResponse, detailResponse] = await Promise.all([
        orderService.getOrderLogs(Number(orderId)),
        orderService.getOrderDetails(Number(orderId)),
      ]);
      setLogs(Array.isArray(logsResponse) ? logsResponse : []);
      const detail = detailResponse?.data || detailResponse;
      // The stage the order currently sits in is still pending — even if a log
      // for it already has a performer (e.g. billing forwarding to auditor).
      setOrderStatus(
        normalizeText(detail?.status_display || detail?.status_name || detail?.status),
      );
      const approvals: any[] = Array.isArray(detail?.rate_approvals)
        ? detail.rate_approvals
        : [];
      setRateApprovals(
        approvals.map((a: any) => ({
          approver_name: String(a.approver_name || ""),
          status: a.status as "PENDING" | "APPROVED" | "REJECTED",
        }))
      );
    } catch (error) {
      console.log("Error loading order logs:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  useAndroidBackOverride(
    useCallback(() => {
      if (!from || typeof from !== "string") {
        return false;
      }

      navigation.navigate(from as never);
      return true;
    }, [from, navigation]),
  );

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return value;
    }
  };

  const getReviewerText = (item: OrderLog) => {
    if (item.performed_by_name) {
      return String(item.performed_by_name).trim();
    }
    return "Awaiting action";
  };

  const getRemarksText = (item: OrderLog) => {
    return String(item.remarks || "").trim() || "No remarks";
  };

  const isRejectedLog = (item: ProgressLog) => {
    const combinedText = [
      item.status_name,
      item.stage_name,
      item.display_status_name,
      item.action_name,
      item.remarks,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return combinedText.includes("reject");
  };

  const progressLogs = buildProgressLogs(logs).filter((log) => log.stage_key !== "completed");

  // Only the most recent Rate Approval entry reflects current approver decisions
  const lastRateApprovalLogId = [...progressLogs]
    .reverse()
    .find((l) => l.stage_key === "rate_approval")?.id ?? null;

  const renderItem = ({ item, index }: { item: ProgressLog; index: number }) => {
    // True only for the latest rate_approval entry (not historical rejected rounds)
    const isCurrentRateApprovalEntry =
      item.stage_key === "rate_approval" && item.id === lastRateApprovalLogId;

    // The stage the order is currently sitting in is still pending, even if its
    // log already carries a performer (e.g. billing forwarded the order to the
    // auditor — that does NOT mean the auditor approved it).
    const isCurrentStage =
      !!orderStatus && normalizeText(item.display_status_name) === orderStatus;

    // For the current rate approval entry, only mark done when ALL approvers approved
    const isDone = isCurrentRateApprovalEntry && rateApprovals.length > 0
      ? rateApprovals.every((a) => a.status === "APPROVED")
      : isCurrentStage
        ? false
        : Boolean(item.performed_by_name);

    // Each rate approver's decision captured in this round, derived from the round's
    // logs so the card stays frozen after the order is edited. Only real decision
    // logs (Approved/Rejected) are considered — the "Rate Approval" stage entry is
    // skipped — and each approver is de-duplicated (latest decision wins).
    const rateApproverActions: RateApprovalEntry[] = (() => {
      const byApprover = new Map<string, RateApprovalEntry>();
      item.members.forEach((member) => {
        const approverName = String(member.performed_by_name || "").trim();
        if (!approverName) return;
        const normalizedStatus = normalizeText(member.status_name);
        let decision: "APPROVED" | "REJECTED" | null = null;
        if (normalizedStatus.includes("reject")) {
          decision = "REJECTED";
        } else if (isApprovalAction(normalizedStatus)) {
          decision = "APPROVED";
        }
        if (!decision) return;
        byApprover.set(approverName, { approver_name: approverName, status: decision });
      });
      return Array.from(byApprover.values());
    })();

    // Approvers shown on a rate-approval card: the live snapshot for the active
    // round (includes approvers who haven't acted yet), otherwise the actions
    // actually taken by each approver in this (historical) round.
    const rateApproverList: RateApprovalEntry[] =
      isCurrentRateApprovalEntry && rateApprovals.length > 0
        ? rateApprovals
        : rateApproverActions;

    const isRejected = isRejectedLog(item);
    const accent = isRejected ? REJECTED_RED : isDone ? DONE_GREEN : PENDING_ORANGE;
    const connectorColor = isRejected ? REJECTED_LINE : isDone ? DONE_LINE : PENDING_LINE;
    const cardColor = isRejected ? REJECTED_CARD : isDone ? DONE_CARD : PENDING_CARD;
    const borderColor = isRejected ? REJECTED_BORDER : isDone ? DONE_BORDER : PENDING_BORDER;
    const timelineIconName = isRejected ? "close" : isDone ? "checkmark" : "time-outline";
    const headerIconName = isRejected
      ? "close-circle"
      : isDone
        ? "checkmark-done-circle"
        : "time-outline";

    return (
      <View style={styles.timelineRow}>
        <View style={styles.leftColumn}>
          <View style={[styles.iconCircle, { backgroundColor: accent }]}>
            <Ionicons
              name={timelineIconName}
              size={15}
              color="#fff"
            />
          </View>
          {index !== progressLogs.length - 1 ? (
            <View style={[styles.connector, { backgroundColor: connectorColor }]} />
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: cardColor,
              borderColor,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons
              name={headerIconName}
              size={22}
              color={accent}
              style={styles.headerIcon}
            />
            <Text style={styles.statusText}>{item.display_status_name}</Text>
          </View>

          {!!item.action_name && (
            <View style={styles.detailRow}>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color="#1E1E1E"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>Action</Text>
                <Text style={styles.detailValue}>{item.action_name}</Text>
              </View>
            </View>
          )}

          {item.stage_key === "rate_approval" && rateApproverList.length > 0 ? (
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={18} color="#1E1E1E" style={styles.detailIcon} />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>Approvers</Text>
                {rateApproverList.map((a, i) => (
                  <View key={i} style={styles.approverRow}>
                    <Text style={styles.detailValue}>{a.approver_name}</Text>
                    <Text
                      style={[
                        styles.approverStatusText,
                        a.status === "APPROVED" && { color: DONE_GREEN },
                        a.status === "REJECTED" && { color: REJECTED_RED },
                        a.status === "PENDING" && { color: PENDING_ORANGE },
                      ]}
                    >
                      {a.status === "PENDING"
                        ? "Pending"
                        : a.status === "APPROVED"
                        ? "Approved"
                        : "Rejected"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={18} color="#1E1E1E" style={styles.detailIcon} />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>Reviewer</Text>
                <Text style={styles.detailValue}>
                  {isCurrentStage && !isDone ? "Awaiting action" : getReviewerText(item)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="git-network-outline" size={18} color="#1E1E1E" style={styles.detailIcon} />
            <View style={styles.detailTextWrap}>
              <Text style={styles.detailLabel}>Stage</Text>
              <Text style={styles.detailValue}>{getOrdinalStageLabel(index)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color="#1E1E1E" style={styles.detailIcon} />
            <View style={styles.detailTextWrap}>
              <Text style={styles.detailLabel}>Timestamp</Text>
              <Text style={styles.detailValue}>{formatDate(item.created_at)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={18} color="#1E1E1E" style={styles.detailIcon} />
            <View style={styles.detailTextWrap}>
              <Text style={styles.detailLabel}>Remarks</Text>
              <Text style={styles.detailValue}>{getRemarksText(item)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DONE_GREEN} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* <View style={styles.hero}>
        <Text style={styles.heroTitle}>Order Status Timeline</Text>
      </View> */}

      <View style={styles.content}>
        <View style={styles.subtitleCard}>
          <View style={styles.subtitleIconWrap}>
            <Ionicons name="git-branch-outline" size={15} color="#2563EB" />
          </View>
          <Text style={styles.subtitle}>Track your order through approval stages</Text>
        </View>

        <FlatList
          data={progressLogs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          alwaysBounceVertical
          contentContainerStyle={[styles.listContent, progressLogs.length === 0 && { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[DONE_GREEN]}
              tintColor={DONE_GREEN}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                No progress found for this order.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#23262F",
  },
  subtitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
    fontWeight: "600",
  },
  subtitleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  subtitleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 28,
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  leftColumn: {
    width: 44,
    alignItems: "center",
  },
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
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    shadowColor: "#A7B0C0",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headerIcon: {
    marginRight: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#1F2937",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
  },
  detailIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  detailTextWrap: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 1,
  },
  detailValue: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  approverRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 3,
  },
  approverStatusText: {
    fontSize: 12,
    fontWeight: "700",
    color: PENDING_ORANGE,
  },
});
