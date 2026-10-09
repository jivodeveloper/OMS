/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/payout.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * How an approved advance is PAID OUT — the part only the approver fills in.
 * PURE, NO REACT.
 *
 * The requester says what is owed and to whom; they do not know which of the
 * company's accounts it leaves from, by what instrument, or the payee's bank
 * details as finance has verified them. The approver does, so these fields
 * exist only on the approval desk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAME SHAPE AS RECEIVE PAYMENT, THE OTHER WAY ROUND
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors the mobile app's Receive Payment method card
 * (`OMS/app/(main)/payments/_components/PaymentMethodCard.tsx`) so a person
 * who records money coming in records money going out the same way:
 *
 *   * one or more METHOD LINES — UPI, Cheque or Cash — each with its amount;
 *   * Cash carries a NOTE BREAKDOWN (₹10…₹500) that must equal the amount;
 *   * Cheque carries number, bank and date;
 *   * every line names OUR account — a house bank for UPI/cheque, a cash
 *     drawer for cash — which here is the account paid FROM, where receipts
 *     name the one paid INTO;
 *   * every non-cash line carries proof (the cheque, the payment screenshot).
 *
 * Added for the outgoing side: the PAYEE — name, account number, IFSC — and
 * attachments for those bank details (a cancelled cheque, a bank letter).
 *
 * WHERE THE ACCOUNTS COME FROM
 *   * FROM (ours), per company, from SAP: house banks from
 *     `GET /advance-payments/house-banks/` (every account, including any SAP
 *     cannot post from yet), cash accounts from `/advance-payments/cash-accounts/`
 *     (the chart of accounts under 1105000 CASH IN HAND).
 *   * TO (the payee's): their bank accounts in SAP,
 *     `GET /advance-payments/partner-bank-accounts/`, the default pre-filled.
 *
 * WHICH METHODS AN AMOUNT MAY USE is `METHOD_LIMITS`, one table: UPI only
 * below 1 lakh, RTGS only above 2 lakh, IMPS only below 5 lakh, cash only up
 * to 10,000; NEFT and cheque at any amount.
 */
import type { FileAttachment } from "./attachments";
import { formatINR } from "./rules";

export type PayoutMethod = "UPI" | "NEFT" | "RTGS" | "IMPS" | "CHEQUE" | "CASH";

export const PAYOUT_METHODS: ReadonlyArray<{ value: PayoutMethod; label: string }> = [
  { value: "UPI", label: "UPI" },
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "IMPS", label: "IMPS" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
];

/**
 * The electronic transfers. They behave alike: they leave from a house bank
 * and may carry a screenshot or advice as proof, so the form asks the same
 * things of each. No UTR / reference is asked: it exists only once the
 * transfer has been made, which is after this approval.
 */
export const TRANSFER_METHODS: ReadonlySet<PayoutMethod> = new Set(["UPI", "NEFT", "RTGS", "IMPS"]);
export const isTransfer = (method: PayoutMethod) => TRANSFER_METHODS.has(method);

/**
 * Which amounts each method may carry — the ONE place the thresholds live.
 *
 * As specified, and exactly as worded: UPI strictly BELOW 1,00,000, RTGS
 * strictly ABOVE 2,00,000, IMPS strictly BELOW 5,00,000. So at exactly
 * 1,00,000 UPI is not offered, and at exactly 2,00,000 RTGS is not either.
 * (The banking rules are inclusive at both: NPCI's UPI cap is 1,00,000 and
 * RBI's RTGS minimum is 2,00,000. Flip `below`/`above` to `upTo`/`from` if
 * that is what is wanted.) NEFT, cheque and cash have no limit here.
 */
export const METHOD_LIMITS: Partial<
  Record<PayoutMethod, { below?: number; above?: number; upTo?: number }>
> = {
  UPI: { below: 100000 },
  RTGS: { above: 200000 },
  IMPS: { below: 500000 },
  // Up to AND including 10,000: hidden only ABOVE it. Also the Income Tax
  // Act's line (s.40A(3)): a cash payment over 10,000 in a day is disallowed.
  CASH: { upTo: 10000 },
};

/** Why `method` cannot carry `amount`, or null when it can (or there is no amount yet). */
export function methodAmountError(method: PayoutMethod, amount: number): string | null {
  const limit = METHOD_LIMITS[method];
  if (!limit || !(amount > 0)) return null;
  const label = PAYOUT_METHODS.find((m) => m.value === method)?.label ?? method;
  if (limit.below !== undefined && !(amount < limit.below)) {
    return `${label} is only for amounts below ${formatINR(limit.below)}.`;
  }
  if (limit.above !== undefined && !(amount > limit.above)) {
    return `${label} is only for amounts above ${formatINR(limit.above)}.`;
  }
  if (limit.upTo !== undefined && amount > limit.upTo) {
    return `${label} is only for amounts up to ${formatINR(limit.upTo)}.`;
  }
  return null;
}

/** The methods an amount may use, in the list's order. */
export function methodsFor(amount: number): PayoutMethod[] {
  return PAYOUT_METHODS.map((m) => m.value).filter((m) => methodAmountError(m, amount) === null);
}

/** What a new line starts as: UPI when the amount allows it, NEFT otherwise. */
export function defaultMethodFor(amount: number): PayoutMethod {
  return methodAmountError("UPI", amount) === null ? "UPI" : "NEFT";
}

/** The receive-payment screen's notes, unchanged. */
export const NOTE_DENOMINATIONS = [10, 20, 50, 100, 200, 500] as const;

export interface CashNoteRow {
  id: string;
  denomination: number | null;
  quantity: string;
}

export interface PayoutLine {
  id: string;
  /** The server's id, once saved: keeps the line (and its files) across edits. */
  serverId?: number;
  method: PayoutMethod;
  amount: string;
  /** OUR account the money leaves from — a house bank, or a drawer for cash. */
  fromAccount: string;
  /** Cash only. */
  noteRows: CashNoteRow[];
  /** Cheque only. */
  chequeNumber: string;
  /** The bank the cheque is drawn on — ours, since we are paying. */
  chequeBank: string;
  chequeDate: string;
  /** Proof — every method but cash. */
  attachments: FileAttachment[];
  /**
   * The bank's reference for the transfer, recorded after it is made (UPI,
   * NEFT, RTGS, IMPS only). Absent until then.
   */
  utr?: string;
  /** What the proof the UTR was read from showed, when it came from one. */
  utrProof?: UtrProof;
}

/** How a recorded UTR was established. */
export interface UtrProof {
  fileName: string;
  /** How the file was read: pdf-text | ocr | excel | csv ... */
  source: string;
  /** The UTR as read, before any correction by hand. */
  readUtr: string | null;
  checks: { amount: boolean | null; account: boolean | null; invoice: boolean | null };
  recordedBy: string;
  /** ISO date-time. */
  recordedOn: string;
}

export interface PayoutDetails {
  /** Who receives it, as their bank knows them. */
  beneficiaryName: string;
  toAccountNumber: string;
  toIfsc: string;
  /**
   * The approver chose to TYPE the payee's account rather than use one of the
   * accounts SAP holds for them. Kept so that an emptied field is not
   * mistaken for "nothing chosen yet" and silently re-filled with the default.
   */
  toAccountManual: boolean;
  lines: PayoutLine[];
  /** Supporting the payee's bank details — a cancelled cheque, a bank letter. */
  bankAttachments: FileAttachment[];
  /**
   * TDS deducted at the Payment stage (vendor payments only): the SAP code
   * it is booked under and what it comes to. The methods pay the rest.
   */
  tds: PayoutTds | null;
  /** SAP's Payment Mode the desk chose; "" = Automatic, from the methods (`autoSapPaymentMode`). */
  sapPaymentMode: SapPaymentMode | "";
}

/**
 * SAP's Payment Mode values (OVPM.U_Pymnt_Mode). SAP's check 460007 refuses a
 * payment from a bank account without one.
 */
export const SAP_PAYMENT_MODES = ["NEFT", "RTGS", "FT"] as const;
export type SapPaymentMode = (typeof SAP_PAYMENT_MODES)[number];

/**
 * What OMS sends when the desk leaves it Automatic — the server's same rule:
 * the bank method carrying the most money; NEFT and RTGS as themselves, any
 * other (UPI, IMPS, cheque) as FT. Null when nothing goes through a bank.
 */
export function autoSapPaymentMode(lines: PayoutLine[]): SapPaymentMode | null {
  const bank = lines.filter((l) => l.method !== "CASH");
  if (bank.length === 0) return null;
  const biggest = bank.reduce((a, b) => ((Number(b.amount) || 0) > (Number(a.amount) || 0) ? b : a));
  return biggest.method === "NEFT" || biggest.method === "RTGS" ? biggest.method : "FT";
}

export interface PayoutTds {
  code: string;
  label: string;
  /** A percentage: 1, 2, 10 … */
  rate: number;
  account: string;
  amount: number;
}

/** TDS on `amount` at `rate` percent, rounded to the rupee — as the server rounds it. */
export function tdsAmountFor(amount: number, rate: number): number {
  return Math.round((amount * rate) / 100);
}

/** What the methods must pay: the request's amount less any TDS. */
export function netPayable(payout: PayoutDetails, requestAmount: number): number {
  return Math.round((requestAmount - (payout.tds?.amount ?? 0)) * 100) / 100;
}

let lineSeq = 0;

export function newPayoutLine(method: PayoutMethod = "UPI"): PayoutLine {
  lineSeq += 1;
  return {
    id: `line-${lineSeq}-${Date.now()}`,
    method,
    amount: "",
    fromAccount: "",
    noteRows: [],
    chequeNumber: "",
    chequeBank: "",
    chequeDate: "",
    attachments: [],
  };
}

export const EMPTY_PAYOUT: PayoutDetails = {
  beneficiaryName: "",
  toAccountNumber: "",
  toIfsc: "",
  toAccountManual: false,
  lines: [],
  bankAttachments: [],
  tds: null,
  sapPaymentMode: "",
};

/**
 * A fresh payout with one line, pre-filled with the whole amount, by the
 * first method that amount may use.
 */
export function startPayout(amount: number, beneficiaryName = ""): PayoutDetails {
  return {
    ...EMPTY_PAYOUT,
    beneficiaryName,
    lines: [{ ...newPayoutLine(defaultMethodFor(amount)), amount: amount > 0 ? String(amount) : "" }],
  };
}

/**
 * A method change keeps the amount and drops everything that belonged to the
 * old method. The FROM account goes only when the move is into or out of cash
 * (a drawer cannot send a transfer, a house bank does not hold notes); between
 * UPI, NEFT, RTGS, IMPS and cheque it is the same house bank and it stays.
 */
export function changeMethod(line: PayoutLine, method: PayoutMethod): PayoutLine {
  if (method === line.method) return line;
  const next = { ...newPayoutLine(method), id: line.id, serverId: line.serverId, amount: line.amount };
  // UPI -> NEFT -> RTGS leaves from the same house bank, and so does a
  // cheque; only a move into or out of cash changes WHICH list it is from.
  const sameList = (line.method === "CASH") === (method === "CASH");
  return sameList ? { ...next, fromAccount: line.fromAccount } : next;
}

/* ── Money ───────────────────────────────────────────────────────────────── */

const paise = (value: number) => Math.round(value * 100);

function amountOf(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function noteRowsTotal(rows: CashNoteRow[]): number {
  return rows.reduce(
    (sum, row) => sum + (row.denomination ?? 0) * (Number(row.quantity) || 0),
    0,
  );
}

/** The receive-payment rule, word for word: the notes must add up exactly. */
export function cashBreakdownError(line: PayoutLine): string | null {
  if (line.method !== "CASH") return null;
  const amount = Number(line.amount) || 0;
  if (amount <= 0) return null;
  const breakdown = noteRowsTotal(line.noteRows);
  if (line.noteRows.length === 0 || breakdown === 0) {
    return `Add the cash denominations for ${formatINR(amount)}. The note breakdown is required for a cash payment.`;
  }
  if (paise(breakdown) === paise(amount)) return null;
  const difference = breakdown - amount;
  return difference < 0
    ? `Denominations are short by ${formatINR(Math.abs(difference))}. They must equal the amount entered.`
    : `Denominations exceed the amount by ${formatINR(difference)}. They must equal the amount entered.`;
}

/** Sum of every line with a valid amount, in paise then back. */
export function payoutTotal(payout: PayoutDetails): number {
  return (
    payout.lines.reduce((sum, line) => {
      const n = amountOf(line.amount);
      return sum + (Number.isNaN(n) || n <= 0 ? 0 : paise(n));
    }, 0) / 100
  );
}

/* ── Validation ──────────────────────────────────────────────────────────── */

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;

export interface PayoutValidation {
  missing: string[];
  problems: string[];
}

/**
 * What stops an approval.
 *
 * The payee's account and IFSC are asked only when some line is not cash — a
 * cash payment has no account to send to. Every line must name its source
 * account and carry its method's details; the lines together must come to
 * EXACTLY the request's payment amount, or the approval pays something other
 * than what was approved.
 */
export function validatePayout(payout: PayoutDetails, requestAmount: number): PayoutValidation {
  const missing: string[] = [];
  const problems: string[] = [];

  if (!payout.beneficiaryName.trim()) missing.push("Beneficiary Name");

  const needsAccount = payout.lines.some((line) => line.method !== "CASH");
  if (needsAccount) {
    if (!payout.toAccountNumber.trim()) missing.push("To Account Number");
    else if (!ACCOUNT.test(payout.toAccountNumber.trim())) {
      problems.push("To Account Number must be 9 to 18 digits.");
    }
    if (!payout.toIfsc.trim()) missing.push("IFSC");
    else if (!IFSC.test(payout.toIfsc.trim().toUpperCase())) {
      problems.push("IFSC must look like HDFC0001234 — 4 letters, a 0, then 6 letters or digits.");
    }
  }

  if (payout.lines.length === 0) missing.push("at least one payment method");

  payout.lines.forEach((line, index) => {
    const n = index + 1;
    const amount = amountOf(line.amount);
    if (!line.amount.trim()) missing.push(`Amount (method ${n})`);
    else if (Number.isNaN(amount) || amount <= 0) {
      problems.push(`Method ${n}: enter an amount above zero.`);
    }
    if (!line.fromAccount) missing.push(`From Account (method ${n})`);

    if (line.method === "CHEQUE") {
      if (!line.chequeNumber.trim()) missing.push(`Cheque Number (method ${n})`);
      if (!line.chequeDate) missing.push(`Cheque Date (method ${n})`);
    }
    const limit = Number.isNaN(amount) ? null : methodAmountError(line.method, amount);
    if (limit) problems.push(`Method ${n}: ${limit}`);
    const cash = cashBreakdownError(line);
    if (cash) problems.push(`Method ${n}: ${cash}`);
  });

  if (payout.lines.length > 0 && requestAmount > 0) {
    const total = payoutTotal(payout);
    const net = netPayable(payout, requestAmount);
    if (paise(total) !== paise(net)) {
      problems.push(
        payout.tds
          ? `The payment methods add up to ${formatINR(total)}, but the request pays ${formatINR(net)} ` +
              `after TDS of ${formatINR(payout.tds.amount)}.`
          : `The payment methods add up to ${formatINR(total)}, but the request is for ${formatINR(requestAmount)}.`,
      );
    }
  }

  return { missing, problems };
}
