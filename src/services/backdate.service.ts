import { api } from "./api";

/**
 * BackDate (BKDT) API — temporary back-posting rights in SAP.
 *
 * Mirrors the DRF serializers under `/api/backdate/`. The types here are the
 * same shapes the web client uses (`OMS-Frontend/src/services/backdateService.ts`);
 * keeping them identical is what stops the two clients drifting into different
 * ideas of one request.
 *
 * TWO KEYS, AND THEY ARE NOT INTERCHANGEABLE
 * ------------------------------------------
 * `BackDate` raises requests; `BackDate_Approval` opens the approval desk.
 * Holding the approval key is NOT sufficient to approve a given request — the
 * server also requires the caller to be the current stage's effective user, so
 * the only honest answer to "may I act on this?" is whether it came back from
 * `approvals/queue/`.
 *
 * Note `sap-users/` and `document-types/` are gated on `BackDate` ALONE. An
 * approver-only user editing a refused request will get 403 from both, which is
 * expected — the form falls back to free text rather than blocking the edit.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type BackDateCompany = "OIL" | "BEVERAGES" | "MART";
export const BACKDATE_COMPANIES: BackDateCompany[] = [
  "OIL",
  "BEVERAGES",
  "MART",
];

export type BackDateAction = "A" | "U";
/** `"A,U"` is ONE request with both actions, never two requests. */
export type BackDateActionValue = BackDateAction | "A,U";

export type BackDateFlowStatus = "PENDING" | "APPROVED" | "REJECTED";
export type BackDateHanaStatus = "SUCCESS" | "FAILED" | null;

/** One `OPEN_BKDT` call's outcome, as SAP answered it. */
export interface BackDateSapResult {
  branch: string;
  status: "SUCCESS" | "FAILED";
  /** SAP's own words. On a refusal this is the only thing that says why. */
  response: string;
  /** The id written onto the SAP row, where it could be written. */
  sap_row_id?: number | null;
}

export interface BackDateFlow {
  id: number;
  backdate: number;
  status: BackDateFlowStatus;
  hana_status: BackDateHanaStatus;
  sap_payload: { calls: unknown[] } | null;
  /** Exactly what SAP said, as JSON. Parse with `parseSapResults`. */
  hana_status_text: string;
  workflow: number;
  workflow_code: string;
  current_user: number | null;
  current_user_username: string;
  effective_user_username: string;
  has_active_replacement: boolean;
  /** `workflow_stages.id`, or null once the flow is finished. */
  current_stage: number | null;
  current_stage_name: string;
  current_stage_sequence: number | null;
  /** Stages the chosen workflow had at submission — "stage 2 of 3". */
  total_stage: number;
  created_at: string;
  updated_at: string;
}

export interface BackDateRequest {
  id: number;
  /** ONE company. A request is routed by it and written to its SAP schema. */
  company: BackDateCompany;
  company_label: string;
  companies: BackDateCompany[];
  /** The SAP user being granted rights — not the OMS user who asked. */
  sap_username: string;
  /** THE document identity: the SAP object name, e.g. "A/R Invoice". */
  document_type_name: string;
  from_date: string;
  to_date: string;
  time_limit: string;
  action: BackDateActionValue;
  action_label: string;
  created_by: number;
  created_by_username: string;
  created_at: string;
  updated_at: string;
  flow: BackDateFlow | null;
  /**
   * Whether THIS caller may edit THIS request right now, decided by the
   * server. Never re-derived here: the rule involves who holds the stage and
   * whether SAP refused the grant, and a second copy would drift and offer a
   * control that 403s.
   */
  can_edit: boolean;
}

/** One field an edit changed. */
export interface BackDateFieldChange {
  old: string | number | null;
  new: string | number | null;
}

export interface BackDateActionRow {
  id: number;
  backdate: number;
  action: "CREATE" | "UPDATE" | "APPROVE" | "REJECT";
  action_label: string;
  /** `workflow_stages.id`; null for CREATE and UPDATE. */
  stage: number | null;
  stage_name: string;
  acted_by: number | null;
  acted_by_username: string;
  /** Event-specific: the reason for THIS event, by THIS person. */
  remarks: string;
  /** Set on UPDATE rows only: the changed fields, old and new. */
  action_data: Record<string, BackDateFieldChange> | null;
  acted_at: string;
}

export interface BackDateStageProgress {
  stage_id: number;
  sequence: number;
  stage_name: string;
  status: "APPROVED" | "REJECTED" | "AWAITING" | "UPCOMING" | "SKIPPED";
  reviewer: string;
  configured_reviewer: string;
  has_active_replacement: boolean;
  acted_by: string;
  acted_at: string | null;
  remarks: string;
}

export interface BackDateHistory {
  actions: BackDateActionRow[];
  stages: BackDateStageProgress[];
}

export interface BackDateInsights {
  pending: number;
  approved: number;
  rejected: number;
  /** Approved AND the rights reached SAP — a SUBSET of `approved`. */
  completed: number;
  /** `pending + approved + rejected`. Never sum the four cards. */
  total: number;
}

export interface SapUser {
  user_id: number;
  user_code: string;
}

export interface SapDocumentType {
  object_type: number;
  name: string;
}

export interface DecisionResult {
  flow_id: number;
  flow_status: BackDateFlowStatus;
  current_stage?: number | null;
  current_user?: number | null;
  hana_status?: BackDateHanaStatus;
  hana_status_text?: string;
  hana_applied?: boolean | null;
}

export interface NewBackDateRequest {
  company: BackDateCompany;
  sap_username: string;
  /** THE document identity — the SAP object name. */
  document_type_name: string;
  from_date: string;
  to_date: string;
  /**
   * REQUIRED, and an INSTANT (`Date.toISOString()`), never a wall clock.
   *
   * SAP only honours a grant while `CURRENT_TIMESTAMP < timeLimit`, so an
   * expiry that lands in the wrong timezone is a grant that lapses at the
   * wrong moment. A zoneless string is read as UTC by the server.
   */
  time_limit: string;
  action: BackDateActionValue;
  /** Write-only: becomes the CREATE (or UPDATE) action-log remark. */
  remarks?: string;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * A failed BackDate call.
 *
 * `src/services/api.ts` DOES NOT THROW — it resolves with
 * `{success: false, message, status, errors}` on any non-2xx. Every caller
 * here goes through `guard()` so failures arrive as exceptions with the status
 * intact, which is what makes the 502 branch below reliable.
 *
 * Do not copy the `err.response.status` idiom from the payments hooks: that is
 * an axios shape this client never produces, and reading it silently yields
 * `undefined` for every error.
 */
export class BackDateApiError extends Error {
  status?: number;
  errors?: Record<string, unknown>;
  /** Present on a 502 from `approve/` — what SAP refused, and why. */
  sap?: {
    hana_status: BackDateHanaStatus;
    hana_status_text: string;
    sap_payload: unknown;
  };

  constructor(message: string) {
    super(message);
    this.name = "BackDateApiError";
  }
}

/** Throw on a failed response; otherwise hand the body back untouched. */
function guard(res: any): any {
  const failed =
    res == null ||
    res.success === false ||
    (typeof res.status === "number" && (res.status < 200 || res.status >= 300));
  if (!failed) return res;

  const error = new BackDateApiError(
    res?.message || "The request could not be completed.",
  );
  error.status = typeof res?.status === "number" ? res.status : undefined;
  error.errors = res?.errors;
  // The approval endpoint puts the SAP detail here when it returns 502.
  if (res?.errors?.sap) error.sap = res.errors.sap;
  return Promise.reject(error);
}

const unwrap = <T,>(body: any): T =>
  body && typeof body === "object" && "data" in body ? body.data : body;

const rows = <T,>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

/**
 * `hana_status_text` as the per-branch list it is.
 *
 * Falls back to the raw text rather than hiding it: an operator needs whatever
 * SAP said even when it does not parse. The fallback takes its status from the
 * FLOW — older rows store a plain sentence, and assuming "FAILED" for those
 * printed a red failure beside a green success on requests that had in fact
 * worked.
 */
export function parseSapResults(
  text: string | undefined,
  flowStatus: BackDateHanaStatus,
): BackDateSapResult[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { results?: BackDateSapResult[] };
    if (Array.isArray(parsed.results) && parsed.results.length > 0) {
      return parsed.results;
    }
  } catch {
    // Not JSON — an older row, or a message from somewhere else.
  }
  return [
    {
      branch: "SAP",
      status: flowStatus === "FAILED" ? "FAILED" : "SUCCESS",
      response: text,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.append(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** Anything that reads state is `no-store`: a stale queue shows a decision
 *  the user already made. Only the two SAP master lists are cached, by the
 *  allowlist in `src/cache/policy.ts`. */
const FRESH = { cache: "no-store" } as const;

export const backdateService = {
  /* --- SAP master data (cached; needs the `BackDate` key) ---------- */
  sapUsers: async (company: BackDateCompany): Promise<SapUser[]> =>
    rows<SapUser>(guard(await api.get(`/backdate/sap-users/${query({ company })}`))),

  documentTypes: async (
    company: BackDateCompany,
  ): Promise<SapDocumentType[]> =>
    rows<SapDocumentType>(
      guard(await api.get(`/backdate/document-types/${query({ company })}`)),
    ),

  /* --- the requester's own requests -------------------------------- */
  listRequests: async (filters: {
    status?: string;
    company?: string;
    search?: string;
    month?: string;
  } = {}): Promise<BackDateRequest[]> =>
    rows<BackDateRequest>(
      guard(await api.get(`/backdate/requests/${query(filters)}`, undefined, FRESH)),
    ),

  getRequest: async (id: number): Promise<BackDateRequest> =>
    unwrap<BackDateRequest>(
      guard(await api.get(`/backdate/requests/${id}/`, undefined, FRESH)),
    ),

  createRequest: async (body: NewBackDateRequest): Promise<BackDateRequest> =>
    unwrap<BackDateRequest>(guard(await api.post("/backdate/requests/", body))),

  updateRequest: async (
    id: number,
    body: Partial<NewBackDateRequest>,
  ): Promise<BackDateRequest> =>
    unwrap<BackDateRequest>(
      guard(await api.patch(`/backdate/requests/${id}/`, body)),
    ),

  history: async (id: number): Promise<BackDateHistory> =>
    unwrap<BackDateHistory>(
      guard(await api.get(`/backdate/requests/${id}/history/`, undefined, FRESH)),
    ),

  insights: async (filters: { company?: string; month?: string } = {}):
    Promise<BackDateInsights> =>
    unwrap<BackDateInsights>(
      guard(await api.get(`/backdate/insights/${query(filters)}`, undefined, FRESH)),
    ),

  /* --- the approval desk ------------------------------------------- */
  /** What is awaiting THIS user right now — the only source of the right to act. */
  approvalQueue: async (filters: { company?: string; search?: string } = {}):
    Promise<BackDateRequest[]> =>
    rows<BackDateRequest>(
      guard(await api.get(`/backdate/approvals/queue/${query(filters)}`, undefined, FRESH)),
    ),

  /** What this user has already decided. */
  approvalHistory: async (filters: {
    status?: string;
    company?: string;
    search?: string;
  } = {}): Promise<BackDateRequest[]> =>
    rows<BackDateRequest>(
      guard(await api.get(`/backdate/approvals/history/${query(filters)}`, undefined, FRESH)),
    ),

  approvalInsights: async (filters: { company?: string; search?: string } = {}):
    Promise<BackDateInsights> =>
    unwrap<BackDateInsights>(
      guard(await api.get(`/backdate/approvals/insights/${query(filters)}`, undefined, FRESH)),
    ),

  /**
   * Approve the current stage.
   *
   * On the LAST stage this calls SAP synchronously and can take seconds. A
   * refusal comes back as a 502 `BackDateApiError` carrying `.sap` — and it
   * means NOTHING was approved: the request is still pending at the same
   * stage. It must never be reported as a generic failure.
   */
  approve: async (id: number, remarks = ""): Promise<DecisionResult> =>
    unwrap<DecisionResult>(
      guard(await api.post(`/backdate/requests/${id}/approve/`, { remarks })),
    ),

  /** Reject. A reason is REQUIRED — the server 400s on a blank one. */
  reject: async (id: number, remarks: string): Promise<DecisionResult> =>
    unwrap<DecisionResult>(
      guard(await api.post(`/backdate/requests/${id}/reject/`, { remarks })),
    ),
};

export default backdateService;
