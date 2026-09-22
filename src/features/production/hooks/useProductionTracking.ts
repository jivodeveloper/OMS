import { useCallback, useEffect, useRef, useState } from "react";

import type { DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import { can } from "@/src/constants/permissions";
import { useAuth } from "@/src/context/AuthContext";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import productionService, {
  type ProductionOrder,
} from "@/src/services/production.service";

export type StatusFilter =
  | ""
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "OBSOLETE";

/** Any error this module raises, as a sentence worth showing a person. */
export function messageFrom(error: unknown, fallback: string): string {
  const status = (error as { status?: number })?.status;
  if (status === 403) return "You do not have permission to view these orders.";
  const message = (error as { message?: string })?.message;
  return message && message.trim() ? message : fallback;
}

/**
 * The day or month a date filter covers, as local `YYYY-MM-DD` bounds.
 *
 * The same shape Payment Tracking and BackDate use, so the shared date control
 * behaves identically on all three screens.
 */
const dateWindow = (
  value: DateFilterValue,
): { from: string; to: string } | null => {
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
 * The day SAP posted the order, in the DEVICE's timezone, as `YYYY-MM-DD`.
 *
 * `post_date` and not `created_at`: a person looking for "Tuesday's orders"
 * means the day production was planned for, not the day a sync happened to
 * notice it — and those differ by however long the feed was down.
 */
const orderDay = (order: ProductionOrder): string => {
  const raw = order.post_date;
  if (!raw) return "";
  // Already a plain calendar date from SAP; parsing it as an instant would
  // shift it a day for anyone east or west of the server.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

/** Local, because the API filters by company and status but not by text. */
const matchesSearch = (order: ProductionOrder, term: string): boolean => {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [
    String(order.sap_doc_num ?? ""),
    String(order.sap_doc_entry),
    String(order.id),
    order.item_code,
    order.item_name,
    order.batch_no,
    order.warehouse,
  ].some((field) => (field || "").toLowerCase().includes(needle));
};

/**
 * The tracking list, for whichever side of PRDO the viewer is on.
 *
 * ONE SCREEN, TWO SOURCES, CHOSEN BY PERMISSION — the same shape BackDate
 * uses:
 *
 *   * `Production_Order`          -> every synced order (`/requests/`)
 *   * `Production_Order_Approval` -> only what is in their approvals
 *                                    (`/approvals/queue/` + `/approvals/history/`)
 *   * both                        -> both, merged
 *
 * There is no mode to pick and no empty tab to explain.
 *
 * WHEN AN ORDER APPEARS IN BOTH, THE QUEUE COPY WINS. That is not a tidy-up —
 * only the queue says "this is awaiting YOUR decision", and it is the flag the
 * details screen reads to decide whether to offer Approve and Reject. Letting
 * the viewer copy win would silently turn an actionable order into a read-only
 * one for anybody holding both keys.
 *
 * NOBODY RAISES THESE. Unlike BackDate there is no "my requests" — SAP is the
 * point of origin, so the viewer list is everything the sync has found, and
 * `Production_Order` alone means "watch", not "own".
 */
export function useProductionTracking() {
  const { user } = useAuth();
  const canView = can(user, "Production_Order");
  const canApprove = can(user, "Production_Order_Approval");

  const [rows, setRows] = useState<ProductionOrder[]>([]);
  /** Ids awaiting THIS user's decision — the right to act, from the queue. */
  const [actionable, setActionable] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /**
   * Opens on PENDING, as payment tracking and BackDate do.
   *
   * The list is overwhelmingly settled orders — the sync has been finding them
   * for as long as it has run — and neither side arrives wanting those. Clear
   * all in the filter sheet still widens to every status.
   */
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [company, setCompany] = useState<string>("");
  /**
   * Applied HERE, not sent to the server: `/requests/` takes no date at all
   * and neither approval endpoint does, so asking would filter nothing. The
   * list is unpaginated, so narrowing it here gives the same answer for every
   * source, and for a single day as well as a month.
   */
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);
  /** Also local — the API has `item_code=` but no free-text search. */
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Typing a doc number should not re-filter on every keystroke.
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

      const filters = company ? { company } : {};

      try {
        // The queue only ever holds PENDING work, so it is skipped entirely
        // when the viewer has filtered to a decided status.
        const wantsQueue =
          canApprove && (status === "" || status === "PENDING");
        const wantsApprovalHistory = canApprove && status !== "PENDING";

        const [all, queue, history] = await Promise.all([
          canView
            ? productionService.listOrders({
                ...filters,
                ...(status ? { status } : {}),
              })
            : Promise.resolve([] as ProductionOrder[]),
          wantsQueue
            ? productionService.approvalQueue(filters)
            : Promise.resolve([] as ProductionOrder[]),
          wantsApprovalHistory
            ? productionService.approvalHistory({
                ...filters,
                ...(status ? { status } : {}),
              })
            : Promise.resolve([] as ProductionOrder[]),
        ]);

        if (run !== runId.current) return;

        const queueIds = new Set(queue.map((r) => r.id));
        setActionable(queueIds);

        // Queue first so its copy wins the de-duplication below.
        const merged: ProductionOrder[] = [];
        const seen = new Set<number>();
        for (const order of [...queue, ...history, ...all]) {
          if (seen.has(order.id)) continue;
          seen.add(order.id);
          merged.push(order);
        }
        merged.sort((a, b) => b.id - a.id);

        const window = dateWindow(dateFilter);
        setRows(
          merged.filter((order) => {
            if (!matchesSearch(order, debouncedSearch)) return false;
            if (!window) return true;
            const day = orderDay(order);
            return day >= window.from && day <= window.to;
          }),
        );
      } catch (err) {
        if (run !== runId.current) return;
        setError(messageFrom(err, "Could not load production orders."));
        setRows([]);
      } finally {
        if (run === runId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [canView, canApprove, status, company, dateFilter, debouncedSearch],
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
    canView,
    canApprove,
  };
}

export default useProductionTracking;
