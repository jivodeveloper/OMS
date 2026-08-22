import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import Dropdown from "@/src/components/common/DropdownProps";
import InlineOrderDateFilter, {
  type DateFilterValue,
} from "@/src/components/common/InlineOrderDateFilter";
import { COLORS } from "@/src/constants/theme";
import { fs, ms, sp } from "@/src/utils/responsive";
import paymentsService, {
  type BankDeposit,
  type Company,
  type PaymentReceipt,
} from "@/src/services/payments.service";
import { useCompanies } from "./usePaymentMasters";
import { usePaymentPermissions } from "./usePaymentPermissions";

/**
 * Tracking list for payments and deposits.
 *
 * The layout deliberately mirrors orders/ordertracking.tsx — same status
 * dropdown width, floating-label search, and gradient count bar — so the two
 * feel like one app rather than two. Only the data differs.
 *
 * Creators use this to follow their own entries through the approval chain,
 * which is why `mine` defaults to true for anyone who is not an approver.
 */

export type TrackingKind = "PAYMENT" | "DEPOSIT";

/** One row, normalised so the card renders either document type. */
interface TrackRow {
  id: number;
  docNo: string;
  party: string;
  subtitle: string;
  amount: number;
  status: string;
  statusLabel: string;
  date: string;
  createdBy: string;
  company: string;
  level: string;
  /** Approval request id — null until the document has been submitted. */
  approvalId: number | null;
  /** Invoice figures for the summary strip. Zero when not invoice-linked. */
  invoiceNo: string;
  invoiceAmount: number;
  /** Who handed the money over. Empty when it came from the party direct. */
  receivedFrom: string;
  /**
   * Deposit only: what was collected vs what actually reached the bank, and
   * how many parties' money is in it. Zero on a payment row, which has an
   * invoice comparison instead.
   */
  collectedAmount: number;
  partyCount: number;
  chips: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}

/**
 * One filter option. `query` is appended to the list request verbatim, so a
 * view can be expressed either as a document status or as an approver-relative
 * server view — the screen does not need to know which.
 */
interface StatusOption {
  label: string;
  value: string;
  query: string;
}

/**
 * Filter options.
 *
 * For an APPROVER these are relative to THEM, not to the document:
 *
 *   Pending    waiting on a rung THIS user can act on right now. A receipt
 *              parked at level 2 is invisible to the level-1 approver, and
 *              vice versa — plain "PENDING_APPROVAL" cannot express that,
 *              which is why the server resolves it from the approval ladder.
 *   Approved   entries THIS user personally approved (whatever happened after).
 *   Rejected   entries THIS user personally rejected.
 *   Completed  posted to SAP — the end of the road, for anyone.
 *
 * A CREATOR has no rungs, so theirs stay document-status filters.
 *
 * DRAFT is absent because the app submits on create — a draft never persists.
 */
const APPROVER_STATUS_OPTIONS: StatusOption[] = [
  // "All" means everything THIS approver has a stake in — awaiting them, or
  // already decided by them. Not every document in the company: a rung-2
  // approver seeing a rung-1 document has no action to take on it.
  {
    label: "All",
    value: "all",
    query: "approval_view=mine&group_by_status=true",
  },
  {
    label: "Pending",
    value: "awaiting_me",
    query: "approval_view=awaiting_me",
  },
  {
    label: "Approved",
    value: "approved_by_me",
    query: "approval_view=approved_by_me",
  },
  {
    label: "Rejected",
    value: "rejected_by_me",
    query: "approval_view=rejected_by_me",
  },
  {
    // Scoped like the others: an approver's "Completed" is what THEY cleared
    // that then posted, not every posted document in the company.
    label: "Completed",
    value: "POSTED",
    query: "approval_view=approved_by_me&status=POSTED",
  },
];

const CREATOR_STATUS_OPTIONS: StatusOption[] = [
  { label: "All", value: "all", query: "group_by_status=true" },
  {
    label: "Pending",
    value: "PENDING",
    query: "status=PENDING_APPROVAL,APPROVED,POSTING_TO_SAP",
  },
  { label: "Completed", value: "POSTED", query: "status=POSTED" },
  { label: "Rejected", value: "REJECTED", query: "status=REJECTED" },
];

/** Status -> pill colour. Anything unmapped falls back to neutral grey. */
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_APPROVAL: { bg: "#FFF7E6", fg: "#B45309" },
  APPROVED: { bg: "#EEF2FF", fg: "#4338CA" },
  POSTING_TO_SAP: { bg: "#EEF2FF", fg: "#4338CA" },
  SAP_UNKNOWN: { bg: "#FFF7E6", fg: "#B45309" },
  // Amber, not red: the posting succeeded and was reversed in SAP later.
  CANCELLED_IN_SAP: { bg: "#FFFBEB", fg: "#B45309" },
  POSTED: { bg: "#ECFDF5", fg: "#047857" },
  REJECTED: { bg: "#FEF2F2", fg: "#B91C1C" },
  CANCELLED: { bg: "#F3F4F6", fg: "#6B7280" },
  PENDING_ERROR: { bg: "#FEF2F2", fg: "#B91C1C" },
};

/**
 * Pill wording, matching the filter options above.
 *
 * The server's own display names leak internals ("Queued for SAP") — a creator
 * only needs to know whether it is still moving, done, or needs attention.
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  APPROVED: "In Progress",
  POSTING_TO_SAP: "Posting to SAP",
  SAP_UNKNOWN: "Awaiting SAP check",
  CANCELLED_IN_SAP: "Cancelled in SAP",
  POSTED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  PENDING_ERROR: "Pending Error",
};

/**
 * Turn the date picker's value into an inclusive from/to window.
 *
 * The picker speaks in three granularities (a day, a month, a year) but the API
 * takes a plain range, so the widening happens here rather than needing three
 * separate query shapes on the server.
 */
const dateWindow = (value: DateFilterValue): { from: string; to: string } | null => {
  if (!value?.value) return null;
  if (value.mode === "date") return { from: value.value, to: value.value };
  if (value.mode === "month") {
    const [y, m] = value.value.split("-").map(Number);
    // Day 0 of the NEXT month is the last day of this one — no month-length table.
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${value.value}-01`,
      to: `${value.value}-${String(last).padStart(2, "0")}`,
    };
  }
  return { from: `${value.value}-01-01`, to: `${value.value}-12-31` };
};

/**
 * How this payment sits against its invoice.
 *
 * The SAME thresholds as InvoiceSummaryCard, so a card in the list and the card
 * on the detail screen can never label the same payment differently. Kept as a
 * function on TrackRow rather than shared code because the list row is a
 * flattened shape, not the full detail model.
 */
const settlement = (row: TrackRow) => {
  const remaining = row.invoiceAmount - row.amount;
  if (remaining < -0.005) {
    return { bg: COLORS.errorLight, fg: COLORS.error, label: "Exceeds invoice" };
  }
  if (Math.abs(remaining) <= 0.005) {
    return { bg: COLORS.successLight, fg: COLORS.success, label: "Accepted" };
  }
  if (row.amount <= 0.005) {
    return { bg: COLORS.errorLight, fg: COLORS.error, label: "Not Received" };
  }
  return { bg: COLORS.warningLight, fg: COLORS.warning, label: "Part payment" };
};

const formatMoney = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const receiptToRow = (r: PaymentReceipt): TrackRow => ({
  id: r.id,
  docNo: r.receipt_no,
  party: r.card_name || r.card_code,
  subtitle: r.card_code,
  amount: Number(r.total_amount) || 0,
  status: r.status,
  statusLabel: STATUS_LABEL[r.status] ?? r.status_display ?? r.status,
  date: r.created_at,
  createdBy: r.created_by_name || "—",
  company: r.company,
  level: r.approval?.level_label ?? "",
  approvalId: r.approval?.id ?? null,
  // The balance owed when the invoice was picked. Older receipts stored 0, so
  // the strip hides itself rather than showing a false comparison.
  invoiceNo: r.allocations?.[0]?.sap_doc_num
    ? `INV-${r.allocations[0].sap_doc_num}`
    : "",
  invoiceAmount: Number(
    r.allocations?.[0]?.balance_at_selection ||
      r.allocations?.[0]?.invoice_total ||
      0,
  ),
  // Only when a COLLECTION PERSON carried it. "PARTY" means the party paid
  // directly, and that name is already the card title on the row — repeating
  // it as "Received from" would just be the same name twice.
  receivedFrom:
    r.received_from_type === "PERSON" ? r.received_from_name || "" : "",
  collectedAmount: 0,
  partyCount: 0,
  chips: [
    { icon: "calendar-outline", text: `Date: ${(r.payment_date || "").slice(0, 10) || "—"}` },
    { icon: "business-outline", text: r.company },
  ],
});

const depositToRow = (d: BankDeposit): TrackRow => ({
  id: d.id,
  docNo: d.deposit_no,
  party: d.bank_account_name || "Bank deposit",
  subtitle: `${d.lines?.length ?? 0} receipt${(d.lines?.length ?? 0) === 1 ? "" : "s"}`
    + (() => {
      // How many DISTINCT parties' money is in this deposit — the figure a
      // depositor is asked about, and not the same as the receipt count.
      const parties = new Set(
        (d.lines ?? []).map((l) => l.card_name).filter(Boolean),
      );
      return parties.size > 1 ? ` · ${parties.size} parties` : "";
    })(),
  amount: Number(d.deposit_amount) || 0,
  status: d.status,
  statusLabel: STATUS_LABEL[d.status] ?? d.status_display ?? d.status,
  date: d.created_at,
  createdBy: d.created_by_name || "—",
  company: d.company,
  level: d.approval?.level_label ?? "",
  approvalId: d.approval?.id ?? null,
  // A deposit banks receipts rather than settling an invoice, so there is no
  // invoice figure to compare against.
  invoiceNo: "",
  invoiceAmount: 0,
  // Who physically carried it to the bank. Distinct from created_by: a clerk
  // may raise the deposit for a collector who made the trip.
  receivedFrom: d.deposited_by_name || "",
  collectedAmount: Number(d.collected_amount) || 0,
  partyCount: new Set(
    (d.lines ?? []).map((l) => l.card_name).filter(Boolean),
  ).size,
  chips: [
    { icon: "calendar-outline", text: `Date: ${(d.deposit_date || "").slice(0, 10) || "—"}` },
    { icon: "wallet-outline", text: d.deposit_type },
  ],
});

interface Props {
  kind: TrackingKind;
  /**
   * Force the "only my entries" scope. Normally left undefined: an approver
   * needs to see what they must act on, a creator only their own, and that is
   * decided from permissions below rather than by the caller.
   */
  mine?: boolean;
}

export default function PaymentTrackingScreen({ kind, mine }: Props) {
  const isPayment = kind === "PAYMENT";
  const perms = usePaymentPermissions();

  // An approver's queue IS this screen — there is no separate requests page —
  // so they must see everything they can act on, not just what they raised.
  // A creator without approve rights still sees only their own entries.
  const canApprove = isPayment ? perms.canApprovePayment : perms.canApproveDeposit;
  const scopedToMine = mine ?? !canApprove;
  const statusOptions = canApprove
    ? APPROVER_STATUS_OPTIONS
    : CREATOR_STATUS_OPTIONS;

  const [rows, setRows] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Defaults to Pending: the entries a user opens this screen to chase. The
  // VALUE differs by role (an approver's Pending means "awaiting me"), so it is
  // set from the resolved option list rather than hardcoded.
  const [statusView, setStatusView] = useState("PENDING");

  /**
   * Preselect a status when the caller asks for one.
   *
   * The home page's activity cards link here, and its labels ("Total
   * Payments", "Pending", "Approved", "Rejected") are shared across roles
   * while the option VALUES are not — an approver's Pending is
   * "awaiting_me", a creator's is a document status. So the caller passes a
   * LABEL and the option list resolves it, which keeps the two screens
   * agreeing without the home page needing to know the viewer's role.
   */
  const { statusLabel } = useLocalSearchParams<{ statusLabel?: string }>();
  const appliedStatusLabel = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!statusLabel || statusLabel === appliedStatusLabel.current) return;
    appliedStatusLabel.current = statusLabel;
    const wanted = statusLabel.toLowerCase();
    // A creator's list has no "Approved" — their equivalent is "Completed"
    // (posted to SAP), because a creator has no rung to have approved at.
    // Falling back keeps the home card meaningful for both roles instead of
    // silently doing nothing for one of them.
    const aliases: Record<string, string[]> = {
      approved: ["approved", "completed"],
    };
    const candidates = aliases[wanted] ?? [wanted];
    const match = candidates
      .map((name) =>
        statusOptions.find((o) => o.label.toLowerCase() === name),
      )
      .find(Boolean);
    if (match) setStatusView(match.value);
  }, [statusLabel, statusOptions]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<Company | "">("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);

  const companies = useCompanies();

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        // The option carries its own query string — it may be a plain status
        // filter or an approver-relative server view.
        //
        // Falls back to PENDING, not to statusOptions[0] ("All"): permissions
        // resolve after the first render, so the selection briefly refers to
        // the other role's option set. Landing on "All" there would silently
        // widen the list instead of showing what the user asked for.
        const option =
          statusOptions.find((o) => o.value === statusView) ??
          statusOptions.find((o) => o.label === "Pending") ??
          statusOptions[0];
        const params: Record<string, string> = {};
        for (const pair of option.query.split("&")) {
          const [key, value] = pair.split("=");
          if (key && value) params[key] = value;
        }
        if (companyFilter) params.company = companyFilter;
        if (scopedToMine) params.mine = "true";
        const window = dateWindow(dateFilter);
        if (window) {
          params.date_from = window.from;
          params.date_to = window.to;
        }

        if (isPayment) {
          const data = await paymentsService.listReceipts(params);
          setRows(data.map(receiptToRow));
        } else {
          const data = await paymentsService.listDeposits(params);
          setRows(data.map(depositToRow));
        }
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 403
            ? "You do not have permission to view these entries."
            : "Could not load. Pull down to try again.",
        );
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // `scopedToMine`, NOT the `mine` prop: it is derived from permissions,
    // which arrive asynchronously. Depending on the prop meant the first fetch
    // ran with the pre-permission guess and never re-ran once the real answer
    // landed — an approver saw an empty list.
    [isPayment, statusView, statusOptions, companyFilter, dateFilter, scopedToMine],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  /**
   * Refetch whenever this screen comes back into view.
   *
   * An approver returns here straight after deciding, and a creator after
   * editing. Without this they land on the list they left — the entry they just
   * approved still sitting in Pending — which reads as the decision not having
   * worked. Skipped on the very first focus, since the mount effect above has
   * already fetched.
   */
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      void load("refresh");
    }, [load]),
  );

  /**
   * An explicit refetch signal from a screen that just changed the data.
   *
   * The focus effect above covers the ordinary case, but this screen lives in
   * the Drawer and so stays mounted: arriving here from a redirect is not
   * always a fresh focus. Redirecting with a changing `refreshAt` makes the
   * refetch explicit instead of depending on mount timing.
   */
  const { refreshAt } = useLocalSearchParams<{ refreshAt?: string }>();
  const lastRefreshAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!refreshAt || refreshAt === lastRefreshAt.current) return;
    lastRefreshAt.current = refreshAt;
    void load("refresh");
  }, [refreshAt, load]);

  const onRefresh = useCallback(() => void load("refresh"), [load]);

  // Search is local so typing never re-queries; status and company are server
  // filters, applied in `load` above.
  const visible = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.docNo.toLowerCase().includes(term) ||
        r.party.toLowerCase().includes(term) ||
        r.createdBy.toLowerCase().includes(term),
    );
  }, [rows, searchQuery]);

  /**
   * ONE details screen for both audiences.
   *
   * Creator and approver see exactly the same page; only the actions differ,
   * and the screen decides those from the caller's permissions plus the
   * document's state. Routing two different screens meant the same payment
   * looked like two different things depending on who opened it.
   */
  const openDetails = useCallback(
    (row: TrackRow) => {
      // A DEPOSIT has its own detail screen. approval-details renders a
      // payment — party, invoice, tender lines — none of which a deposit has,
      // so it showed an empty shell with blank fields.
      // `from` names the screen Back should return to. Pushing between two
      // DRAWER screens builds no navigator stack, so without it Back falls
      // through to the router's own history and — when that is empty — resets
      // to the dashboard. The header reads this param first (see
      // app/(main)/_layout.tsx headerLeft), which is what the orders screens
      // have always done.
      const from = isPayment
        ? "payments/payment-tracking"
        : "payments/deposit-tracking";

      if (!isPayment) {
        router.push({
          pathname: "/(main)/payments/deposit-details",
          params: { id: String(row.id), from },
        } as never);
        return;
      }
      router.push({
        pathname: "/(main)/approval/approval-details",
        params: {
          documentId: String(row.id),
          id: row.approvalId != null ? String(row.approvalId) : "",
          requestNo: row.docNo,
          from,
        },
      } as never);
    },
    [isPayment],
  );

  const openProgress = useCallback(
    (row: TrackRow) => {
      router.push({
        pathname: "/(main)/payments/tracking-progress",
        params: {
          id: String(row.id),
          kind,
          // Back returns to the list this was opened from — see openDetails.
          from: isPayment
            ? "payments/payment-tracking"
            : "payments/deposit-tracking",
        },
      } as never);
    },
    [kind, isPayment],
  );

  const renderItem = useCallback(
    ({ item }: { item: TrackRow }) => {
      const tone = STATUS_TONE[item.status] ?? { bg: "#F3F4F6", fg: "#6B7280" };
      return (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.docNo} numberOfLines={1}>
              {item.docNo}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.statusPillText, { color: tone.fg }]} numberOfLines={1}>
                {item.statusLabel}
              </Text>
            </View>
          </View>
          {/* Party on the left, date/company chips on the right of the SAME
              row — the chips are secondary detail and stacking them above the
              party pushed the name, which is what the eye looks for, down the
              card. Wraps on a narrow screen rather than squeezing the name. */}
          <View style={styles.partyRow}>
            <View style={styles.partyCol}>
              <Text style={styles.party} numberOfLines={2}>
                {item.party}
              </Text>
              {!!item.subtitle && (
                <Text style={styles.partyCode}>{item.subtitle}</Text>
              )}
            </View>
            <View style={styles.chipRow}>
              {item.chips.map((chip) => (
                <View key={chip.text} style={styles.chip}>
                  <Ionicons name={chip.icon} size={13} color={COLORS.primary} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {chip.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Who physically handed the money over. Only rendered for a named
              collection person — see receiptToRow. */}
          {!!item.receivedFrom && (
            <View style={styles.receivedFromRow}>
              <Ionicons
                name="person-circle-outline"
                size={ms(14)}
                color={COLORS.textSecondary}
              />
              <Text style={styles.receivedFromLabel}>
                {isPayment ? "Received from" : "Deposited by"}
              </Text>
              <Text style={styles.receivedFromName} numberOfLines={1}>
                {item.receivedFrom}
              </Text>
            </View>
          )}

          {/* Collected vs actually banked — the deposit equivalent of the
              invoice strip below. A shortfall is the thing a reviewer is
              looking for, and the deposit total alone cannot show it. */}
          {!isPayment && item.collectedAmount > 0 ? (
            <>
              <View style={styles.divider} />
              <View style={styles.invoiceRow}>
                <View style={styles.invoiceIcon}>
                  <Ionicons
                    name="cash"
                    size={ms(16)}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.invoiceCol}>
                  <Text style={styles.invoiceLabel}>Collected</Text>
                  <Text style={styles.invoiceValue} numberOfLines={1}>
                    {formatMoney(item.collectedAmount)}
                  </Text>
                  {item.partyCount > 0 ? (
                    <Text style={styles.invoiceNo} numberOfLines={1}>
                      {item.partyCount} part{item.partyCount === 1 ? "y" : "ies"}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.invoiceDivider} />

                <View style={[styles.invoiceIcon, styles.receivedIcon]}>
                  <Ionicons name="wallet" size={ms(16)} color={COLORS.success} />
                </View>
                <View style={styles.invoiceCol}>
                  <Text style={styles.invoiceLabel}>Deposited</Text>
                  <Text style={styles.receivedValue} numberOfLines={1}>
                    {formatMoney(item.amount)}
                  </Text>
                  {(() => {
                    const short = item.collectedAmount - item.amount;
                    if (short <= 0.005) {
                      return (
                        <View
                          style={[
                            styles.invoiceChip,
                            { backgroundColor: COLORS.successLight },
                          ]}
                        >
                          <Text
                            style={[
                              styles.invoiceChipText,
                              { color: COLORS.success },
                            ]}
                          >
                            Full amount
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <View
                        style={[
                          styles.invoiceChip,
                          { backgroundColor: COLORS.warningLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.invoiceChipText,
                            { color: COLORS.warning },
                          ]}
                        >
                          Short {formatMoney(short)}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>
            </>
          ) : null}

          {/* Invoice vs received, at a glance. A card in a list has to answer
              "is this settled?" without being opened, which the total alone
              cannot — 1,35,000 means nothing until you know what was owed. */}
          {item.invoiceAmount > 0 ? (
            <>
              <View style={styles.divider} />
              <View style={styles.invoiceRow}>
                <View style={styles.invoiceIcon}>
                  <Ionicons
                    name="document-text"
                    size={ms(16)}
                    color={COLORS.primary}
                  />
                </View>
                <View style={styles.invoiceCol}>
                  <Text style={styles.invoiceLabel}>Invoice Amount</Text>
                  <Text style={styles.invoiceValue} numberOfLines={1}>
                    {formatMoney(item.invoiceAmount)}
                  </Text>
                  {!!item.invoiceNo && (
                    <Text style={styles.invoiceNo} numberOfLines={1}>
                      {item.invoiceNo}
                    </Text>
                  )}
                </View>

                <View style={styles.invoiceDivider} />

                <View style={[styles.invoiceIcon, styles.receivedIcon]}>
                  <Ionicons
                    name="wallet"
                    size={ms(16)}
                    color={COLORS.success}
                  />
                </View>
                <View style={styles.invoiceCol}>
                  <Text style={styles.invoiceLabel}>Received Amount</Text>
                  <Text style={styles.receivedValue} numberOfLines={1}>
                    {formatMoney(item.amount)}
                  </Text>
                  <View
                    style={[
                      styles.invoiceChip,
                      { backgroundColor: settlement(item).bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.invoiceChipText,
                        { color: settlement(item).fg },
                      ]}
                      numberOfLines={1}
                    >
                      {settlement(item).label}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : null}

          <View style={styles.divider} />

          {/* Two actions, matching Order Tracking: blue Details, green
              Progress. Details answers "what is this?", Progress answers
              "where has it got to?" — they are separate questions. */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.progressBtn]}
              onPress={() => openProgress(item)}
              activeOpacity={0.85}
            >
              <Ionicons name="git-branch-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>View Progress</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.detailsBtn]}
              onPress={() => openDetails(item)}
              activeOpacity={0.85}
            >
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>View Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [openDetails, openProgress],
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <Ionicons
          name={error ? "alert-circle-outline" : "file-tray-outline"}
          size={44}
          color={error ? COLORS.error : COLORS.textSecondary}
        />
        <Text style={styles.emptyTitle}>
          {error || (isPayment ? "No payments found" : "No deposits found")}
        </Text>
        {!error && (
          <Text style={styles.emptyHint}>
            {statusView !== "all" || companyFilter || dateFilter || searchQuery
              ? "Try widening the filters above."
              : mine
                ? "Entries you create will appear here."
                : "Nothing has been recorded yet."}
          </Text>
        )}
      </View>
    );
  };

  const activeFilterCount =
    (companyFilter ? 1 : 0) +
    (statusView !== "all" ? 1 : 0) +
    (dateFilter ? 1 : 0);

  return (
    <View style={styles.container}>
      {/* Status + Search — identical geometry to the order tracking header. */}
      <View style={styles.tabContainer}>
        <View style={styles.statusDropdownWrap}>
          <Dropdown
            label="Status"
            data={statusOptions}
            value={
              statusOptions.some((o) => o.value === statusView)
                ? statusView
                : (statusOptions.find((o) => o.label === "Pending")?.value ??
                   statusOptions[0].value)
            }
            onChange={setStatusView}
            searchable={false}
            floatingLabel
            noBottomSpacing
          />
        </View>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Search</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={(value) => setSearchQuery(value.toUpperCase())}
              placeholder="NO. / PARTY"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Count bar — holds Filter, so it stays visible on an empty result set;
          hiding it would leave the user unable to widen the filter that
          emptied the list. */}
      {!loading && (
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countBar}
        >
          <TouchableOpacity
            style={styles.countBarFilterBtn}
            onPress={() => setIsFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="funnel-outline" size={14} color="#fff" />
            <Text style={styles.countBarFilterText}>Filter</Text>
            {activeFilterCount > 0 && <View style={styles.countBarFilterDot} />}
          </TouchableOpacity>

          <View style={styles.countBarTextWrap}>
            <Text style={styles.countText} numberOfLines={1} adjustsFontSizeToFit>
              {visible.length} {isPayment ? "payment" : "deposit"}
              {visible.length === 1 ? "" : "s"} found
            </Text>
            <Text style={styles.countSubText} numberOfLines={1}>
              Last updated just now
            </Text>
          </View>

          <View style={styles.countBarDateWrap}>
            <InlineOrderDateFilter
              value={dateFilter}
              onChange={setDateFilter}
              variant="onDark"
            />
          </View>
        </LinearGradient>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Filter sheet — company only; status lives in the header dropdown. */}
      <Modal
        visible={isFilterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Filter</Text>
              <TouchableOpacity onPress={() => setIsFilterModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Company</Text>
            <TouchableOpacity
              style={[styles.optionRow, !companyFilter && styles.optionRowActive]}
              onPress={() => setCompanyFilter("")}
            >
              <Text
                style={[
                  styles.optionText,
                  !companyFilter && styles.optionTextActive,
                ]}
              >
                All companies
              </Text>
              {!companyFilter && (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
            {companies.data.map((c) => {
              const active = companyFilter === c.company;
              return (
                <TouchableOpacity
                  key={c.company}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => setCompanyFilter(c.company)}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {c.display_name || c.company}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalClear}
                onPress={() => {
                  setCompanyFilter("");
                  setStatusView("all");
                  setDateFilter(null);
                }}
              >
                <Text style={styles.modalClearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApply}
                onPress={() => setIsFilterModalVisible(false)}
              >
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Header: matches ordertracking.tsx exactly ──────────────────────────
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(12),
    paddingVertical: sp(12),
    gap: sp(8),
  },
  statusDropdownWrap: {
    width: ms(124),
    flexGrow: 0,
    flexShrink: 0,
  },
  fieldWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: sp(8),
    position: "relative",
  },
  fieldLabel: {
    position: "absolute",
    top: 0,
    left: 12,
    zIndex: 2,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: 4,
    fontSize: fs(12),
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  searchWrap: {
    alignSelf: "stretch",
    height: ms(56),
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: sp(10),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(12),
    backgroundColor: COLORS.inputBackground,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: fs(12),
    fontWeight: "600",
    color: COLORS.text,
    paddingVertical: 0,
  },

  // ── Gradient count bar ────────────────────────────────────────────────
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: sp(16),
    marginTop: sp(12),
    paddingVertical: sp(12),
    paddingHorizontal: sp(12),
    borderRadius: sp(16),
    gap: sp(10),
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  countBarFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(8),
  },
  countBarFilterText: { color: "#fff", fontSize: fs(12), fontWeight: "700" },
  countBarFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD166",
    marginLeft: 2,
  },
  countBarTextWrap: { flex: 1, minWidth: 0 },
  countBarDateWrap: { flexGrow: 0, flexShrink: 0 },
  countText: { color: "#fff", fontSize: fs(14), fontWeight: "800" },
  countSubText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: fs(11),
    marginTop: 2,
  },

  // ── Cards ─────────────────────────────────────────────────────────────
  listContent: { padding: sp(16), paddingBottom: sp(40) },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(16),
    padding: sp(16),
    marginBottom: sp(14),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(8),
  },
  docNo: {
    flex: 1,
    fontSize: fs(15),
    fontWeight: "800",
    color: COLORS.text,
  },
  statusPill: {
    paddingHorizontal: sp(10),
    paddingVertical: sp(5),
    borderRadius: 20,
    flexShrink: 0,
  },
  statusPillText: { fontSize: fs(11), fontWeight: "700" },
  createdAt: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    marginTop: sp(4),
  },
  party: {
    fontSize: fs(14),
    fontWeight: "700",
    color: COLORS.text,
    // No marginTop: the row that wraps it owns the spacing now.
  },
  partyCode: { fontSize: fs(12), color: COLORS.textSecondary, marginTop: 2 },
  // Party and chips share a row; the chips sit right and wrap beneath on a
  // narrow screen instead of crushing the party name.
  partyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: sp(8),
    marginTop: sp(10),
  },
  partyCol: {
    flexShrink: 1,
    minWidth: ms(150),
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: sp(8),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: sp(10),
    paddingVertical: sp(6),
  },
  chipText: { fontSize: fs(11), color: COLORS.textSecondary, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: sp(12),
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: fs(13), color: COLORS.textSecondary, fontWeight: "600" },
  totalValue: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
  // Two icon+figure columns that WRAP rather than clip: on a narrow screen the
  // received column drops beneath the invoice one instead of truncating.
  // Sits under the party code, so the row reads: who paid -> who carried it.
  receivedFromRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(5),
    marginTop: sp(6),
  },
  receivedFromLabel: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
  },
  receivedFromName: {
    flex: 1,
    fontSize: fs(11),
    fontWeight: "700",
    color: COLORS.text,
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: sp(8),
    paddingVertical: sp(10),
  },
  invoiceIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: sp(9),
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  receivedIcon: {
    backgroundColor: COLORS.successLight,
  },
  invoiceCol: {
    flex: 1,
    minWidth: ms(110),
  },
  invoiceDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.borderLight,
    marginHorizontal: sp(2),
  },
  invoiceLabel: {
    fontSize: fs(11),
    color: COLORS.textSecondary,
    marginBottom: sp(2),
  },
  invoiceValue: {
    fontSize: fs(14),
    fontWeight: "800",
    color: COLORS.primary,
  },
  receivedValue: {
    fontSize: fs(14),
    fontWeight: "800",
    color: COLORS.success,
  },
  invoiceNo: {
    fontSize: fs(10),
    color: COLORS.textMuted,
    marginTop: sp(2),
  },
  invoiceChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: sp(8),
    paddingVertical: sp(2),
    marginTop: sp(4),
  },
  invoiceChipText: {
    fontSize: fs(10),
    fontWeight: "700",
  },
  actionRow: { flexDirection: "row", gap: sp(10), marginTop: sp(14) },
  // Same pair as orders/ordertracking.tsx so the two lists match.
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: sp(10),
    paddingVertical: sp(12),
  },
  detailsBtn: { backgroundColor: COLORS.primary },
  progressBtn: { backgroundColor: "#4CAF50" },
  actionBtnText: { color: "#fff", fontSize: fs(14), fontWeight: "600" },

  // ── States ────────────────────────────────────────────────────────────
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", paddingVertical: sp(60), gap: sp(8) },
  emptyTitle: {
    fontSize: fs(15),
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    paddingHorizontal: sp(24),
  },
  emptyHint: {
    fontSize: fs(12),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingHorizontal: sp(32),
  },

  // ── Filter sheet ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: sp(20),
    borderTopRightRadius: sp(20),
    padding: sp(20),
    maxHeight: "75%",
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sp(16),
  },
  modalTitle: { fontSize: fs(17), fontWeight: "800", color: COLORS.text },
  modalLabel: {
    fontSize: fs(12),
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: sp(8),
    textTransform: "uppercase",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sp(13),
    paddingHorizontal: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: sp(8),
  },
  optionRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(79,70,229,0.06)",
  },
  optionText: { fontSize: fs(14), color: COLORS.text, fontWeight: "600" },
  optionTextActive: { color: COLORS.primary, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: sp(12), marginTop: sp(10) },
  modalClear: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalClearText: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  modalApply: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sp(14),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  modalApplyText: { fontSize: fs(14), fontWeight: "700", color: "#fff" },
});
