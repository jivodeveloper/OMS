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
  SapOpenPurchaseOrder,
  SapVendor,
} from "../../../services/advancePayment.service";

import { NOT_IN_SAP_PREFIX, type DocumentAttachment, type OpenDocument, type Partner } from "./constants";

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
