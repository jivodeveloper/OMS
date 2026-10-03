/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/editChanges.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * What an edit changed, as rows a person reads: Field · Was · Now.
 *
 * Read from an EDITED or PAYOUT_UPDATED log row's `data`, which the server writes as
 * `{field: {old, new}}`, plus `documents` (added / removed / changed amounts)
 * and `files_added` / `files_removed`. Rows logged before the server stored
 * readable values (ids, `BILL:10256:40000`) still come out — just plainer.
 */
import { formatDate, formatINR } from "./rules";

export interface EditRow {
  field: string;
  was: string;
  now: string;
}

const LABEL: Record<string, string> = {
  company: "Company",
  request_type: "Request type",
  payment_against: "Payment against",
  payment_against_other: "Payment against (typed)",
  department: "Department",
  department_id: "Department",
  sub_department: "Sub-department",
  sub_department_id: "Sub-department",
  partner: "Partner",
  partner_code: "Partner code",
  partner_name: "Partner",
  amount: "Amount",
  expected_date: "Expected date",
  expected_bill_date: "Expected bill date",
  return_method: "Return method",
  return_method_other: "Return method (typed)",
  installments: "Installments",
  emi_amount: "EMI amount",
  expected_from_date: "Expected from",
  expected_to_date: "Expected to",
  payment_date: "Payment date",
  priority: "Priority",
  remarks: "Remarks",
  owner: "Ownership",
  owner_label: "Ownership",
  owner_employee_id: "Ownership (employee id)",
  budget: "Payment purpose (budget)",
  budget_code: "Payment purpose (budget)",
  sub_budget: "Payment purpose (sub budget)",
  sub_budget_code: "Payment purpose (sub budget)",
  // The payment details (PAYOUT_UPDATED).
  beneficiary_name: "Beneficiary",
  to_account: "To account",
  to_ifsc: "IFSC",
  account_source: "Account",
};

/** Flags beside the changes, not changes themselves. */
const NOT_A_CHANGE = new Set(["files_added", "files_removed", "manual_account", "manual_new", "account_last4"]);

const MONEY = new Set(["amount", "emi_amount"]);
const DATE = /(^|_)date$|_from_date$|_to_date$/;
/** Codes shown as words: VENDOR_ADVANCE → "Vendor advance". */
const CODED = new Set(["request_type", "payment_against", "return_method", "priority"]);

const humanise = (key: string) => {
  const words = key.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function money(value: unknown): string {
  const n = Number(value);
  return value === null || value === undefined || value === "" || Number.isNaN(n) ? "—" : formatINR(n);
}

function shown(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  const text = String(value);
  if (MONEY.has(key)) return money(value);
  if (DATE.test(key)) return formatDate(text);
  if (CODED.has(key)) return humanise(text);
  return text;
}

interface DocChange {
  doc: string;
  amount?: string;
  old?: string;
  new?: string;
}

export function editRows(data: Record<string, unknown> | null | undefined): EditRow[] {
  const rows: EditRow[] = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    if (NOT_A_CHANGE.has(key)) continue;
    const change = value as { old?: unknown; new?: unknown; added?: DocChange[]; removed?: DocChange[]; changed?: DocChange[] };
    if (key === "documents" && !("old" in change)) {
      for (const d of change.changed ?? []) rows.push({ field: d.doc, was: money(d.old), now: money(d.new) });
      for (const d of change.added ?? []) rows.push({ field: d.doc, was: "Not on it", now: money(d.amount) });
      for (const d of change.removed ?? []) rows.push({ field: d.doc, was: money(d.amount), now: "Removed" });
      continue;
    }
    const method = /^payment_method_(\d+)$/.exec(key);
    rows.push({
      field: method ? `Payment method ${method[1]}` : (LABEL[key] ?? humanise(key)),
      was: shown(key, change?.old),
      now: shown(key, change?.new),
    });
  }
  const files = (key: string) => (Array.isArray(data?.[key]) ? (data?.[key] as unknown[]).map(String) : []);
  for (const name of files("files_added")) rows.push({ field: "File", was: "—", now: `${name} (added)` });
  for (const name of files("files_removed")) rows.push({ field: "File", was: name, now: "Removed" });
  return rows;
}
