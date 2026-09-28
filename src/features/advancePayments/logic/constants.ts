/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/constants.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * Advance Payments — option lists, and the SAMPLE data for the cases not yet
 * connected to SAP.
 *
 * LIVE FROM SAP (see `services/advancePaymentService.ts`): the vendor list
 * (VENDA codes), Employee Imprest's accounts (ORGV codes), Vendor → Against
 * Bill's open invoices, and the Employee Advance employee list.
 *
 * STILL SAMPLE DATA, BY DECISION: Against PO (the server's "open amount" means
 * something different — see the service header) and "All" (the server has no
 * GRN/JV/contract lookups yet). The vendors below exist only to own those
 * sample documents; they never appear in a case that reads SAP.
 *
 * THE RELATIONSHIPS ARE REAL EVEN THOUGH THE DATA IS NOT. Every vendor bill,
 * PO and other open document names the partner it belongs to by `partner`, and the form filters on
 * that — so picking a vendor shows that vendor's documents and no one else's,
 * exactly as it will when these arrays become endpoints. The set is also
 * chosen so the filters visibly DO something: some vendors have bills and no
 * PO, one has a PO and no bills, and two have neither, so each partner list
 * is a different subset of the vendors.
 *
 * The rules that decide which of these a case uses live in `rules.ts`.
 */

/** The three operating companies, as the rest of OMS names them. */
import type { AttachmentCheck } from "@/src/services/advancePayment.service";

export const COMPANIES = ["OIL", "MART", "BEVERAGES"] as const;
export type Company = (typeof COMPANIES)[number];

/* ── Types and what each is against ──────────────────────────────────────── */

/**
 * Who the money goes to, and on what footing.
 *
 * Employee Advance and Employee Imprest pay the same people and are still two
 * types: an imprest is a standing float, an advance is money ahead of one
 * expense, and the form will treat them differently once those rules are
 * settled (see `CASE_RULES` in `rules.ts`).
 */
export const PARTNER_TYPES = [
  { value: "VENDOR", label: "Vendor" },
  // Shown as "Employee". The value stays EMPLOYEE_ADVANCE: it is the key the
  // rules, the tests and any saved request are written against, and a label
  // is not a reason to rename a key.
  { value: "EMPLOYEE_ADVANCE", label: "Employee" },
  { value: "EMPLOYEE_IMPREST", label: "Employee Imprest" },
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number]["value"];

/**
 * Every answer Payment Against can have. Which of them a TYPE offers is
 * decided in `CASE_RULES` (rules.ts) — Against PO is a vendor-only answer,
 * because employees have no purchase orders.
 */
export const PAYMENT_AGAINST_OPTIONS = [
  { value: "ADVANCE", label: "Advance" },
  { value: "AGAINST_BILL", label: "Against Bill" },
  { value: "AGAINST_PO", label: "Against PO" },
  // Every OTHER open vendor document — GRNs, work orders, journal vouchers,
  // contracts. Deliberately NOT bills or POs: those have their own answers
  // above, and listing them twice would let one bill be paid from two places.
  { value: "ALL", label: "All" },
  { value: "OTHER", label: "Other" },
] as const;
export type PaymentAgainst = (typeof PAYMENT_AGAINST_OPTIONS)[number]["value"];

/* ── Partners ────────────────────────────────────────────────────────────── */

export interface Partner {
  value: string;
  label: string;
  /** Card code / employee code — shown beside the name and searchable. */
  code: string;
  /**
   * An employee from OMS's employee master with NO employee-advance account
   * in SAP. Offered so the requester can see them, but an advance cannot be
   * posted until their master is created in SAP.
   */
  notInSap?: boolean;
}

/**
 * The `value` of a not-in-SAP employee: there is no advance account to use,
 * so the employee code, prefixed, stands in for it.
 */
export const NOT_IN_SAP_PREFIX = "NOSAP:";
export const isNotInSap = (partner: string) => partner.startsWith(NOT_IN_SAP_PREFIX);

/**
 * Dummy vendors. `code` stands in for the SAP CardCode.
 *
 * SAMPLE vendors — used ONLY by the two cases still on sample data (Against
 * PO and All). Every other vendor case lists SAP's real vendors instead.
 *
 * Who has what, which is what the partner filters are tested against:
 *
 *                      POs   other documents ("All")
 *   ABC Technologies    ✓      ✓  GRN
 *   XYZ Traders         ✓      ✓  journal voucher
 *   PQR Suppliers       ✗      ✗
 *   Metro Print         ✓      ✗
 *   Shree Packaging     ✗      ✓  GRN, contract
 *   Gupta Transport     ✗      ✓  work order, journal voucher
 */
export const VENDORS: Partner[] = [
  { value: "V-1001", label: "ABC Technologies", code: "SUPPA001001" },
  { value: "V-1002", label: "XYZ Traders", code: "SUPPA001002" },
  { value: "V-1003", label: "PQR Suppliers", code: "SUPPA001003" },
  { value: "V-1004", label: "Metro Print & Labels", code: "SUPPA001004" },
  { value: "V-1005", label: "Shree Packaging Industries", code: "SUPPA001005" },
  { value: "V-1006", label: "Gupta Transport Carriers", code: "SUPPA001006" },
];

/* ── Open documents ──────────────────────────────────────────────────────── */

/**
 * One open document a payment can be made against — a bill, a PO, or one of
 * the other vendor documents under "All".
 *
 * One shape for all three because the form does the same thing with each:
 * pick one, read its open amount, pay some or all of it. Only the words
 * differ, and those live in `REFERENCE_KINDS`.
 *
 * `open` is stored rather than derived from `original - paid` so the data
 * reads like the document it imitates; `rules.test.ts` checks the three agree.
 */
export interface OpenDocument {
  id: string;
  /** The document number the requester recognises. */
  number: string;
  /** ISO date. */
  date: string;
  /** The partner (`Partner.value`) this document belongs to. */
  partner: string;
  original: number;
  /** Paid, or advanced, against it so far. */
  paid: number;
  open: number;
  /** A line of context, where the number alone says nothing. */
  note?: string;
  /**
   * What KIND of document it is — "Goods Receipt", "Work Order". Only the
   * "All" list carries it, because only there do different kinds sit side by
   * side; a list of bills does not need to say each one is a bill.
   */
  docType?: string;
  /** The partner's own number for it — a vendor's invoice no. (`NumAtCard`). */
  reference?: string;
  /** ISO date the document falls due, where SAP has one. */
  dueDate?: string;
  currency?: string;
  /**
   * The document's latest SAP attachment, where it has one. Carries what it
   * takes to fetch it (company, kind, DocEntry), because it travels with the
   * chosen document onto the approval desk.
   */
  attachment?: DocumentAttachment;
  /**
   * What reading that attachment found, once it has been read: kept with the
   * request so the approvers see it without the file being read again.
   */
  reading?: AttachmentCheck | null;
}

export interface DocumentAttachment {
  company: "OIL" | "MART" | "BEVERAGES";
  kind: "po" | "bill";
  docEntry: number;
  fileName: string;
  /** How many attachments the document has; the latest is the one shown. */
  count: number;
  date: string;
}

/** Dummy open purchase orders, keyed to vendors. `paid` = already advanced. */
export const VENDOR_POS: OpenDocument[] = [
  { id: "P-1", number: "PO-4501", date: "2026-07-22", partner: "V-1001", original: 500000, paid: 150000, open: 350000 },
  { id: "P-2", number: "PO-4512", date: "2026-08-08", partner: "V-1002", original: 180000, paid: 0, open: 180000 },
  { id: "P-3", number: "PO-4519", date: "2026-08-21", partner: "V-1002", original: 95000, paid: 30000, open: 65000 },
  { id: "P-4", number: "PO-4527", date: "2026-09-05", partner: "V-1004", original: 72000, paid: 0, open: 72000 },
];

/**
 * Dummy OTHER open vendor documents — the "All" list.
 *
 * Everything a vendor can be paid against that is neither a bill nor a PO,
 * using the document kinds an Indian A/P desk (and SAP B1) actually carries:
 *
 *   * Goods Receipt (GRN) — goods are in, the invoice is not yet;
 *   * Work Order          — services ordered and running, billed in stages;
 *   * Journal Voucher     — a general-ledger credit to the vendor: a rate
 *                           difference, detention, a settlement;
 *   * Contract            — an agreement paid by milestone.
 *
 * Credit and debit notes are deliberately NOT here: they carry negative open
 * amounts, and netting them against these is a rule nobody has agreed yet.
 */
export const VENDOR_OTHER_DOCUMENTS: OpenDocument[] = [
  { id: "D-1", number: "GRN-2201", docType: "Goods Receipt", date: "2026-08-12", partner: "V-1001", original: 64000, paid: 0, open: 64000, note: "Received against PO-4501 — invoice awaited" },
  { id: "D-2", number: "JV-5520", docType: "Journal Voucher", date: "2026-08-30", partner: "V-1002", original: 15000, paid: 0, open: 15000, note: "Rate difference — July supplies" },
  { id: "D-3", number: "GRN-2214", docType: "Goods Receipt", date: "2026-09-03", partner: "V-1005", original: 38500, paid: 0, open: 38500, note: "Corrugated boxes — 5,000 pcs" },
  { id: "D-4", number: "CT-0412", docType: "Contract", date: "2026-04-01", partner: "V-1005", original: 200000, paid: 150000, open: 50000, note: "Annual packaging supply — milestone 3" },
  { id: "D-5", number: "WO-3107", docType: "Work Order", date: "2026-09-01", partner: "V-1006", original: 120000, paid: 40000, open: 80000, note: "Monthly freight — September" },
  { id: "D-6", number: "JV-5534", docType: "Journal Voucher", date: "2026-09-08", partner: "V-1006", original: 8200, paid: 0, open: 8200, note: "Detention charges — 2 trucks" },
];

/* ── Everything else ─────────────────────────────────────────────────────── */

/**
 * Priority, with the colour it carries WHEN CHOSEN.
 *
 * Unchosen options are deliberately colourless — a grey ring and grey text —
 * so the one that is chosen is the only coloured thing in the row. With a
 * coloured dot on all three, the chosen card differed from the others only by
 * a faint border, and the choice did not read at a glance.
 *
 * The tones are the app's semantic tokens, and the same ones the priority
 * BADGES use on the lists (ok / hold / bad), so "High" is the same red on the
 * form as on the approval desk.
 */
export const PRIORITIES = [
  {
    value: "LOW",
    label: "Low",
    active: "border-ok bg-ok-soft text-ok ring-ok/20",
  },
  {
    value: "MEDIUM",
    label: "Medium",
    active: "border-hold bg-hold-soft text-hold ring-hold/20",
  },
  {
    value: "HIGH",
    label: "High",
    active: "border-danger bg-danger-soft text-danger ring-danger/20",
  },
] as const;
export type Priority = (typeof PRIORITIES)[number]["value"];

export const PAYMENT_MODES = [
  { value: "FIXED", label: "Fixed Amount" },
  { value: "PERCENT", label: "Percentage" },
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number]["value"];

/**
 * How an employee advance comes back. Only EMI asks anything further (how
 * many installments); the repayment schedule itself is not modelled yet.
 */
export const RETURN_METHODS = [
  { value: "ONE_TIME", label: "One Time" },
  { value: "EMI", label: "EMI" },
  { value: "CUSTOM", label: "Other / Custom" },
] as const;
export type ReturnMethod = (typeof RETURN_METHODS)[number]["value"];

/** The one-click percentages. Any other value can still be typed. */
export const QUICK_PERCENTAGES = [10, 25, 50, 75, 100] as const;

/** What the attachment strip says it takes. Enforced in the browser only. */
export const ACCEPTED_FILE_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
export const MAX_FILE_SIZE_MB = 10;
