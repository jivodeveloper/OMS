import { useCallback, useEffect, useState } from "react";

import type { DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";
import {
  creditLimitError,
  creditLimitService,
  type CreditLimitCompany,
  type CreditLimitCustomer,
  type CreditLimitParty,
  type CreditLimitRequest,
  type CreditLimitStatus,
} from "@/src/services/creditLimit.service";

/**
 * The lists and lookups the Credit Limit screens read.
 *
 * Each one is the SAME endpoint the web client reads, with the same
 * parameters, so a list here holds what the web's holds. The hooks are the
 * app's own — the web uses react-query, this app reads on focus — and they
 * never throw: a failure becomes `error`, because a list screen with a
 * sentence on it is better than a screen that is not there.
 */

/** Which side of the module a list is showing. */
export type CreditLimitScope = "mine" | "desk";

export interface CreditLimitFilters {
  company: CreditLimitCompany | "";
  status: CreditLimitStatus | "";
  search: string;
}

export const NO_FILTERS: CreditLimitFilters = { company: "", status: "", search: "" };

/**
 * The day, month or year a date filter covers, as local `YYYY-MM-DD` bounds.
 *
 * COPIED FROM `useAdvanceRequests`, deliberately: the same shared control sits
 * on this list's count bar, and a control that behaved differently on two
 * lists in one app would be the app's bug rather than the user's mistake.
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
const raisedOn = (request: CreditLimitRequest): string => {
  const when = new Date(request.created_at);
  if (Number.isNaN(when.getTime())) return "";
  return [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");
};

/**
 * One list of requests: the ones this user raised, or the ones waiting on
 * them.
 *
 * THE DESK'S TWO LISTS ARE ONE QUESTION. "Waiting on me" and "what I have
 * decided" are different endpoints on the server (`approvals/queue/` and
 * `approvals/history/`), and which one to read follows from the status filter:
 * Pending is the queue, anything else is the history. The requester's side has
 * one endpoint that takes both filters.
 */
export function useCreditLimitRequests(scope: CreditLimitScope) {
  const [rows, setRows] = useState<CreditLimitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<CreditLimitFilters>({
    ...NO_FILTERS,
    // Opens on what is waiting, on both sides: a finished request is a record,
    // and nobody arrives at a queue to read records.
    status: "PENDING",
  });
  /**
   * THE DATE IS NOT A SERVER FILTER. The endpoint takes company and status
   * only, so the day is applied to what arrived — the same as on the advance
   * payments list, where the control also sits on the count bar.
   */
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError("");
      try {
        const options = { company: filters.company, status: filters.status };
        if (scope === "mine") {
          setRows(await creditLimitService.listRequests(options));
        } else if (filters.status === "PENDING" || filters.status === "") {
          // The queue holds only what is pending, so "All" on the desk means
          // the queue plus what this user has already decided.
          const [queue, decided] = await Promise.all([
            creditLimitService.approvalQueue({ company: filters.company }),
            filters.status === ""
              ? creditLimitService.approvalHistory({ company: filters.company })
              : Promise.resolve([] as CreditLimitRequest[]),
          ]);
          const seen = new Set(queue.map((row) => row.id));
          setRows([...queue, ...decided.filter((row) => !seen.has(row.id))]);
        } else {
          setRows(await creditLimitService.approvalHistory(options));
        }
      } catch (err) {
        setError(creditLimitError(err));
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope, filters.company, filters.status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The search narrows what arrived, by the three things somebody has in hand:
   * the request's number, the customer, and who raised it.
   */
  const term = filters.search.trim().toLowerCase();
  const window = dateWindow(dateFilter);
  const shown = rows.filter((row) => {
    if (window) {
      const day = raisedOn(row);
      if (!(day >= window.from && day <= window.to)) return false;
    }
    if (!term) return true;
    return [String(row.id), row.card_code, row.card_name, row.created_by_username, row.company]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  return {
    rows: shown,
    total: rows.length,
    loading,
    refreshing,
    error,
    filters,
    dateFilter,
    setDateFilter,
    /** What the Filter button's dot is counting: the narrowing not on screen. */
    activeFilterCount:
      (filters.company ? 1 : 0) + (filters.status ? 1 : 0) + (dateFilter ? 1 : 0),
    patchFilters: (patch: Partial<CreditLimitFilters>) =>
      setFilters((current) => ({ ...current, ...patch })),
    clearFilters: () => {
      setFilters(NO_FILTERS);
      setDateFilter(null);
    },
    onRefresh: () => {
      setRefreshing(true);
      void load(true);
    },
    reload: () => load(true),
  };
}

/** One request, re-read on demand. */
export function useCreditLimitRequest(id: number) {
  const [request, setRequest] = useState<CreditLimitRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (quiet = false) => {
      if (!Number.isFinite(id)) {
        setError("Missing request reference.");
        setLoading(false);
        return;
      }
      if (!quiet) {
        // Cleared as well as spun: this screen is reached from a card and
        // stays mounted, so opening a second request would otherwise show the
        // first one's figures under the new one's number.
        setRequest(null);
        setLoading(true);
      }
      setError("");
      try {
        setRequest(await creditLimitService.getRequest(id));
      } catch (err) {
        setError(creditLimitError(err));
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { request, setRequest, loading, error, reload: load };
}

/** What was done to a request, and the stages it has still to pass. */
export function useCreditLimitHistory(id: number) {
  const [actions, setActions] = useState<Awaited<
    ReturnType<typeof creditLimitService.history>
  >["actions"]>([]);
  const [stages, setStages] = useState<Awaited<
    ReturnType<typeof creditLimitService.history>
  >["stages"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setError("");
    try {
      const found = await creditLimitService.history(id);
      setActions(found.actions ?? []);
      setStages(found.stages ?? []);
    } catch (err) {
      setError(creditLimitError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { actions, stages, loading, error, reload: load };
}

/**
 * The company's parties, and the customer SAP holds for the chosen one.
 *
 * TWO READS, NOT ONE, and deliberately: the synced party table answers "which
 * customer" and can be stale, so the balance and the current limit are read
 * LIVE once a party is picked. That is the pair the request is about, and a
 * stale one would be snapshotted onto the request at submission.
 */
export function useCustomerLookup(company: CreditLimitCompany) {
  const [parties, setParties] = useState<CreditLimitParty[]>([]);
  const [partiesError, setPartiesError] = useState("");
  const [loadingParties, setLoadingParties] = useState(false);

  const [customer, setCustomer] = useState<CreditLimitCustomer | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoadingParties(true);
    setPartiesError("");
    creditLimitService
      .parties(company)
      .then((found) => {
        if (alive) setParties(found);
      })
      .catch((err) => {
        if (alive) {
          setPartiesError(creditLimitError(err));
          setParties([]);
        }
      })
      .finally(() => {
        if (alive) setLoadingParties(false);
      });
    return () => {
      alive = false;
    };
  }, [company]);

  /** Read one customer live. Clears what was there, so a failure shows no stale facts. */
  const lookUp = useCallback(
    async (cardCode: string) => {
      setCustomer(null);
      setLookupError("");
      if (!cardCode) return;
      setLookingUp(true);
      try {
        setCustomer(await creditLimitService.customer(company, cardCode));
      } catch (err) {
        setLookupError(creditLimitError(err));
      } finally {
        setLookingUp(false);
      }
    },
    [company],
  );

  /** A company change invalidates both: the party list and whoever was picked. */
  useEffect(() => {
    setCustomer(null);
    setLookupError("");
  }, [company]);

  return {
    parties,
    partiesError,
    loadingParties,
    customer,
    lookingUp,
    lookupError,
    lookUp,
  };
}
