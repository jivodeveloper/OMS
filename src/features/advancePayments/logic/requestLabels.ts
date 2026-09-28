/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/requestLabels.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * How a request reads in a list — status words, tones, and the filter.
 * Shared by the requester's Entries tab and the approval desk, so both pages
 * count and narrow the same list the same way.
 */
import {
  paymentAgainstLabel,
  requestAmount,
  typeLabel,
  type AdvanceRequestEntry,
  type ApprovalStatus,
} from "./approvalData";
import { PRIORITIES, type Company } from "./constants";

export const STATUS_TONE = {
  PENDING: "hold",
  RETURNED: "info",
  APPROVED: "ok",
  REJECTED: "bad",
  CANCELLED: "neutral",
} as const;
export const STATUS_LABEL = {
  PENDING: "Pending",
  RETURNED: "Returned",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const;
export const PRIORITY_TONE = { LOW: "ok", MEDIUM: "hold", HIGH: "bad" } as const;

export const priorityLabel = (entry: AdvanceRequestEntry) =>
  PRIORITIES.find((p) => p.value === entry.form.priority)?.label ?? "—";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Filtering ───────────────────────────────────────────────────────────── */

/** `""` is every status / every company — not a value of its own. */
export type StatusFilter = "" | ApprovalStatus;
export type CompanyFilter = "" | Company;

export interface RequestFilterState {
  search: string;
  company: CompanyFilter;
  status: StatusFilter;
}

export const NO_FILTERS: RequestFilterState = { search: "", company: "", status: "" };

/**
 * Everything a person might type to find a request: its number, who raised
 * it, the partner by name or code, and what it is for. Case-insensitive and
 * contains-matching, like every search box in the app.
 */
function haystack(entry: AdvanceRequestEntry): string {
  const { form } = entry;
  return [
    entry.requestNo,
    entry.requestedBy,
    form.partnerName,
    form.partner,
    typeLabel(form),
    paymentAgainstLabel(form),
    form.ownership,
    form.departmentName,
    form.subDepartmentName,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterRequests(
  entries: AdvanceRequestEntry[],
  filters: RequestFilterState,
): AdvanceRequestEntry[] {
  const term = filters.search.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (!filters.status || entry.status === filters.status) &&
      (!filters.company || entry.form.company === filters.company) &&
      (!term || haystack(entry).includes(term)),
  );
}

export interface RequestCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  pendingAmount: number;
}

/**
 * The KPI numbers. Counted over the list as the company and search filters
 * leave it — but NOT the status filter, which is what the cards themselves
 * select: a card must not read 0 because it is not the one selected.
 */
export function requestCounts(entries: AdvanceRequestEntry[]): RequestCounts {
  const pending = entries.filter((e) => e.status === "PENDING");
  return {
    pending: pending.length,
    approved: entries.filter((e) => e.status === "APPROVED").length,
    rejected: entries.filter((e) => e.status === "REJECTED").length,
    total: entries.length,
    pendingAmount: pending.reduce((sum, e) => sum + requestAmount(e.form), 0),
  };
}

/* ── The payee's balance ─────────────────────────────────────────────────── */

const BALANCE_ROLES = new Set(["PAYMENT", "AUDIT", "FINAL"]);

/**
 * Whether the desk shows the payee's SAP balance: at or past Payment (or
 * completed), and paid to a business partner (Vendor, Employee Imprest).
 * Never to the requester while they raise it.
 */
export function showsBalance(entry: AdvanceRequestEntry): boolean {
  const partner = entry.form.type === "VENDOR" || entry.form.type === "EMPLOYEE_IMPREST";
  const reached = BALANCE_ROLES.has(entry.api.flow?.current_role ?? "") || entry.status === "APPROVED";
  return partner && reached;
}
