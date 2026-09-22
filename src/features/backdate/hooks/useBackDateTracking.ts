import { useCallback, useEffect, useRef, useState } from "react";

import type { DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import { can } from "@/src/constants/permissions";
import { useAuth } from "@/src/context/AuthContext";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import backdateService, {
  type BackDateInsights,
  type BackDateRequest,
} from "@/src/services/backdate.service";
import { messageFrom } from "./useBackDateMasters";

export type StatusFilter = "" | "PENDING" | "APPROVED" | "COMPLETED" | "REJECTED";

/**
 * The day or month a date filter covers, as local `YYYY-MM-DD` bounds.
 *
 * The same shape Payment Tracking uses, so the shared date control behaves
 * identically on both screens.
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

/** A request's creation day in the DEVICE's timezone, as `YYYY-MM-DD`. */
const createdOn = (request: BackDateRequest): string => {
  const d = new Date(request.created_at);
  if (Number.isNaN(d.getTime())) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

const EMPTY_COUNTS: BackDateInsights = {
  pending: 0,
  approved: 0,
  completed: 0,
  rejected: 0,
  total: 0,
};

/**
 * The tracking list, for whichever side of BackDate the viewer is on.
 *
 * ONE SCREEN, TWO SOURCES, CHOSEN BY PERMISSION:
 *
 *   * `BackDate`          -> the requests this user raised (`/requests/`)
 *   * `BackDate_Approval` -> only what is in their approvals
 *                            (`/approvals/queue/` + `/approvals/history/`)
 *   * both                -> both, merged
 *
 * There is no mode to pick and no empty tab to explain: a user is shown what
 * they are entitled to see, and nothing else.
 *
 * WHEN A REQUEST APPEARS IN BOTH, THE QUEUE COPY WINS. That is not a tidy-up —
 * only the queue says "this is awaiting YOUR decision", and it is the flag the
 * details screen reads to decide whether to offer Approve and Reject. Letting
 * the requester copy win would silently turn an actionable request into a
 * read-only one for anybody who both raised and approves it.
 */
export function useBackDateTracking() {
  const { user } = useAuth();
  const canRaise = can(user, "BackDate");
  const canApprove = can(user, "BackDate_Approval");

  const [rows, setRows] = useState<BackDateRequest[]>([]);
  const [counts, setCounts] = useState<BackDateInsights>(EMPTY_COUNTS);
  /** Ids awaiting THIS user's decision — the right to act, from the queue. */
  const [actionable, setActionable] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /**
   * Opens on PENDING, as payment tracking does.
   *
   * The list is overwhelmingly finished requests, and neither side of BackDate
   * arrives wanting those: a requester is chasing what has not moved, and an
   * approver is looking for what is waiting on them. Starting on All buried
   * both under months of settled rows. Clear all in the filter sheet still
   * widens to every status.
   */
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [company, setCompany] = useState<string>("");
  /**
   * Applied HERE, not sent to the server.
   *
   * `/requests/` accepts a whole month and the two approval endpoints accept
   * no date at all, so asking the server would filter one of the three lists
   * this screen merges and silently leave the others unfiltered — a date
   * filter that drops some rows and keeps others is worse than none. The list
   * is unpaginated, so narrowing it here gives the same answer for every
   * source, and for a single day as well as a month.
   */
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Typing an id should not be one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const runId = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      const run = ++runId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      const filters = {
        ...(company ? { company } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      };

      try {
        // The queue only ever holds PENDING work, so it is skipped entirely
        // when the user has filtered to a decided status.
        const wantsQueue = canApprove && (status === "" || status === "PENDING");
        const wantsApprovalHistory = canApprove && status !== "PENDING";

        const [mine, queue, history, insights] = await Promise.all([
          canRaise
            ? backdateService.listRequests({ ...filters, ...(status ? { status } : {}) })
            : Promise.resolve([] as BackDateRequest[]),
          wantsQueue
            ? backdateService.approvalQueue(filters)
            : Promise.resolve([] as BackDateRequest[]),
          wantsApprovalHistory
            ? backdateService.approvalHistory({
                ...filters,
                ...(status ? { status } : {}),
              })
            : Promise.resolve([] as BackDateRequest[]),
          // A requester's counts are their own; an approver's are their desk's.
          // Whoever holds both sees the requester figures, which is the list
          // they opened the screen for.
          canRaise
            ? backdateService.insights(filters)
            : backdateService.approvalInsights(filters),
        ]);

        if (run !== runId.current) return;

        const queueIds = new Set(queue.map((r) => r.id));
        setActionable(queueIds);

        // Queue first so its copy wins the de-duplication below.
        const merged: BackDateRequest[] = [];
        const seen = new Set<number>();
        for (const request of [...queue, ...history, ...mine]) {
          if (seen.has(request.id)) continue;
          seen.add(request.id);
          merged.push(request);
        }
        merged.sort((a, b) => b.id - a.id);

        const window = dateWindow(dateFilter);
        setRows(
          window
            ? merged.filter((request) => {
                const day = createdOn(request);
                return day >= window.from && day <= window.to;
              })
            : merged,
        );
        setCounts(insights ?? EMPTY_COUNTS);
      } catch (err) {
        if (run !== runId.current) return;
        setError(messageFrom(err, "Could not load BackDate requests."));
        setRows([]);
      } finally {
        if (run === runId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [canRaise, canApprove, status, company, debouncedSearch, dateFilter],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Returning from a details page where something was approved,
  // rejected or edited. Refreshes in place — the rows stay visible and
  // only the pull-to-refresh spinner shows.
  useRefreshOnFocus(() => load(true));

  return {
    rows,
    counts,
    actionable,
    loading,
    refreshing,
    error,
    status,
    setStatus,
    company,
    setCompany,
    dateFilter,
    setDateFilter,
    search,
    setSearch,
    /** How many narrowing choices are active — the dot on the Filter button. */
    activeFilterCount:
      (company ? 1 : 0) + (status ? 1 : 0) + (dateFilter ? 1 : 0),
    clearFilters: () => {
      setCompany("");
      setStatus("");
      setDateFilter(null);
    },

    onRefresh: () => load(true),
    reload: () => load(),
    canRaise,
    canApprove,
  };
}

export default useBackDateTracking;
