/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/approvalData.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * A payment request as both pages hold it: the FORM it was raised with (so
 * it can be shown, and edited, by the same components that raised it), the
 * payout, where it stands — and the server's own record (`api`), which
 * carries the route, the history and what the viewer may do now.
 *
 * Built from the server's answer by `requestApi.fromApiRequest`.
 */
import type { ApiRequest } from "../../../services/advancePayment.service";
import type { FileAttachment } from "./attachments";
import { PARTNER_TYPES, PAYMENT_AGAINST_OPTIONS, RETURN_METHODS } from "./constants";
import type { PayoutDetails } from "./payout";
import { allocationRows, allocationTotals, expenseNet, expenseTotal, resolveCase, type RequestForm } from "./rules";

/**
 * Where a request stands, in the pages' words. PENDING is the server's
 * IN_APPROVAL (waiting at a stage); APPROVED is COMPLETED (Final approved:
 * the money may go).
 */
export type ApprovalStatus = "PENDING" | "RETURNED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface Decision {
  status: Exclude<ApprovalStatus, "PENDING">;
  by: string;
  /** ISO date-time. */
  on: string;
  remarks: string;
}

export interface AdvanceRequestEntry {
  id: string;
  /** The server's id for it. */
  serverId: number;
  requestNo: string;
  requestedBy: string;
  /** ISO date-time. */
  requestedOn: string;
  form: RequestForm;
  files: FileAttachment[];
  status: ApprovalStatus;
  /** Filled at the Payment stage — see `payout.ts`. Absent until then. */
  payout?: PayoutDetails;
  /** The last decision that settled or turned it: completed, rejected, returned, cancelled. */
  decision?: Decision;
  /** The server's record: route, history, SAP payment, and what the viewer may do. */
  api: ApiRequest;
}

/* ── How a request reads on the desk ─────────────────────────────────────── */

/** What the request asks to pay: the lines' total, or the typed amount. */
export function requestAmount(form: RequestForm): number {
  const c = resolveCase(form);
  if (c.reference) return allocationTotals(allocationRows(form)).payment;
  // An Expense: its invoice values (what it pays is that less its TDS: `expenseNet`).
  if (c.expense) return expenseTotal(form.expenseLines);
  const n = Number(form.amount);
  return Number.isFinite(n) ? n : 0;
}

/** What the payment methods pay: an Expense's invoice values less its TDS, else the request's amount. */
export function paidAmount(form: RequestForm): number {
  return resolveCase(form).expense ? expenseNet(form) : requestAmount(form);
}

/** The vendor's own numbers (SAP `NumAtCard`) of the bills / POs a request pays, each once. */
export function vendorRefs(form: RequestForm): string[] {
  return [...new Set(form.selected.flatMap((doc) => (doc.reference ? [doc.reference] : [])))];
}

/** Who is paid: the SAP partner's name, or an Expense's typed payee. */
export function payeeOf(form: RequestForm): string {
  return form.type === "EXPENSE" ? form.payee : form.partnerName || form.partner;
}

export const typeLabel = (form: RequestForm) =>
  PARTNER_TYPES.find((type) => type.value === form.type)?.label ?? "—";

/** The listed answer's label, or the requester's own typed text. */
export function paymentAgainstLabel(form: RequestForm): string {
  if (form.paymentAgainst === "OTHER") return form.paymentAgainstOther || "Other";
  return PAYMENT_AGAINST_OPTIONS.find((o) => o.value === form.paymentAgainst)?.label ?? "—";
}

export function returnMethodLabel(form: RequestForm): string {
  if (form.returnMethod === "CUSTOM") return form.returnMethodOther || "Other";
  return RETURN_METHODS.find((m) => m.value === form.returnMethod)?.label ?? "—";
}
