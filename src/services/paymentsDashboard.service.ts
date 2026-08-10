import { api } from "./api";

/**
 * Payments Dashboard analytics API.
 *
 * Types mirror `payments/analytics.py` and the web client's
 * `paymentsDashboardService.ts` exactly — one server contract, two clients, so
 * a field renamed on one side must be renamed on both.
 *
 * Every endpoint here requires the `Payments_Dashboard` permission server-side.
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "custom";

/** Matches analytics.DEFAULT_PRESET on the server. */
export const DEFAULT_PRESET: DatePreset = "last_30_days";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

/** One donut segment. `percent` is computed server-side so the chart, the
 *  legend and the tooltip cannot round the same number differently. */
export interface ChartSlice {
  key: string;
  label: string;
  amount: number;
  percent: number;
}

export interface ChartSeries {
  total: number;
  slices: ChartSlice[];
}

/**
 * Every figure here is SAP-POSTED ONLY, except the `pending_*` / `blocked_*`
 * group, which is deliberately the opposite: raised but NOT settled in SAP.
 */
export interface DashboardKpis {
  total_payments: number;
  total_payments_count: number;
  deposit_total: number;
  deposit_collected: number;
  deposit_count: number;
  received_total: number;
  received_count: number;
  against_invoice: number;
  against_invoice_count: number;
  advance_payment: number;
  advance_count: number;

  /** Raised but not in SAP. Excludes rejected and cancelled — nothing is
   *  waiting on those. */
  pending_receipts: number;
  pending_receipts_count: number;
  pending_deposits: number;
  pending_deposits_count: number;
  /** The subset needing a human: SAP refused it, or never answered. */
  blocked_total: number;
  blocked_count: number;
}

export type ParticipationRole =
  | "collected"
  | "banked"
  | "recorded"
  | "submitted";

export interface CollectionRow {
  id: number;
  /** `person` = CollectionPerson, `user` = OMS login. Separate id spaces. */
  kind: "person" | "user";
  /** `kind:id` — the stable key for list rendering and routing. */
  key: string;
  name: string;
  code: string;
  roles: ParticipationRole[];
  role_labels: string[];
  received: number;
  deposited: number;
  total: number;
  receipt_count: number;
  deposit_count: number;
  received_percent: number;
  deposit_percent: number;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CollectionPerformance {
  results: CollectionRow[];
  pagination: Pagination;
}

export type SortField = "name" | "received" | "deposited" | "total";

export interface DashboardFilters {
  company: string;
  preset: DatePreset;
  date_from: string;
  date_to: string;
}

export interface DashboardData {
  filters: DashboardFilters;
  kpis: DashboardKpis;
  charts: {
    received: ChartSeries;
    methods: ChartSeries;
    deposits: ChartSeries;
  };
  collection_performance: CollectionPerformance;
}

export interface ActivityEvent {
  kind: "RECEIPT" | "DEPOSIT";
  id: number;
  reference: string;
  date: string;
  amount: number;
  status: string;
  party: string;
  detail: string;
}

export interface PersonDetail {
  person: {
    id: number;
    kind: "person" | "user";
    key: string;
    name: string;
    code: string;
    subtitle: string;
  };
  filters: DashboardFilters;
  kpis: {
    received_total: number;
    received_count: number;
    deposit_total: number;
    deposit_collected: number;
    deposit_count: number;
    against_invoice: number;
    advance_payment: number;
  };
  charts: { received: ChartSeries; methods: ChartSeries };
  timeline: { date: string; received: number; deposited: number }[];
  recent_activity: ActivityEvent[];
}

export interface DashboardCompany {
  company: string;
  display_name: string;
}

export interface DashboardQuery {
  company?: string;
  preset?: DatePreset;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: SortField;
  direction?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

// The project's DRF envelope: { success, message, data }, with list endpoints
// nesting a paginated body inside `data`.
const unwrap = <T>(body: any): T =>
  body && typeof body === "object" && "data" in body ? body.data : body;

const rows = <T>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

function toQuery(query: DashboardQuery): string {
  const params = new URLSearchParams();
  if (query.company) params.set("company", query.company);
  if (query.preset) params.set("preset", query.preset);
  // Only meaningful for a custom preset; the server rejects a half-open range
  // rather than quietly substituting today.
  if (query.preset === "custom") {
    if (query.date_from) params.set("date_from", query.date_from);
    if (query.date_to) params.set("date_to", query.date_to);
  }
  if (query.search) params.set("search", query.search);
  if (query.sort) params.set("sort", query.sort);
  if (query.direction) params.set("direction", query.direction);
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  const text = params.toString();
  return text ? `?${text}` : "";
}

const paymentsDashboardService = {
  /** Every figure on the dashboard, in one call. */
  get: async (query: DashboardQuery = {}): Promise<DashboardData> => {
    const res = await api.get(
      `/payments/dashboard/${toQuery(query)}`,
      undefined,
      // Collections move all day; a cached total is a wrong total.
      { cache: "no-store" },
    );
    return unwrap<DashboardData>(res);
  },

  /** Just the participants list — for infinite scroll, search and sorting. */
  collectionPerformance: async (
    query: DashboardQuery = {},
  ): Promise<CollectionPerformance> => {
    const res = await api.get(
      `/payments/dashboard/collection-performance/${toQuery(query)}`,
      undefined,
      { cache: "no-store" },
    );
    return unwrap<CollectionPerformance>(res);
  },

  /** One participant's history. `kind` is in the path because a
   *  CollectionPerson and a User can share an id and be different people. */
  person: async (
    kind: "person" | "user",
    id: number,
    query: DashboardQuery = {},
  ): Promise<PersonDetail> => {
    const res = await api.get(
      `/payments/dashboard/person/${kind}/${id}/${toQuery(query)}`,
      undefined,
      { cache: "no-store" },
    );
    return unwrap<PersonDetail>(res);
  },

  listCompanies: async (): Promise<DashboardCompany[]> => {
    const res = await api.get("/payments/companies/");
    return rows<DashboardCompany>(res);
  },
};

export default paymentsDashboardService;
