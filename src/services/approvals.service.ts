import { api } from "./api";

/**
 * Approval requests API.
 *
 * Mirrors the DRF serializers under /api/approvals/. The list screens filter by
 * `document_type` so a payment approver is never shown deposits.
 */

export type ApiRequestStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type ApiDocumentType = "PAYMENT" | "DEPOSIT" | "ORDER";

export interface ApiApprovalAction {
  id: number;
  sequence: number;
  round_number: number;
  level: number;
  level_name: string;
  action: string;
  action_display: string;
  remarks: string;
  approver: number | null;
  approver_username: string;
  approver_role: string;
  acted_at: string;
}

export interface ApiApprovalRequest {
  id: number;
  workflow: number;
  workflow_code: string;
  document_type: ApiDocumentType;
  company: string;
  amount: string;
  document_number: string;
  status: ApiRequestStatus;
  status_display: string;
  current_level: number;
  total_levels: number;
  level_label: string;
  round_number: number;
  submitted_by: number | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  level_entered_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ApiApprovalDetail extends ApiApprovalRequest {
  actions: ApiApprovalAction[];
  /** Server-computed: may THIS user act on THIS request right now. */
  can_act: boolean;
}

const unwrap = <T>(body: any): T =>
  body && typeof body === "object" && "data" in body ? body.data : body;

const rows = <T>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

export interface ListFilters {
  document_type?: ApiDocumentType;
  status?: ApiRequestStatus;
  company?: string;
}

export const approvalsService = {
  /**
   * Requests visible to the caller.
   *
   * Never cached: an approval decision made seconds ago must not be hidden
   * behind a stale list.
   */
  list: async (filters: ListFilters = {}): Promise<ApiApprovalRequest[]> => {
    const query = new URLSearchParams();
    if (filters.document_type) query.append("document_type", filters.document_type);
    if (filters.status) query.append("status", filters.status);
    if (filters.company) query.append("company", filters.company);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await api.get(`/approvals/requests/${suffix}`, undefined, {
      cache: "no-store",
    });
    return rows<ApiApprovalRequest>(res);
  },

  /** Only what awaits THIS user's decision. */
  inbox: async (): Promise<ApiApprovalRequest[]> => {
    const res = await api.get("/approvals/inbox/", undefined, {
      cache: "no-store",
    });
    return rows<ApiApprovalRequest>(res);
  },

  detail: async (id: number): Promise<ApiApprovalDetail> => {
    const res = await api.get(`/approvals/requests/${id}/`, undefined, {
      cache: "no-store",
    });
    return unwrap<ApiApprovalDetail>(res);
  },

  /** Approve / reject / cancel. Remarks are MANDATORY when rejecting. */
  act: async (
    id: number,
    decision: "APPROVE" | "REJECT" | "CANCEL",
    remarks = "",
  ): Promise<ApiApprovalDetail> => {
    const res = await api.post(`/approvals/requests/${id}/act/`, {
      decision,
      remarks,
    });
    return unwrap<ApiApprovalDetail>(res);
  },
};

export default approvalsService;
