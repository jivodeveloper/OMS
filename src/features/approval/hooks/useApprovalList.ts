import { useCallback, useEffect, useMemo, useState } from "react";
import { approvalRequests } from "../data/approvalRequests";
import type {
  ApprovalListState,
  ApprovalRequest,
  ApprovalStatusFilter,
} from "../types";

/** Mimics network latency so the skeleton/refresh states are actually visible. */
const FAKE_LATENCY_MS = 800;

/**
 * Owns everything the Approval list screen needs: fetch lifecycle, filters and
 * refresh. Keeping it here means the screen stays presentational, and swapping
 * the dummy source for a real query later touches only this file.
 */
export function useApprovalList(): ApprovalListState {
  const [data, setData] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApprovalStatusFilter>("All");

  const load = useCallback((mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    // Stands in for the API call. The timer id is returned so the caller can
    // cancel it if the screen unmounts mid-flight.
    return setTimeout(() => {
      setData(approvalRequests);
      setLoading(false);
      setRefreshing(false);
    }, FAKE_LATENCY_MS);
  }, []);

  useEffect(() => {
    const timer = load("initial");
    return () => clearTimeout(timer);
  }, [load]);

  const onRefresh = useCallback(() => {
    load("refresh");
  }, [load]);

  const retry = useCallback(() => {
    load("initial");
  }, [load]);

  // Filtering is derived, never stored — status and search can change
  // independently without the two falling out of sync.
  const requests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((request) => {
      if (status !== "All" && request.status !== status) return false;
      if (!term) return true;
      return (
        request.requestNo.toLowerCase().includes(term) ||
        request.party.toLowerCase().includes(term)
      );
    });
  }, [data, search, status]);

  return {
    requests,
    loading,
    refreshing,
    error,
    search,
    status,
    setSearch,
    setStatus,
    onRefresh,
    retry,
  };
}
