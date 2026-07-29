import { useCallback, useEffect, useRef, useState } from "react";
import { approvalDetail } from "../data/approvalDetail";
import type {
  ApprovalDecision,
  ApprovalDetail,
  ApprovalDialogStage,
} from "../types";

/** Mimics network latency so the skeleton/refresh states are actually visible. */
const FAKE_LATENCY_MS = 800;
/** How long the loading dialog holds before the success dialog takes over. */
const DECISION_DELAY_MS = 2400;

interface UseApprovalDetailsResult {
  detail: ApprovalDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  stage: ApprovalDialogStage;
  decision: ApprovalDecision;
  onRefresh: () => void;
  retry: () => void;
  openApprove: () => void;
  openReject: () => void;
  closeDialog: () => void;
  /** Runs the confirm → loading → success sequence for either decision. */
  submitDecision: (decision: ApprovalDecision, remarks: string) => void;
}

/**
 * Owns the details screen's data lifecycle and its approve/reject dialog
 * machine. Keeping the stage here means the screen just renders whichever
 * dialog `stage` names, and swapping dummy data for a real mutation later
 * touches only this file.
 */
export function useApprovalDetails(
  /** Optional request number passed from the list; dummy data ignores it. */
  requestNo?: string,
): UseApprovalDetailsResult {
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ApprovalDialogStage>("none");
  const [decision, setDecision] = useState<ApprovalDecision>("approve");

  // Tracked so an in-flight decision timer can be cancelled on unmount.
  const decisionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      // Stands in for the API call.
      return setTimeout(() => {
        setDetail({ ...approvalDetail, ...(requestNo ? { requestNo } : {}) });
        setLoading(false);
        setRefreshing(false);
      }, FAKE_LATENCY_MS);
    },
    [requestNo],
  );

  useEffect(() => {
    const timer = load("initial");
    return () => clearTimeout(timer);
  }, [load]);

  // Any pending decision timer must not fire after the screen goes away.
  useEffect(
    () => () => {
      if (decisionTimer.current) clearTimeout(decisionTimer.current);
    },
    [],
  );

  const onRefresh = useCallback(() => {
    load("refresh");
  }, [load]);

  const retry = useCallback(() => {
    load("initial");
  }, [load]);

  const openApprove = useCallback(() => {
    setDecision("approve");
    setStage("approve");
  }, []);

  const openReject = useCallback(() => {
    setDecision("reject");
    setStage("reject");
  }, []);

  const closeDialog = useCallback(() => {
    // The loading dialog is deliberately not dismissable — bail out rather than
    // letting a stray backdrop tap interrupt a decision mid-flight.
    setStage((prev) => (prev === "loading" ? prev : "none"));
  }, []);

  const submitDecision = useCallback(
    (nextDecision: ApprovalDecision, remarks: string) => {
      setDecision(nextDecision);
      setStage("loading");

      // UI-only: the remark would be posted with the decision here.
      if (__DEV__) {
        console.log(`[approval] ${nextDecision}`, { remarks });
      }

      decisionTimer.current = setTimeout(() => {
        setStage("success");
      }, DECISION_DELAY_MS);
    },
    [],
  );

  return {
    detail,
    loading,
    refreshing,
    error,
    stage,
    decision,
    onRefresh,
    retry,
    openApprove,
    openReject,
    closeDialog,
    submitDecision,
  };
}
