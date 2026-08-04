import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import approvalsService, {
  type ApiApprovalRequest,
  type ApiDocumentType,
} from "@/src/services/approvals.service";
import type {
  ApprovalListState,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalStatusFilter,
  ApprovalTag,
  ApprovalType,
} from "../types";

/** API status -> the three the UI renders. */
const STATUS_MAP: Record<string, ApprovalStatus> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  // A cancelled request reads as rejected to an approver — it is closed and
  // needs no action either way.
  CANCELLED: "Rejected",
  DRAFT: "Pending",
};

const TYPE_MAP: Record<string, ApprovalType> = {
  PAYMENT: "Payment Approval",
  DEPOSIT: "Bank Deposit Approval",
  ORDER: "Invoice Approval",
};

const TAGS_MAP: Record<string, ApprovalTag[]> = {
  PAYMENT: ["Payment"],
  DEPOSIT: ["Deposit", "Bank"],
  ORDER: ["Invoice"],
};

const DOC_LABEL: Record<string, string> = {
  PAYMENT: "Payment",
  DEPOSIT: "Deposit",
  ORDER: "Invoice",
};

/** "28 Jul 2026, 09:10 AM" — what the card renders. */
const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** API shape -> the shape the cards already render. */
const toCard = (row: ApiApprovalRequest): ApprovalRequest => ({
  id: String(row.id),
  requestNo: row.document_number || `REQ-${row.id}`,
  type: TYPE_MAP[row.document_type] ?? "Payment Approval",
  // The list endpoint carries no party name, so the document number stands in.
  // The detail screen loads the full document.
  party: row.document_number || `Request ${row.id}`,
  company: row.company,
  amount: Number(row.amount) || 0,
  status: STATUS_MAP[row.status] ?? "Pending",
  createdBy: row.submitted_by_name || "—",
  createdDate: formatDateTime(row.submitted_at || row.created_at),
  level: row.level_label,
  invoiceType: DOC_LABEL[row.document_type] ?? row.document_type,
  tags: TAGS_MAP[row.document_type] ?? [],
});

const toApiStatus = (status: ApprovalStatusFilter) => {
  if (status === "Pending") return "PENDING" as const;
  if (status === "Approved") return "APPROVED" as const;
  if (status === "Rejected") return "REJECTED" as const;
  return undefined;
};

/**
 * Owns everything an Approval list screen needs: fetch lifecycle, filters and
 * refresh.
 *
 * `documentType` scopes the queue — a payment approver must never be shown
 * deposits they cannot act on, so the filter is applied SERVER-side rather than
 * by hiding rows after they have already been fetched.
 */
export function useApprovalList(
  documentType?: ApiDocumentType,
): ApprovalListState {
  const [data, setData] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApprovalStatusFilter>("All");

  // Guards a slow earlier response from overwriting a newer one, and stops a
  // state update landing after unmount.
  const runId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++runId.current;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const rows = await approvalsService.list({
          document_type: documentType,
          status: toApiStatus(status),
        });
        if (!alive.current || id !== runId.current) return;
        setData(rows.map(toCard));
      } catch (err) {
        if (!alive.current || id !== runId.current) return;
        const anyErr = err as { response?: { status?: number } };
        setError(
          anyErr?.response?.status === 403
            ? "You do not have permission to view these requests."
            : "Could not load requests. Pull down to try again.",
        );
        setData([]);
      } finally {
        if (alive.current && id === runId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [documentType, status],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  const retry = useCallback(() => {
    void load("initial");
  }, [load]);

  // Search filters locally over what the server returned; status is a server
  // filter (above), so the two never fall out of sync.
  const requests = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (request) =>
        request.requestNo.toLowerCase().includes(term) ||
        request.party.toLowerCase().includes(term) ||
        request.createdBy.toLowerCase().includes(term),
    );
  }, [data, search]);

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
