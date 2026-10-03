import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import { can } from "@/src/constants/permissions";
import { useAuth } from "@/src/context/AuthContext";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import {
  advancePaymentError,
  advancePaymentService,
  type ApiRequest,
} from "@/src/services/advancePayment.service";


import type { AdvanceRequestEntry } from "../logic/approvalData";
import { fromApiRequest } from "../logic/requestApi";
import {
  NO_FILTERS,
  deskBucket,
  filterRequests,
  requestCounts,
  type DeskFilter,
  type RequestFilterState,
  type StatusFilter,
} from "../logic/requestLabels";

/**
 * The list's own filter state.
 *
 * `status` is WIDER than the shared logic's, because the two sides mean
 * different things by it: a requester's is the document's status, an approver's
 * is what they themselves did (`DeskFilter`). Both come from the shared
 * module, which the web client's desk filters by the same way; only this union
 * is the app's, because one control on one screen selects either.
 */
export interface ListFilterState extends Omit<RequestFilterState, "status"> {
  status: StatusFilter | DeskFilter;
}

/**
 * The day or month a date filter covers, as local `YYYY-MM-DD` bounds.
 *
 * The same shape Payment Tracking and BackDate use, so the shared date control
 * behaves identically on all three lists.
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
const raisedOn = (entry: AdvanceRequestEntry): string => {
  const d = new Date(entry.requestedOn);
  if (Number.isNaN(d.getTime())) return "";
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

/** Which side of the module a list is showing. */
export type RequestListScope = "mine" | "desk";

/**
 * Every Advance Payment request this user is entitled to see.
 *
 * TWO SOURCES, BOUNDED BY PERMISSION — the same two the web client reads:
 *
 *   * `Advance_Payment`          -> the requests this user raised (`?scope=mine`)
 *   * `Advance_Payment_Approval` -> their desk (`?scope=desk`)
 *
 * `want` picks one of them, which is how somebody holding BOTH keys gets two
 * separate pages — their own requests, and the desk — instead of one merged
 * list where a request they raised and a request awaiting their decision look
 * alike. Left out, both are read and merged, which is right for a user with one
 * key and for any caller that wants the whole picture.
 *
 * A SCOPE THE USER CANNOT READ IS NOT ASKED FOR. The server answers 403 on
 * `desk` without the approval key, so asking anyway would turn an ordinary
 * "you have no requests" into an error; whichever scope they do hold is used
 * instead.
 *
 * WHEN A REQUEST IS IN BOTH, THE DESK COPY WINS. Only the desk's copy carries
 * `flow.awaiting_me` and the `can` abilities for an approver, and those decide
 * which buttons the details screen offers. Letting the requester's copy win
 * would silently turn a request awaiting this user into a read-only one for
 * anybody who both raises and approves.
 *
 * The filtering and the KPI counts come from the shared logic module, so the
 * two clients count the same requests the same way.
 */
export function useAdvanceRequests(want?: RequestListScope) {
  const { user } = useAuth();
  const holdsMine = can(user, "Advance_Payment");
  const holdsDesk = can(user, "Advance_Payment_Approval");
  const canRaise = holdsMine && want !== "desk";
  const canApprove = holdsDesk && want !== "mine";

  const [entries, setEntries] = useState<AdvanceRequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  /**
   * OPENS ON PENDING, as every other list in this app does.
   *
   * The list is overwhelmingly finished requests, and neither side arrives
   * wanting those: a requester is chasing what has not moved, an approver is
   * looking for what is waiting on them. "Pending" means a different thing on
   * each side — the document's status on one, this user's own on the other —
   * which is why it is taken from the scope the list opened on.
   */
  const [filters, setFilters] = useState<ListFilterState>({
    ...NO_FILTERS,
    // "PENDING" on both sides now, and it still means two different things:
    // the document is pending, or it is pending AT THIS USER'S STAGE.
    status: "PENDING",
  });
  /**
   * Applied HERE, not sent to the server: the two scopes accept no date filter,
   * so asking for one would narrow neither list. The lists are unpaginated
   * (the server caps at 300), so narrowing locally gives the same answer.
   */
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);

  const runId = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      const run = ++runId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        // Only what this user may read, and only the side this page is for —
        // except when that leaves nothing, in which case the other side is
        // what they came to see.
        const readMine = want === "desk" ? false : holdsMine;
        const readDesk = want === "mine" ? !holdsMine && holdsDesk : holdsDesk;
        const [mine, desk] = await Promise.all([
          readMine
            ? advancePaymentService.requests("mine")
            : Promise.resolve([] as ApiRequest[]),
          readDesk
            ? advancePaymentService.requests("desk")
            : Promise.resolve([] as ApiRequest[]),
        ]);
        if (run !== runId.current) return;

        // Desk first, so its copy wins the de-duplication below.
        const seen = new Set<number>();
        const merged: AdvanceRequestEntry[] = [];
        for (const request of [...desk, ...mine]) {
          if (seen.has(request.id)) continue;
          seen.add(request.id);
          merged.push(fromApiRequest(request));
        }
        merged.sort((a, b) => b.serverId - a.serverId);
        setEntries(merged);
      } catch (err) {
        if (run !== runId.current) return;
        setError(advancePaymentError(err));
        setEntries([]);
      } finally {
        if (run === runId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [want, holdsMine, holdsDesk],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Returning from a details screen where something was approved, returned or
  // edited. Refreshes in place, so the rows stay visible.
  useRefreshOnFocus(() => load(true));

  const inWindow = useCallback(
    (list: AdvanceRequestEntry[]) => {
      const window = dateWindow(dateFilter);
      if (!window) return list;
      return list.filter((entry) => {
        const day = raisedOn(entry);
        return day >= window.from && day <= window.to;
      });
    },
    [dateFilter],
  );

  /**
   * The KPI cards count the company- and search-narrowed list, but NOT the
   * status filter — a card the user has selected must not read 0 because it is
   * the one selected.
   */
  const counts = useMemo(
    () => requestCounts(inWindow(filterRequests(entries, { ...filters, status: "" }))),
    [entries, filters, inWindow],
  );

  /**
   * ON THE DESK THE STATUS MEANS SOMETHING ELSE.
   *
   * A requester's list is filtered on what the REQUEST is — pending, approved,
   * rejected. An approver's is filtered on what THEY did with it, because a
   * request they approved at stage 1 stays "pending" as a document for as long
   * as the rest of the route runs, and it has no business sitting in their
   * pending list while it does. `deskBucket` makes that distinction; the search
   * and the company narrow both lists the same way.
   */
  const rows = useMemo(() => {
    const narrowed = inWindow(
      filterRequests(entries, {
        ...filters,
        // The desk narrows below, on what this user did; the document's own
        // status is not asked of it.
        status: want === "desk" ? "" : (filters.status as StatusFilter),
      }),
    );
    return want === "desk"
      ? filterRequests(narrowed, { ...filters, status: filters.status as DeskFilter }, deskBucket)
      : narrowed;
  }, [entries, filters, inWindow, want]);

  return {
    rows,
    counts,
    loading,
    refreshing,
    error,
    filters,
    setFilters,
    patchFilters: (patch: Partial<ListFilterState>) =>
      setFilters((current) => ({ ...current, ...patch })),
    clearFilters: () => {
      setFilters(NO_FILTERS);
      setDateFilter(null);
    },
    dateFilter,
    setDateFilter,
    activeFilterCount:
      (filters.company ? 1 : 0) + (filters.status ? 1 : 0) + (dateFilter ? 1 : 0),
    onRefresh: () => load(true),
    reload: () => load(),
    canRaise,
    canApprove,
    /** The KEYS, whatever this page is scoped to — the switch needs both. */
    holdsMine,
    holdsDesk,
  };
}

export default useAdvanceRequests;
