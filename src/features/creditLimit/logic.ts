import type {
  CreditLimitRequest,
  CreditLimitStatus,
} from "@/src/services/creditLimit.service";

/**
 * What a Credit Limit request MEANS — the small decisions both screens make.
 *
 * PORTED FROM THE WEB CLIENT (`OMS-Frontend/src/pages/creditLimit/format.ts`
 * and the status / stage helpers in `shared.tsx`), so the two clients read one
 * request the same way. Pure: no React, no service calls, so it can be read
 * and tested on its own.
 */

/** A decimal string from the API as rupees, or an em dash. */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} · ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Today as `YYYY-MM-DD` on the LOCAL calendar — the floor for Valid Till.
 *
 * Never `toISOString().slice(0, 10)`: that is UTC's day, and before 05:30 IST
 * it names yesterday, which the server then refuses as a past date.
 */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Where a request stands, in the list's own words. */
export const STATUS_LABEL: Record<CreditLimitStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** The one a request has, or the one it has not: never submitted. */
export function statusOf(request: CreditLimitRequest): CreditLimitStatus | "" {
  return request.flow?.status ?? "";
}

export function statusLabel(request: CreditLimitRequest): string {
  const status = statusOf(request);
  return status ? STATUS_LABEL[status] : "Not submitted";
}

/** "Stage 2 of 3 · Finance (tannu)" — where a pending request is sitting. */
export function stageLine(request: CreditLimitRequest): string {
  const flow = request.flow;
  if (!flow) return "";
  const where =
    flow.current_stage_sequence && flow.total_stage
      ? `Stage ${flow.current_stage_sequence} of ${flow.total_stage}`
      : "";
  const who = [flow.current_stage_name, flow.current_user_username && `(${flow.current_user_username})`]
    .filter(Boolean)
    .join(" ");
  return [where, who].filter(Boolean).join(" · ");
}

/**
 * How much the limit moves, as a figure and a direction.
 *
 * The pair is the whole decision: an approver is not asked "is ₹5,00,000 a
 * good limit?" but "is ₹2,00,000 MORE than today a good idea?", and a list
 * that shows only the new figure makes that subtraction a reader's job.
 */
export function limitChange(request: CreditLimitRequest): {
  delta: number;
  direction: "up" | "down" | "same";
} {
  const now = Number(request.current_credit_limit) || 0;
  const next = Number(request.new_credit_limit) || 0;
  const delta = Math.round((next - now) * 100) / 100;
  return { delta: Math.abs(delta), direction: delta > 0 ? "up" : delta < 0 ? "down" : "same" };
}

/**
 * What is wrong with the form, named field by field.
 *
 * The same three rules the server enforces
 * (`CreditLimitCreateSerializer`): a customer, a limit above zero, and a date
 * that is not in the past. Saying so here saves a round trip that can only
 * answer the same thing.
 */
export function validateDraft(draft: {
  cardCode: string;
  newLimit: string;
  validTill: string;
}): { missing: string[]; problems: string[] } {
  const missing: string[] = [];
  const problems: string[] = [];

  if (!draft.cardCode) missing.push("Party");
  if (!draft.newLimit.trim()) missing.push("New Credit Limit");
  else if (!(Number(draft.newLimit) > 0)) {
    problems.push("New Credit Limit must be more than zero.");
  }

  if (!draft.validTill) missing.push("Valid Till");
  else if (draft.validTill < todayIso()) {
    problems.push("Valid Till cannot be in the past.");
  }

  return { missing, problems };
}
