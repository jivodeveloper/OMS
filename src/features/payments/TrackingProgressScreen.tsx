import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { fs, ms, sp } from "@/src/utils/responsive";
import approvalsService, {
  type ApiApprovalDetail,
} from "@/src/services/approvals.service";
import paymentsService, {
  type BankDeposit,
  type PaymentReceipt,
} from "@/src/services/payments.service";
import type { TrackingKind } from "./PaymentTrackingScreen";

/**
 * Approval timeline for one payment or deposit.
 *
 * Deliberately identical in look to orders/orderprogress.tsx — same rail, card
 * tones and detail rows — so the two flows read as one app. Only the data
 * differs: rungs come from the approval ladder rather than order stages.
 *
 * SAP Information is shown HERE (not on the detail page): posting is the final
 * step of the approval journey, so it belongs at the end of this timeline.
 */

// Same palette as orders/orderprogress.tsx. Repeated rather than imported
// because that screen keeps them local; keep the two in step if either changes.
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

/** "1st Level", "2nd Level", ... — same wording as the orders timeline. */
const ordinalLevel = (position: number) => {
  const n = position;
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return `${n}st Level`;
  if (ten === 2 && hundred !== 12) return `${n}nd Level`;
  if (ten === 3 && hundred !== 13) return `${n}rd Level`;
  return `${n}th Level`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB")}, ${d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })}`;
};

const formatCreatedOn = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatMoney = (value?: string | number | null) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** One rendered card: an approval rung, or the trailing SAP posting card. */
interface Stage {
  key: string;
  title: string;
  badge: string;
  state: StageState;
  action?: string;
  approvers?: { name: string; state: "APPROVED" | "REJECTED" | "PENDING" }[];
  stageLabel?: string;
  timestamp?: string;
  remarks?: string;
  /** SAP card only. */
  info?: { label: string; value: string }[];
}

export default function TrackingProgressScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const id = Number(params.id);
  const kind = (params.kind as TrackingKind) || "PAYMENT";
  const isPayment = kind === "PAYMENT";

  const [doc, setDoc] = useState<PaymentReceipt | BankDeposit | null>(null);
  const [approval, setApproval] = useState<ApiApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) {
      setError("Missing document reference.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      const document = isPayment
        ? await paymentsService.getReceipt(id)
        : await paymentsService.getDeposit(id);
      setDoc(document);

      // The approval id comes off the document, so a document with no chain yet
      // still renders its header card rather than erroring.
      const approvalId = document.approval?.id;
      if (approvalId) {
        try {
          setApproval(await approvalsService.detail(approvalId));
        } catch {
          setApproval(null);
        }
      } else {
        setApproval(null);
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 404
          ? "This entry no longer exists."
          : status === 403
            ? "You do not have permission to view this entry."
            : "Could not load this entry.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, isPayment]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const stages = buildStages(doc, approval, isPayment);

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DONE_GREEN} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color={REJECTED_RED} />
        <Text style={styles.emptyText}>{error}</Text>
      </View>
    );
  }

  const docNo = isPayment
    ? (doc as PaymentReceipt)?.receipt_no
    : (doc as BankDeposit)?.deposit_no;

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
            <Ionicons name={circleIcon as any} size={15} color="#fff" />
          </View>
          {!isLast ? (
            <View style={[styles.connector, { backgroundColor: tone.line }]} />
          ) : null}
        </View>

        <View
          style={[styles.card, { backgroundColor: tone.card, borderColor: tone.border }]}
        >
          <View style={styles.cardHeader}>
            <Ionicons
              name={headerIcon as any}
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

          {!!item.action && (
            <DetailRow icon="sparkles-outline" label="Action" value={item.action} />
          )}

          {item.approvers?.length ? (
            <View style={styles.detailRow}>
              <Ionicons
                name="people-outline"
                size={ms(18)}
                color="#1E1E1E"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextWrap}>
                <Text style={styles.detailLabel}>
                  {item.approvers.length > 1 ? "Approvers" : "Approver"}
                </Text>
                {item.approvers.map((person, i) => {
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
                          style={[styles.approverAvatarText, { color: personTone }]}
                        >
                          {String(person.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.approverName} numberOfLines={1}>
                        {person.name}
                      </Text>
                      <View
                        style={[
                          styles.approverStatusChip,
                          { backgroundColor: personTone + "1A" },
                        ]}
                      >
                        <Ionicons name={personIcon} size={ms(11)} color={personTone} />
                        <Text
                          style={[styles.approverStatusText, { color: personTone }]}
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
            <DetailRow icon="time-outline" label="Timestamp" value={item.timestamp} />
          )}
          {!!item.remarks && (
            <DetailRow
              icon="document-text-outline"
              label="Remarks"
              value={item.remarks}
            />
          )}

          {/* SAP card carries a list of key/value rows instead of the fields
              above — DocEntry, DocNum, posted-at and SAP's own message. */}
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
        {!!docNo && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons
                name={isPayment ? "receipt-outline" : "wallet-outline"}
                size={ms(20)}
                color={INFO_BLUE}
              />
            </View>
            <View style={styles.summaryMain}>
              <Text style={styles.summaryLabel}>
                {isPayment ? "Payment ID" : "Deposit ID"}
              </Text>
              <Text style={styles.summaryOrderNo} numberOfLines={1} adjustsFontSizeToFit>
                {docNo}
              </Text>
              {!!doc?.created_at && (
                <Text style={styles.summaryCreated} numberOfLines={1}>
                  Created on {formatCreatedOn(doc.created_at)}
                </Text>
              )}
              <Text style={styles.summaryCreated} numberOfLines={1}>
                {isPayment
                  ? (doc as PaymentReceipt)?.card_name
                  : (doc as BankDeposit)?.bank_account_name}
                {" · "}
                {formatMoney(
                  isPayment
                    ? (doc as PaymentReceipt)?.total_amount
                    : (doc as BankDeposit)?.deposit_amount,
                )}
              </Text>
            </View>
          </View>
        )}

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
              onRefresh={onRefresh}
              colors={[DONE_GREEN]}
              tintColor={DONE_GREEN}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                This entry has not been submitted for approval yet.
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
      <Ionicons name={icon} size={18} color="#1E1E1E" style={styles.detailIcon} />
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Turn the approval ladder plus the document's SAP state into timeline cards.
 *
 * Rungs already acted on are green (or red); the rung awaiting action is amber;
 * rungs not yet reached are grey. A trailing blue card reports SAP, because
 * posting is what "approved" ultimately leads to.
 */
function buildStages(
  doc: PaymentReceipt | BankDeposit | null,
  approval: ApiApprovalDetail | null,
  isPayment: boolean,
): Stage[] {
  if (!doc) return [];
  const stages: Stage[] = [];

  if (approval) {
    const rejected = approval.status === "REJECTED";
    // Only the newest round is drawn: earlier rounds belong to a superseded
    // attempt and would make the ladder read as more rungs than exist.
    const round = approval.round_number ?? 1;
    const actions = (approval.actions || []).filter(
      (a) => (a.round_number ?? 1) === round,
    );

    const ladder =
      approval.levels?.length
        ? approval.levels
        : Array.from({ length: approval.total_levels || 0 }, (_, i) => ({
            position: i + 1,
            sequence: i + 1,
            name: `Level ${i + 1}`,
            role: "",
            approvers: [] as string[],
          }));

    ladder.forEach((rung) => {
      const acted = actions.filter(
        (a) => a.level === rung.position && a.action !== "SUBMIT",
      );
      const decision = acted[acted.length - 1];
      const isRejectedHere = decision?.action === "REJECT";
      const isDone = !!decision && decision.action === "APPROVE";
      const isCurrent =
        !decision && !rejected && approval.current_level === rung.position &&
        approval.status === "PENDING";

      const state: StageState = isRejectedHere
        ? "REJECTED"
        : isDone
          ? "DONE"
          : isCurrent
            ? "CURRENT"
            : "FUTURE";

      const namesFromLadder = rung.approvers?.length ? rung.approvers : [];
      const approvers = decision
        ? [
            {
              name: decision.approver_username || "—",
              state: (isRejectedHere ? "REJECTED" : "APPROVED") as
                | "APPROVED"
                | "REJECTED",
            },
          ]
        : namesFromLadder.map((name) => ({
            name,
            state: "PENDING" as const,
          }));

      stages.push({
        key: `level-${rung.position}`,
        title: rung.name || `Level ${rung.position}`,
        badge: isRejectedHere
          ? "Rejected"
          : isDone
            ? "Approved"
            : isCurrent
              ? "Awaiting action"
              : "Pending",
        state,
        action: decision
          ? isRejectedHere
            ? "Rejected"
            : "Approved"
          : isCurrent
            ? "Awaiting action"
            : "Not started",
        approvers,
        stageLabel: ordinalLevel(rung.position),
        timestamp: decision ? formatDateTime(decision.acted_at) : undefined,
        remarks: decision?.remarks || undefined,
      });
    });
  }

  // ── SAP posting, as the final card ──────────────────────────────────────
  const status = doc.status;
  const sapEntry = doc.sap_doc_entry;
  const sapState: StageState =
    status === "POSTED"
      ? "DONE"
      : status === "PENDING_ERROR"
        ? "REJECTED"
        : status === "POSTING_TO_SAP" || status === "APPROVED"
          ? "CURRENT"
          : status === "SAP_UNKNOWN"
            ? "CURRENT"
            : "FUTURE";

  const sapBadge =
    status === "POSTED"
      ? "Posted"
      : status === "PENDING_ERROR"
        ? "Failed"
        : status === "POSTING_TO_SAP"
          ? "Posting"
          : status === "SAP_UNKNOWN"
            ? "Unconfirmed"
            : "Pending";

  const info: { label: string; value: string }[] = [];
  if (sapEntry != null) {
    info.push({ label: "SAP DocEntry", value: String(sapEntry) });
    info.push({ label: "SAP DocNum", value: String(doc.sap_doc_num ?? "—") });
    // The journal-entry key. DocEntry finds the payment in SAP; TransId is
    // what finance needs to find its accounting. Shown only when present —
    // documents posted before it was captured have none, and a row reading
    // "—" would suggest something failed.
    if (doc.sap_trans_id != null) {
      info.push({ label: "SAP TransId", value: String(doc.sap_trans_id) });
    }
    info.push({ label: "Posted At", value: formatDateTime(doc.sap_posted_at) });
  }
  if (doc.sap_response) {
    info.push({ label: "SAP Response", value: doc.sap_response });
  }
  if (!info.length) {
    info.push({
      label: "Status",
      value:
        status === "REJECTED"
          ? "Not posted — the entry was rejected."
          : "Not posted yet. Posting happens automatically once every approval is complete.",
    });
  }

  stages.push({
    key: "sap",
    title: "SAP Information",
    badge: sapBadge,
    state: sapState,
    action:
      status === "POSTED"
        ? isPayment
          ? "Payment created in SAP"
          : "Deposit created in SAP"
        : status === "PENDING_ERROR"
          ? "SAP rejected the document"
          : status === "SAP_UNKNOWN"
            ? "SAP did not respond — verification needed"
            : undefined,
    info,
  });

  return stages;
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
  stageBadgeText: {
    fontSize: fs(11),
    fontWeight: "800",
  },
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
  summaryMain: {
    flex: 1,
    minWidth: 0,
  },
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
  summaryCreated: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
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
    fontSize: fs(12),
    fontWeight: "700",
    color: "#111827",
    marginBottom: 1,
  },
  detailValue: {
    fontSize: fs(13),
    lineHeight: fs(18),
    color: "#4B5563",
  },
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
  },
  approverAvatarText: {
    fontSize: fs(11),
    fontWeight: "800",
  },
  approverName: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(13),
    color: "#374151",
    fontWeight: "600",
  },
  approverStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: sp(8),
    paddingVertical: sp(3),
    borderRadius: 20,
    flexShrink: 0,
  },
  approverStatusText: {
    fontSize: fs(11),
    fontWeight: "700",
  },
});
