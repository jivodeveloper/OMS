import { api } from "./api";

/**
 * PRDO (Production Order) API — approving what SAP has already planned.
 *
 * Mirrors the DRF serializers under `/api/production/`, and deliberately the
 * same shapes the web client uses
 * (`OMS-Frontend/src/services/productionService.ts`): keeping them identical
 * is what stops the two clients drifting into different ideas of one order.
 *
 * SAP IS THE POINT OF ORIGIN, AND THAT IS THE DESIGN
 * --------------------------------------------------
 * A planner raises the order in SAP B1; `manage.py sync_production_orders`
 * notices it; OMS routes it, decides it, and writes the decision back so SAP
 * can release it. OMS never creates, edits, cancels or closes a production
 * order — which is why there is no `create` and no `update` below. Their
 * absence is not an omission to be filled in later.
 *
 * TWO KEYS, AND THEY ARE NOT INTERCHANGEABLE
 * ------------------------------------------
 * `Production_Order` sees requests; `Production_Order_Approval` opens the
 * approval desk. Holding the approval key is NOT sufficient to decide a given
 * order — the server also requires the caller to be the current stage's
 * effective user, so the only honest answer to "may I act on this?" is whether
 * it came back from `approvals/queue/`.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ProductionCompany = "OIL" | "BEVERAGES" | "MART";
/**
 * Only OIL ships today — Beverages' JSAP templates are inactive and neither
 * it nor Mart gates production at all. The other two are listed so the filter
 * does not have to change when they are configured, which is one workflow row
 * and its stages.
 */
export const PRODUCTION_COMPANIES: ProductionCompany[] = [
  "OIL",
  "BEVERAGES",
  "MART",
];

/**
 * Where the approval got to.
 *
 * `OBSOLETE` is the one BackDate has no equivalent for: SAP moved the order
 * out of Planned before anybody decided it, so the question stopped being
 * asked. It is not a rejection and must never be coloured as one.
 */
export type ProductionFlowStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "OBSOLETE";

/** Whether the decision actually reached SAP. `null` until it is attempted. */
export type ProductionSapStatus = "SUCCESS" | "FAILED" | null;

/** `OWOR.Status`, as SAP spells it. Snapshotted by the sync, never set here. */
export type SapOrderStatus = "P" | "R" | "L" | "C";

export const SAP_ORDER_STATUS_LABEL: Record<SapOrderStatus, string> = {
  P: "Planned",
  R: "Released",
  L: "Closed",
  C: "Cancelled",
};

/** `OWOR.Type`. Only Standard is gated by SAP, and only Standard is synced. */
export type SapOrderType = "S" | "P" | "D";

export const SAP_ORDER_TYPE_LABEL: Record<SapOrderType, string> = {
  S: "Standard",
  P: "Special",
  D: "Disassembly",
};

/**
 * Where a request currently is.
 *
 * Everything naming a stage or a user is RESOLVED server-side from the
 * workflow's CURRENT configuration — nothing here is a stored copy. That is
 * why reassigning a stage, or opening a replacement window, shows up
 * immediately with nothing migrated.
 */
export interface ProductionFlow {
  id: number;
  status: ProductionFlowStatus;
  sap_status: ProductionSapStatus;
  /** The exact SAP response, or the database error verbatim. */
  sap_status_text: string;
  workflow: number;
  workflow_code: string;
  current_stage: number | null;
  current_stage_name: string | null;
  current_stage_sequence: number | null;
  current_user: number | null;
  current_user_name: string | null;
  /** Stage count AT SUBMISSION, so "stage 2 of 3" survives a later edit. */
  total_stage: number;
  /** Pre-rendered "Stage 2 of 3", or null once the flow is finished. */
  stage_label: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One production order, as SAP had it when OMS last looked.
 *
 * Every SAP-derived field is a SNAPSHOT: refreshed while the decision is open,
 * frozen once it is made. An item renamed in SAP later must not change what an
 * approved order says it was.
 */
export interface ProductionOrder {
  id: number;
  company: ProductionCompany;
  /** `OWOR.DocEntry` — unique only WITHIN a company. */
  sap_doc_entry: number;
  /** `OWOR.DocNum` — the number a human quotes. */
  sap_doc_num: number | null;

  item_code: string;
  item_name: string;
  item_group: string;
  item_series: number | null;
  warehouse: string;

  /** PIECES, because that is what `OWOR.PlannedQty` means. */
  planned_qty: string;
  /** Derived from the pack-size snapshots, never stored. Null if unknown. */
  planned_boxes: string | null;
  planned_litres: string | null;
  sal_factor2: string | null;
  sal_pack_un: string | null;

  order_type: SapOrderType;
  post_date: string | null;
  due_date: string | null;
  start_date: string | null;

  batch_no: string;
  mfg_date: string | null;
  expiry_date: string | null;

  /** Who raised it in SAP. A snapshot, not an OMS identity. */
  sap_created_by: string;
  sap_user_sign: number | null;
  /**
   * True when SAP's release gate would not have stopped this order anyway —
   * a raw material, a non-Standard order, or one raised by the exempt user.
   *
   * Surfaced deliberately, not hidden. The OIL gate ends
   * `AND A."UserSign" <> 33`, and user 33 raised 2,888 of the 3,152 eligible
   * orders, so most approvals are a RECORD rather than a CONTROL. An approval
   * that was never going to be enforced should not look identical to one that
   * was.
   */
  gate_exempt: boolean;
  /** Only on the detail endpoint. Why the gate would skip it, or null. */
  gate_exemption_reason?: string | null;

  remarks: string;
  /** Last seen `OWOR.Status`. Anything but `P` on a pending flow retires it. */
  sap_status: SapOrderStatus;
  synced_at: string;

  created_at: string;
  updated_at: string;
  flow: ProductionFlow | null;
}

export type ProductionLogAction = "SYNC" | "APPROVE" | "REJECT" | "OBSOLETE";

export interface ProductionActionLog {
  id: number;
  action: ProductionLogAction;
  /** Null for SYNC and OBSOLETE — neither is performed by an OMS user. */
  acted_by: number | null;
  acted_by_name: string | null;
  stage: number | null;
  /** Resolved through the FK, so a renamed stage reads correctly in history. */
  stage_name: string | null;
  stage_sequence: number | null;
  remarks: string;
  /** Changed snapshot fields on a refresh: {field: {old, new}}. */
  action_data: Record<string, { old: string | null; new: string | null }> | null;
  acted_at: string;
}

export interface ProductionInsights {
  total: number;
  by_status: Partial<Record<ProductionFlowStatus, number>>;
  approved_total: number;
  /** Approvals SAP would not have enforced. See `gate_exempt`. */
  approved_but_exempt_from_sap_gate: number;
  sap_write_failed: number;
}

/** One company's feed health. Answers "is the sync alive?" without SAP access. */
export interface ProductionHealth {
  company: ProductionCompany;
  last_synced_at: string | null;
  pending: number;
  sap_write_failed: number;
}

export interface DecisionResult {
  flow_id: number;
  flow_status: ProductionFlowStatus;
  current_stage: number | null;
  current_user: number | null;
  sap_status?: ProductionSapStatus;
  sap_status_text?: string;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class ProductionApiError extends Error {
  status?: number;
  errors?: Record<string, unknown>;
  /** Present on a 502 from `approve/` — what SAP refused, and why. */
  sap?: {
    sap_status: ProductionSapStatus;
    sap_status_text: string;
  };

  constructor(message: string) {
    super(message);
    this.name = "ProductionApiError";
  }
}

/** Throw on a failed response; otherwise hand the body back untouched. */
function guard(res: any): any {
  const failed =
    res == null ||
    res.success === false ||
    (typeof res.status === "number" && (res.status < 200 || res.status >= 300));
  if (!failed) return res;

  const error = new ProductionApiError(
    res?.message || "The request could not be completed.",
  );
  error.status = typeof res?.status === "number" ? res.status : undefined;
  error.errors = res?.errors;
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

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.append(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

/**
 * Anything that reads state is `no-store`.
 *
 * A stale queue shows an order the viewer has already decided, and on this
 * module it would also show a SAP write-back as still failed after a retry
 * fixed it. Nothing here is cacheable.
 */
const FRESH = { cache: "no-store" } as const;

const BASE = "/production";

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export const productionService = {
  // --- reading -------------------------------------------------------
  listOrders: async (
    opts: { status?: string; company?: string; item_code?: string } = {},
  ): Promise<ProductionOrder[]> => {
    return rows<ProductionOrder>(
      guard(
        await api.get(
          `${BASE}/requests/${query({
            status: opts.status,
            company: opts.company,
            item_code: opts.item_code,
          })}`,
          undefined,
          FRESH,
        ),
      ),
    );
  },

  getOrder: async (id: number): Promise<ProductionOrder> => {
    return unwrap<ProductionOrder>(
      guard(await api.get(`${BASE}/requests/${id}/`, undefined, FRESH)),
    );
  },

  /**
   * The action log, oldest first.
   *
   * A FLAT list, unlike BackDate's `{actions, stages}`: PRDO's history
   * endpoint returns only what happened, so the stage rail on the progress
   * screen is reconstructed from these rows plus the flow. See
   * `features/production/types.ts`.
   */
  history: async (id: number): Promise<ProductionActionLog[]> => {
    return rows<ProductionActionLog>(
      guard(await api.get(`${BASE}/requests/${id}/history/`, undefined, FRESH)),
    );
  },

  insights: async (
    opts: { company?: string } = {},
  ): Promise<ProductionInsights> => {
    return unwrap<ProductionInsights>(
      guard(
        await api.get(
          `${BASE}/insights/${query({ company: opts.company })}`,
          undefined,
          FRESH,
        ),
      ),
    );
  },

  /** Last successful sync per company — "is the feed alive?" */
  health: async (): Promise<ProductionHealth[]> => {
    return rows<ProductionHealth>(
      guard(await api.get(`${BASE}/health/`, undefined, FRESH)),
    );
  },

  // --- approval desk -------------------------------------------------
  /**
   * Only what THIS user may act on today, stand-ins included.
   *
   * Resolved server-side through the workflow stage, never through a stored
   * `current_user` — so a stage reassigned while an order sat still, or a
   * replacement window that opened since, is reflected immediately.
   */
  approvalQueue: async (
    opts: { company?: string } = {},
  ): Promise<ProductionOrder[]> => {
    return rows<ProductionOrder>(
      guard(
        await api.get(
          `${BASE}/approvals/queue/${query({ company: opts.company })}`,
          undefined,
          FRESH,
        ),
      ),
    );
  },

  approvalHistory: async (
    opts: { status?: string; company?: string } = {},
  ): Promise<ProductionOrder[]> => {
    return rows<ProductionOrder>(
      guard(
        await api.get(
          `${BASE}/approvals/history/${query({
            status: opts.status,
            company: opts.company,
          })}`,
          undefined,
          FRESH,
        ),
      ),
    );
  },

  // --- deciding ------------------------------------------------------
  /**
   * Decisions are addressed by ORDER, not by task.
   *
   * There is no task table: an order waits at one stage at a time and its flow
   * says which, so the order id is enough.
   */
  approve: async (orderId: number, remarks = ""): Promise<DecisionResult> => {
    return unwrap<DecisionResult>(
      guard(await api.post(`${BASE}/requests/${orderId}/approve/`, { remarks })),
    );
  },

  /** Remarks are REQUIRED here — the server refuses a reasonless rejection. */
  reject: async (orderId: number, remarks: string): Promise<DecisionResult> => {
    return unwrap<DecisionResult>(
      guard(await api.post(`${BASE}/requests/${orderId}/reject/`, { remarks })),
    );
  },

  /**
   * Re-attempt the SAP write for an approved order whose write-back failed.
   *
   * Worth a button rather than a support ticket: a lost approval leaves an
   * order blocked in SAP that everyone believes is released, and the only
   * evidence is a status nobody is looking at.
   */
  retrySap: async (orderId: number): Promise<DecisionResult> => {
    return unwrap<DecisionResult>(
      guard(await api.post(`${BASE}/requests/${orderId}/retry-sap/`, {})),
    );
  },
};

export default productionService;
