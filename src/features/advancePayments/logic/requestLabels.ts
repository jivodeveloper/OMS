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
import type { Company } from "./constants";

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

/** `S` is what the status control selects: a request status, or a desk bucket. */
export interface RequestFilterState<S extends string = StatusFilter> {
  search: string;
  company: CompanyFilter;
  status: S;
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
    form.budgetName,
    form.budget,
    form.purposeLabel,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterRequests<S extends string = StatusFilter>(
  entries: AdvanceRequestEntry[],
  filters: RequestFilterState<S>,
  /** What the status filter compares against — the desk passes `deskBucket`. */
  statusOf: (entry: AdvanceRequestEntry) => string = (entry) => entry.status,
): AdvanceRequestEntry[] {
  const term = filters.search.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (!filters.status || statusOf(entry) === filters.status) &&
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

/* ── The approval desk ───────────────────────────────────────────────────── */

/**
 * Where a request sits on ONE approver's desk. Filed by what waits on them
 * and what they themselves decided — never by the request's overall status,
 * which would show them how the other approvers stand on it.
 *
 * Waiting at their stage wins over an earlier decision: a request they
 * returned that has come round again is pending with them, not "returned".
 * `""` is a request on the desk for neither reason (an admin's view).
 */
export type DeskBucket = "" | "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";
export type DeskFilter = DeskBucket;

export function deskBucket(entry: AdvanceRequestEntry): DeskBucket {
  if (entry.api.flow?.awaiting_me) return "PENDING";
  switch (entry.api.my_decision?.action) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "RETURNED":
    case "SENT_BACK":
      return "RETURNED";
    default:
      return "";
  }
}

/** The desk's choices: by what YOU did, not by the request's overall status. */
export const DESK_STATUS_OPTIONS: ReadonlyArray<{ value: DeskFilter; label: string }> = [
  { value: "", label: "All entries" },
  { value: "PENDING", label: "Pending at your stage" },
  { value: "APPROVED", label: "Approved by you" },
  { value: "REJECTED", label: "Rejected by you" },
  { value: "RETURNED", label: "Returned / sent back by you" },
];

/** The approver's own decision, as the desk's "Your Decision" column says it. */
export const MY_DECISION_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  SENT_BACK: "Sent back",
};
export const MY_DECISION_TONE = {
  APPROVED: "ok",
  REJECTED: "bad",
  RETURNED: "info",
  SENT_BACK: "info",
} as const;

export interface DeskCounts {
  pending: number;
  pendingAmount: number;
  approved: number;
  rejected: number;
  returned: number;
  total: number;
}

/** The desk's KPI numbers — over the list as search and company leave it. */
export function deskCounts(entries: AdvanceRequestEntry[]): DeskCounts {
  const of = (bucket: DeskBucket) => entries.filter((e) => deskBucket(e) === bucket);
  const pending = of("PENDING");
  return {
    pending: pending.length,
    pendingAmount: pending.reduce((sum, e) => sum + requestAmount(e.form), 0),
    approved: of("APPROVED").length,
    rejected: of("REJECTED").length,
    returned: of("RETURNED").length,
    total: entries.length,
  };
}

/* ── The payee's balance ─────────────────────────────────────────────────── */

const BALANCE_ROLES = new Set(["PAYMENT", "AUDIT", "FINAL"]);

/**
 * Whether the desk shows the payee's SAP balance: at or past Payment (or
 * completed), paid to a business partner (Vendor, Employee Imprest), and to a
 * viewer who holds Payment or a later stage (`can.see_account`).
 * Never to the requester while they raise it — and not while the partner has
 * no account in SAP yet (a new imprest holder): there is no ledger to read
 * until Payment creates it and approving links the request to it.
 */
export function showsBalance(entry: AdvanceRequestEntry): boolean {
  const partner =
    entry.form.type === "VENDOR" ||
    entry.form.type === "EMPLOYEE_IMPREST" ||
    entry.form.type === "CUSTOMER";
  return partner && !entry.api.partner_not_in_sap && entry.api.can.see_account && reachedPayment(entry);
}

/**
 * At or past the Payment stage (or completed). What the approvers from
 * Payment on weigh a payment against — the payee's balance and ledger, and
 * what the documents' SAP attachments say — is shown from here, never to the
 * requester or the approvals before Payment.
 */
export function reachedPayment(entry: AdvanceRequestEntry): boolean {
  return BALANCE_ROLES.has(entry.api.flow?.current_role ?? "") || entry.status === "APPROVED";
}
