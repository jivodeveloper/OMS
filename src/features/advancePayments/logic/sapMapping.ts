/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/sapMapping.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * SAP rows → the form's own shapes. The ONE place server data is converted.
 *
 * The form was built against `Partner` and `OpenDocument`; the server speaks
 * `card_code` / `doc_entry` / string amounts. Converting here, once, keeps the
 * rules module ignorant of where a row came from — a live SAP invoice and a
 * sample PO are the same `OpenDocument` to it, so the calculation, the rows
 * and the total need no second path.
 */
import type {
  AdvancePaymentCompany,
  DirectoryEmployee,
  SapAttachment,
  SapAttachmentKind,
  SapEmployee,
  SapLedgerDocument,
  SapOpenInvoice,
  SapOmsUsage,
  SapOpenPurchaseOrder,
  SapVendor,
} from "../../../services/advancePayment.service";

import {
  NOT_IN_SAP_PREFIX,
  type DocumentAttachment,
  type OmsUsage,
  type OpenDocument,
  type Partner,
} from "./constants";
import { formatINR } from "./rules";

/**
 * SAP money arrives as a string (`numeric(19,6)`). Parsed here and rounded to
 * the paisa; anything unparseable becomes 0 rather than NaN, because NaN
 * poisons every sum it touches and would show as "₹NaN" in the total.
 */
export function sapAmount(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Only the partners whose CardCode STARTS with `prefix` — VENDA for vendors,
 * ORGV for imprest accounts (see `PARTNER_CODE_PREFIX` in rules.ts).
 *
 * Applied to whatever the server returned, because its search is "contains"
 * on code OR name: searching "ORGV" would also return a vendor whose NAME
 * held those letters. Case-insensitive, like SAP's own codes are compared.
 */
export function withCodePrefix(vendors: SapVendor[], prefix: string | undefined): SapVendor[] {
  if (!prefix) return vendors;
  const want = prefix.toUpperCase();
  return vendors.filter((vendor) => vendor.card_code.toUpperCase().startsWith(want));
}

export function vendorToPartner(vendor: SapVendor): Partner {
  return {
    value: vendor.card_code,
    label: vendor.card_name || vendor.card_code,
    code: vendor.card_code,
  };
}

/**
 * An employee is their ADVANCE ACCOUNT: `value` is the GL account code, since
 * that is what an advance is posted to and what the server keys them by.
 * The payroll code, when the account name carries one, is shown beside it.
 */
export function employeeToPartner(employee: SapEmployee): Partner {
  const code = [employee.employee_code, employee.acct_code].filter(Boolean).join(" · ");
  return {
    value: employee.acct_code,
    label: employee.employee_name || employee.acct_name || employee.acct_code,
    code,
  };
}

/**
 * An employee from OMS's employee master who has no advance account in SAP.
 * Marked, so the picker says so, and keyed by their code (there is no GL
 * account to key them by).
 */
export function notInSapEmployeeToPartner(employee: DirectoryEmployee): Partner {
  return {
    value: `${NOT_IN_SAP_PREFIX}${employee.employee_code}`,
    label: employee.employee_name,
    code: `${employee.employee_code} · Not in SAP`,
    notInSap: true,
  };
}

/** "Name (CODE)": how an owner is written on a request. */
export function ownerLabel(employee: DirectoryEmployee): string {
  return `${employee.employee_name} (${employee.employee_code})`;
}

/**
 * An open A/P invoice as a payable document.
 *
 * `balance_due` is the server's `DocTotal - PaidToDate`, which is exactly the
 * form's "open amount"; it is taken as given rather than recomputed, so the
 * figure on screen is SAP's. The id is namespaced (`PCH-<DocEntry>`) because
 * DocEntry is only unique within one table of one company.
 */
export function invoiceToDocument(
  invoice: SapOpenInvoice,
  company?: AdvancePaymentCompany,
): OpenDocument {
  return {
    id: `PCH-${invoice.doc_entry}`,
    number: invoice.doc_num != null ? String(invoice.doc_num) : String(invoice.doc_entry),
    date: invoice.doc_date,
    partner: invoice.card_code,
    original: sapAmount(invoice.doc_total),
    paid: sapAmount(invoice.paid_to_date),
    open: sapAmount(invoice.balance_due),
    reference: invoice.party_ref || undefined,
    dueDate: invoice.due_date || undefined,
    currency: invoice.currency || undefined,
    attachment: toAttachment(invoice.attachment, company, "bill", invoice.doc_entry),
    oms: omsOf(invoice.oms),
    sapTds: invoice.tds != null ? { amount: sapAmount(invoice.tds) } : undefined,
  };
}

/**
 * An open PO as a payable document.
 *
 * `paid` is what has been RECEIVED against the order (SAP's `PaidToDate` on a
 * PO), and `open` is what is still to come — the part an advance can be raised
 * against. Both tax-inclusive, like `original`, so the three add up on screen.
 * Namespaced `POR-` for the same reason bills are `PCH-`.
 */
export function purchaseOrderToDocument(
  po: SapOpenPurchaseOrder,
  company?: AdvancePaymentCompany,
): OpenDocument {
  return {
    id: `POR-${po.doc_entry}`,
    number: po.doc_num != null ? String(po.doc_num) : String(po.doc_entry),
    date: po.doc_date,
    partner: po.card_code,
    original: sapAmount(po.doc_total),
    paid: sapAmount(po.received_amount),
    open: sapAmount(po.open_amount),
    reference: po.vendor_ref || undefined,
    dueDate: po.due_date || undefined,
    currency: po.currency || undefined,
    attachment: toAttachment(po.attachment, company, "po", po.doc_entry),
    oms: omsOf(po.oms),
    sapTds:
      po.tds_on_bills != null
        ? { amount: sapAmount(po.tds_on_bills), bills: po.billed ?? 0 }
        : undefined,
  };
}

/** What OMS holds against a document, as numbers; none when the server sent nothing. */
export function omsOf(usage: SapOmsUsage | undefined): OmsUsage | undefined {
  if (!usage) return undefined;
  return {
    // Only when the server says so: otherwise SAP's own figures, labelled as SAP's.
    tracked: usage.tracked === true,
    reserved: sapAmount(usage.reserved),
    paid: sapAmount(usage.paid),
    unadjusted: sapAmount(usage.unadjusted ?? "0"),
    available: sapAmount(usage.available),
    requests: usage.requests,
  };
}

/**
 * The customer ledger items a refund can be applied to, by SAP object type,
 * and whether SAP addresses each through the journal (TransId + line).
 * Payments already made out to the customer are not refunded against.
 */
export const REFUNDABLE_OBJECTS: Readonly<Record<number, { byJournal: boolean }>> = {
  13: { byJournal: false },
  14: { byJournal: false },
  24: { byJournal: true },
  30: { byJournal: true },
};

/**
 * A customer's open ledger item as a document a refund is applied to.
 *
 * CREDIT items (payments received, credit memos) are owed to the customer and
 * add to the refund; DEBIT items (their invoices) subtract — SAP nets the two
 * the same way. Null for an item that cannot be refunded against.
 */
export function ledgerToDocument(doc: SapLedgerDocument, partner: string): OpenDocument | null {
  const object = doc.doc_type_code ?? -1;
  const rule = REFUNDABLE_OBJECTS[object];
  if (!rule || doc.trans_id === null) return null;
  const entry = rule.byJournal ? doc.trans_id : (doc.doc_entry ?? doc.trans_id);
  const line = rule.byJournal ? (doc.line_id ?? 0) : 0;
  return {
    id: `LDG-${object}-${entry}-${line}`,
    number: doc.doc_num,
    date: doc.document_date || doc.posting_date || "",
    partner,
    original: sapAmount(doc.total_amount),
    paid: sapAmount(doc.settled_amount),
    open: sapAmount(doc.open_amount),
    docType: doc.doc_type,
    note: doc.direction === "CREDIT" ? "Owed to the customer" : "Owed by the customer — reduces the refund",
    reference: doc.party_ref || undefined,
    dueDate: doc.due_date || undefined,
    currency: doc.currency || undefined,
    ledger: { object, entry, line, direction: doc.direction },
    oms: omsOf(doc.oms),
  };
}

const COMPANY_CODES: readonly string[] = ["OIL", "BEVERAGES", "MART"];

/**
 * Which SAP document a chosen bill or PO is: its company, kind and DocEntry,
 * read back from its namespaced id (`PCH-` / `POR-`). Null for anything else
 * (sample data, the "All" list's other kinds) or without a company.
 */
export function sapDocumentOf(
  doc: OpenDocument,
  company?: string,
): { company: AdvancePaymentCompany; kind: SapAttachmentKind; docEntry: number } | null {
  const match = /^(PCH|POR)-(\d+)$/.exec(doc.id);
  const co = doc.attachment?.company ?? company;
  if (!match || !co || !COMPANY_CODES.includes(co)) return null;
  return {
    company: co as AdvancePaymentCompany,
    kind: match[1] === "PCH" ? "bill" : "po",
    docEntry: Number(match[2]),
  };
}

/** The latest SAP attachment, with what it takes to fetch it; none without a company. */
function toAttachment(
  attachment: SapAttachment | null | undefined,
  company: AdvancePaymentCompany | undefined,
  kind: SapAttachmentKind,
  docEntry: number,
): DocumentAttachment | undefined {
  if (!attachment || !company) return undefined;
  return {
    company,
    kind,
    docEntry,
    fileName: attachment.file_name,
    count: attachment.count,
    date: attachment.date,
  };
}

/**
 * A row of the vendor's "All" list.
 *
 * The id carries the object type as well as the entry, because this one list
 * mixes goods receipts, credit memos, payments and journals and their
 * DocEntries overlap across tables. A journal has no DocEntry at all, so its
 * JE number stands in.
 *
 * A DEBIT row is money the vendor owes US — a credit memo, a payment already
 * made on account, a goods return — and the note says so, because in a list
 * of "open documents" it would otherwise read as one more thing to pay.
 */
export function otherToDocument(doc: SapLedgerDocument, partner: string): OpenDocument {
  const key = doc.doc_entry ?? doc.trans_id ?? doc.doc_num;
  return {
    id: `OTH-${doc.doc_type_code ?? "x"}-${key}`,
    number: doc.doc_num,
    date: doc.document_date || doc.posting_date || "",
    partner,
    original: sapAmount(doc.total_amount),
    paid: sapAmount(doc.settled_amount),
    open: sapAmount(doc.open_amount),
    docType: doc.doc_type,
    note: doc.direction === "DEBIT" ? "Owed to us — reduces what is payable" : undefined,
    reference: doc.party_ref || undefined,
    dueDate: doc.due_date || undefined,
    currency: doc.currency || undefined,
  };
}

/* ── OMS's own record against a document ──────────────────────────────── */

export interface HistoryTarget {
  company: AdvancePaymentCompany;
  kind: "po" | "bill" | "ledger";
  docEntry: number;
  line: number;
}

/** Which SAP document a chosen bill, PO or ledger item is, for its history. Null for anything else. */
export function historyTargetOf(doc: OpenDocument, company: string): HistoryTarget | null {
  if (!COMPANY_CODES.includes(company)) return null;
  const co = company as AdvancePaymentCompany;
  if (doc.ledger) return { company: co, kind: "ledger", docEntry: doc.ledger.entry, line: doc.ledger.line };
  const match = /^(PCH|POR)-(\d+)$/.exec(doc.id);
  if (!match) return null;
  return { company: co, kind: match[1] === "PCH" ? "bill" : "po", docEntry: Number(match[2]), line: 0 };
}

/** "₹10 reserved · ₹40 paid via OMS · ₹50 available", for a picker line; "" when OMS holds nothing. */
export function omsSummary(doc: OpenDocument): string {
  const oms = doc.oms;
  if (!oms || (!oms.reserved && !oms.paid)) return "";
  return [
    oms.reserved ? `${formatINR(oms.reserved)} reserved` : null,
    oms.paid
      ? `${formatINR(oms.paid)} paid via OMS` +
        (doc.id.startsWith("POR-") ? ` (${formatINR(oms.unadjusted)} still on account)` : "")
      : null,
    `${formatINR(oms.available)} available`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Whether SAP withheld TDS — said before a document is ticked, so a requester
 * knows whether the payment still has TDS to come. A PO never carries TDS in
 * SAP; its bills do, so a PO speaks for the bills raised from it.
 */
export function sapTdsLabel(doc: OpenDocument): string | null {
  const tds = doc.sapTds;
  if (!tds) return null;
  if (tds.bills === undefined) {
    return tds.amount > 0 ? `TDS deducted in SAP ${formatINR(tds.amount)}` : "No TDS deducted in SAP";
  }
  if (tds.bills === 0) return "Not billed yet — no TDS deducted in SAP";
  const bills = `${tds.bills} ${tds.bills === 1 ? "bill" : "bills"}`;
  return tds.amount > 0
    ? `TDS deducted in SAP ${formatINR(tds.amount)} on its ${bills}`
    : `No TDS deducted in SAP on its ${bills}`;
}
