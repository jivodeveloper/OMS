/**
 * advancePaymentService (app) — the Advance Payment API, as the web client uses it.
 *
 * Mirrors `OMS-Frontend/src/services/advancePaymentService.ts` field for field,
 * against the same `/api/advance-payments/` endpoints: the SAP lookups the form
 * needs, and the request endpoints that raise, edit, act on and pay a request.
 * Keeping the types identical is what stops the two clients forming different
 * ideas of one request.
 *
 * Every SAP lookup takes a company and the server REQUIRES it — the three
 * company databases reuse document numbers, so there is no safe default.
 *
 * Amounts arrive as STRINGS (SAP money is `numeric(19,6)`); they are converted
 * in one place, `features/advancePayments/logic/sapMapping`.
 *
 * THIS CLIENT DOES NOT THROW. `src/services/api.ts` resolves with
 * `{success: false, message, status, errors}` on any non-2xx, so every call
 * below goes through `guard()` and failures arrive as `AdvancePaymentApiError`
 * with the status intact. Do not read `err.response.status` here — that is an
 * axios shape this client never produces.
 */
import { API_BASE_URL, api } from "./api";
import { storage } from "../utils/storage";

import type { PickedFile } from "../features/advancePayments/logic/attachments";

const BASE = "/advance-payments";

/** How many rows a picker asks for. The server caps at 500. */
const PICKER_LIMIT = 100;
/** The server's own cap — for a caller that filters what comes back. */
export const SAP_MAX_ROWS = 500;
const DOCUMENT_LIMIT = 500;

/** Anything that reads request state is `no-store`: a stale list shows a
 *  decision the user has already made. */
const FRESH = { cache: "no-store" } as const;

export type AdvancePaymentCompany = "OIL" | "MART" | "BEVERAGES";

/* ------------------------------------------------------------------ *
 * Types — mirror advance_payment/services/sap.py
 * ------------------------------------------------------------------ */

export interface SapVendor {
  card_code: string;
  card_name: string;
  gstin: string;
  currency: string;
  /** SAP's sign convention, passed through. */
  balance: string;
  phone: string;
  email: string;
}

/**
 * An employee, as the server finds them: a postable GL account under
 * `1113000 EMPLOYEES ADVANCES`, with the name and payroll code parsed out of
 * the account name. `acct_code` is what an advance is posted to.
 */
export interface SapEmployee {
  employee_code: string;
  employee_name: string;
  acct_code: string;
  acct_name: string;
  /** Outstanding advance on the account. */
  balance: string;
}

/**
 * A document's LATEST SAP attachment (its last ATC1 line), as the open PO and
 * open invoice lists carry it. `count` is how many the document has in all.
 */
export interface SapAttachment {
  file_name: string;
  count: number;
  date: string;
}

/** A check on a payment proof: matches, shows something else, or cannot tell. */
export type ProofCheck = boolean | null;

/** What `/payment-proof/` found in an uploaded statement or advice. */
export interface PaymentProofResult {
  /** "advice" (one payment) or "statement" (many). */
  kind: "advice" | "statement";
  utr: string | null;
  channel: string | null;
  amount: number | null;
  date: string;
  /** The row the UTR was on, as read. */
  row_text: string;
  score: number;
  checks: {
    amount: ProofCheck;
    account: ProofCheck;
    /** A different SAP account of the same payee, when that is what it shows. */
    account_other: string | null;
    invoice: ProofCheck;
  };
  candidates: Array<{ utr: string; channel: string; amount: number | null; date: string; row_text: string; score: number }>;
  references_found: number;
  file_name: string;
  /** pdf-text | ocr | pdf-text+ocr | excel | csv */
  source: string;
  pages: number;
  ocr_pages: number;
  rows_read: number;
}

export interface PaymentProofQuery {
  company: AdvancePaymentCompany;
  amount: string;
  toAccount: string;
  cardCode: string;
  invoices: string[];
}

/** An employee in OMS's employee master (`/employee-master/`, admins only). */
export interface MasterEmployee {
  id: number;
  /** JSAP's EmployeeId; null for an employee added in OMS. */
  employee_id: number | null;
  employee_code: string;
  employee_name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  /** 1 HOD, 2 Sub-HOD, 3 Executive. */
  role: 1 | 2 | 3;
  role_label: string;
  gender: "M" | "F" | null;
  is_active: boolean;
  created_on: string;
}

export type NewMasterEmployee = Omit<MasterEmployee, "id" | "role_label" | "created_on">;

/** A department, with its sub-departments (OMS's own list, copied from JSAP). */
export interface OmsDepartment {
  id: number;
  name: string;
  sub_departments: Array<{ id: number; name: string }>;
}

/** One active employee from the master, as the request form's pickers read it. */
export interface DirectoryEmployee {
  employee_code: string;
  employee_name: string;
  role: 1 | 2 | 3;
  role_label: string;
  designation: string | null;
}

export interface DirectoryQuery {
  /** Only these roles: 1 HOD, 2 Sub-HOD, 3 Executive. */
  roles?: Array<1 | 2 | 3>;
  search?: string;
  /** Only employees with NO employee-advance account in SAP for this company. */
  notInSapFor?: AdvancePaymentCompany;
}

/** One field read off an attachment: its value, SAP's, and whether they agree. */
export interface ReadField<T = string> {
  value: T | null;
  sap: T | string | null;
  /** true agrees with SAP, false differs, null not found / nothing to compare. */
  match: boolean | null;
}

/** What `/document-attachment/read/` found on a PO's / bill's attachment. */
export interface AttachmentReading {
  file_name: string;
  attachment_count: number;
  /** pdf-text | ocr | pdf-text+ocr | excel | csv */
  source: string;
  pages: number;
  fields: {
    invoice_number: ReadField;
    invoice_date: ReadField;
    amount: ReadField<number>;
    party_name: ReadField;
    account_number: ReadField;
    ifsc: ReadField;
  };
}

/** A Payment Purpose choice: SAP's Budget (dimension 3) or Sub Budget (4) cost centre. */
export interface SapBudget {
  kind: "BUDGET" | "SUB_BUDGET";
  code: string;
  name: string;
}

/**
 * A partner's open ledger (`/open-documents/`), with its totals.
 *
 * `net_open_means` is the server's own words for which way the balance runs
 * — a signed figure alone is read backwards about half the time.
 */
export interface SapPartnerLedger {
  summary: {
    open_count: number;
    open_debit: string;
    open_credit: string;
    net_open: string;
    net_open_means: string;
    overdue_count: number;
  };
  results: (SapLedgerDocument & { days_overdue: number | null })[];
}

/**
 * A document's attachment reading as SAVED WITH THE REQUEST: what
 * `/document-attachment/read/` answered when it was raised, or why it could
 * not be read. Read once, at submission, so the approvers see what the
 * requester's document said without the file being opened again — and without
 * the answer changing under them if the attachment is replaced later.
 */
export type AttachmentCheck = AttachmentReading | { error: string };

/** The document kinds `/document-attachment/` reads. */
export type SapAttachmentKind = "po" | "bill";

export interface SapOpenInvoice {
  doc_entry: number;
  doc_num: number | null;
  card_code: string;
  card_name: string;
  /** The vendor's own invoice number (`NumAtCard`). */
  party_ref: string;
  doc_date: string;
  due_date: string;
  currency: string;
  doc_total: string;
  paid_to_date: string;
  balance_due: string;
  attachment: SapAttachment | null;
}

/**
 * An open purchase order. All three amounts are tax-inclusive and add up:
 * `doc_total = received_amount + open_amount`.
 *
 * `received_amount` is SAP's `PaidToDate` on a PO, which is the value of goods
 * already RECEIVED — not advances. SAP holds no advances against POs at all
 * (no A/P down payments, no payments applied to a PO), so there is nothing to
 * net off here yet.
 */
export interface SapOpenPurchaseOrder {
  doc_entry: number;
  doc_num: number | null;
  card_code: string;
  card_name: string;
  /** The vendor's own reference for the order (`NumAtCard`). */
  vendor_ref: string;
  doc_date: string;
  due_date: string;
  currency: string;
  doc_total: string;
  tax_amount: string;
  received_amount: string;
  open_amount: string;
  remarks: string;
  attachment: SapAttachment | null;
}

/**
 * One open document from a partner's ledger or receipts — the row shape of
 * `/open-documents/` and `/open-other-documents/`.
 *
 * `direction` is from the ledger: CREDIT is owed TO the vendor (a goods
 * receipt, like the bill it will become); DEBIT is owed BY them (a credit
 * memo, a payment already made on account, a goods return).
 */
export interface SapLedgerDocument {
  trans_id: number | null;
  doc_type_code: number | null;
  /** "Goods Receipt PO", "A/P Credit Memo", "Outgoing Payment", … */
  doc_type: string;
  doc_entry: number | null;
  doc_num: string;
  party_ref: string;
  document_date: string | null;
  posting_date: string | null;
  due_date: string | null;
  direction: "DEBIT" | "CREDIT";
  total_amount: string;
  open_amount: string;
  settled_amount: string;
  currency: string;
  remarks: string;
}

/**
 * One of the payee's bank accounts, as SAP holds it (OCRB, with the default
 * named on the partner). IFSC is SAP's SWIFT field, which is where this
 * installation keeps it. Values arrive cleaned of the spreadsheet apostrophe.
 */
export interface SapPartnerBankAccount {
  id: number | null;
  bank_code: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  ifsc_valid: boolean;
  branch: string;
  /** The account holder's name — "as per bank records". */
  account_name: string;
  is_default: boolean;
}

/**
 * One of OUR bank accounts, one per bank G/L (current accounts and CC / OD).
 * `key` is the G/L code. `house_bank` says whether SAP also has it set up as
 * a house bank; only then are `bank_code`, `bank_name` and `ifsc` known.
 */
export interface SapHouseBank {
  key: string;
  gl_account: string;
  gl_name: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  branch: string;
  ifsc: string;
  house_bank: boolean;
}

/** One of OUR cash G/L accounts (children of 1105000 CASH IN HAND). */
export interface SapCashAccount {
  acct_code: string;
  acct_name: string;
  balance: string;
}

/* ------------------------------------------------------------------ *
 * Payment requests — mirror advance_payment/serializers.py `request_data`
 * ------------------------------------------------------------------ */

/** The server's request statuses. */
export type ApiRequestStatus = "IN_APPROVAL" | "RETURNED" | "COMPLETED" | "REJECTED" | "CANCELLED";

/**
 * What a stage does, from its name in the Workflows page: any stage before
 * Payment is an APPROVAL (named freely, as many as the route needs); the
 * last three are Payment, Audit and Final by name.
 */
export type StageRole = "APPROVAL" | "PAYMENT" | "AUDIT" | "FINAL";

export interface ApiUser {
  id: number;
  name: string;
  username: string;
}

export interface ApiRequestDocument {
  id?: number;
  kind: "BILL" | "PO";
  sap_doc_entry: number;
  sap_doc_num: string;
  vendor_ref: string;
  doc_date: string | null;
  due_date: string | null;
  original_amount: string;
  paid_amount: string;
  open_amount: string;
  mode: "FIXED" | "PERCENT";
  percentage: string | null;
  amount: string;
  attachment_file: string;
  attachment_count: number;
  attachment_date: string | null;
  attachment_check?: AttachmentCheck | null;
}

export interface ApiRequestFile {
  id: number;
  name: string;
  size: number;
  purpose: "SUPPORTING" | "BANK_PROOF" | "PAYMENT_PROOF";
  payout_line_id: number | null;
  uploaded_by: ApiUser | null;
  uploaded_on: string | null;
}

export interface ApiPayoutLine {
  id?: number;
  method: "UPI" | "NEFT" | "RTGS" | "IMPS" | "CHEQUE" | "CASH";
  amount: string;
  from_account: string;
  from_account_label?: string;
  cheque_number: string;
  cheque_bank: string;
  cheque_date: string | null;
  cash_notes: Array<{ denomination: number; quantity: number }>;
  utr?: string;
  utr_proof?: Record<string, unknown> | null;
  utr_recorded_by?: ApiUser | null;
  utr_recorded_on?: string | null;
}

export interface ApiPayout {
  beneficiary_name: string;
  to_account_number: string;
  to_ifsc: string;
  to_account_manual: boolean;
  lines: ApiPayoutLine[];
  updated_by?: ApiUser | null;
  updated_on?: string | null;
}

export interface ApiVoucher {
  id: number;
  version: number;
  status: "POSTED" | "FAILED" | "CANCELLED";
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  error: string;
  posted_by: ApiUser | null;
  posted_on: string | null;
  cancelled_by: ApiUser | null;
  cancelled_on: string | null;
}

export interface ApiRequestLog {
  id: number;
  action: string;
  label: string;
  cycle: number;
  stage_name: string;
  actor: ApiUser | null;
  on_behalf_of: ApiUser | null;
  from_status: string;
  to_status: string;
  remarks: string;
  data: Record<string, unknown> | null;
  created_on: string;
}

export interface ApiStage {
  stage_id: number;
  name: string;
  role: StageRole | "";
  sequence: number;
  /** CURRENT, UPCOMING, or what was done there this round: APPROVED, REJECTED, RETURNED, SENT_BACK. */
  state: string;
  user_id: number | null;
  user_name: string;
  acted_by_id: number | null;
  acted_on: string | null;
}

/** What the caller may do to the request now: the buttons to show. */
export interface RequestAbilities {
  edit: boolean;
  cancel: boolean;
  resubmit: boolean;
  approve: boolean;
  reject: boolean;
  return_to_creator: boolean;
  send_back: boolean;
  edit_payout: boolean;
  record_utr: boolean;
  /**
   * The payee's account — payment details, proofs, their change log, the SAP
   * balance and ledger — is sent to Payment and later stages only. Before
   * that the server omits them, so a screen must ask rather than assume.
   */
  see_account: boolean;
}

export interface ApiRequestFields {
  company: AdvancePaymentCompany;
  request_type: "VENDOR" | "EMPLOYEE_ADVANCE" | "EMPLOYEE_IMPREST";
  payment_against: string;
  payment_against_other: string;
  partner_code: string;
  partner_name: string;
  amount: string;
  expected_date: string | null;
  expected_bill_date: string | null;
  return_method: string;
  return_method_other: string;
  installments: number | null;
  emi_amount: string | null;
  expected_from_date: string | null;
  expected_to_date: string | null;
  payment_date: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  remarks: string;
  owner_label: string;
  /** Payment Purpose: SAP's Budget and Sub Budget cost-centre codes. */
  budget_code: string;
  sub_budget_code: string;
}

/** What the form sends to raise or edit a request. */
export interface ApiRequestInput extends ApiRequestFields {
  department_id: number | null;
  sub_department_id: number | null;
  documents: ApiRequestDocument[];
}

export interface ApiRequest extends ApiRequestFields {
  id: number;
  request_no: string;
  department: { id: number; name: string };
  sub_department: { id: number; name: string } | null;
  partner_not_in_sap: boolean;
  currency: string;
  owner_employee_id: number | null;
  /** The Budget / Sub Budget names as SAP had them when the request was raised. */
  budget_name: string;
  sub_budget_name: string;
  status: ApiRequestStatus;
  created_by: ApiUser;
  created_on: string;
  updated_on: string;
  documents: ApiRequestDocument[];
  files: ApiRequestFile[];
  payout: ApiPayout | null;
  flow: {
    status: string;
    workflow: string;
    current_stage: string;
    current_role: StageRole | "";
    current_user: ApiUser | null;
    cycle: number;
    version: number;
    total_stages: number;
    awaiting_me: boolean;
  } | null;
  can: RequestAbilities;
  /**
   * What THIS caller last did to it: APPROVED, REJECTED, RETURNED, SENT_BACK,
   * or "" if they have never decided it.
   *
   * The approval desk filters on this rather than on `status`: a request the
   * reader approved at stage 1 is still IN_APPROVAL while stage 2 holds it, so
   * the document's own status cannot say who has already dealt with it.
   */
  my_action: string;
  /** The SAP outgoing payment, once Final's approval has posted it. */
  voucher: ApiVoucher | null;
  /** The latest return, send-back or rejection: what someone must act on. */
  last_decision: ApiRequestLog | null;
  /**
   * The viewer's OWN latest approve / reject / return / send-back on it, or
   * null. `my_action` beside it is the same fact as a bare action string,
   * which is what `deskStatus` files a request under.
   */
  my_decision?: ApiRequestLog | null;
  /* Detail only. */
  vouchers?: ApiVoucher[];
  logs?: ApiRequestLog[];
  stages?: ApiStage[];
}

export type RequestScope = "mine" | "desk";
export type StageAction = "approve" | "reject" | "return" | "send-back" | "cancel" | "resubmit";


/* ------------------------------------------------------------------ *
 * Errors and envelopes
 * ------------------------------------------------------------------ */

/** A failed Advance Payment call, with the status and the server's detail. */
export class AdvancePaymentApiError extends Error {
  status?: number;
  errors?: Record<string, unknown>;

  constructor(message: string) {
    super(message);
    this.name = "AdvancePaymentApiError";
  }
}

/** Throw on a failed response; otherwise hand the body back untouched. */
function guard(res: any): any {
  const failed =
    res == null ||
    res.success === false ||
    (typeof res.status === "number" && (res.status < 200 || res.status >= 300));
  if (!failed) return res;

  const error = new AdvancePaymentApiError(
    res?.message || "The request could not be completed.",
  );
  error.status = typeof res?.status === "number" ? res.status : undefined;
  error.errors = res?.errors;
  return Promise.reject(error);
}

const unwrap = <T,>(body: any): T =>
  body && typeof body === "object" && "data" in body ? (body.data as T) : (body as T);

const rows = <T,>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

/**
 * A readable sentence from a failure.
 *
 * The server's message is passed through when there is one — for a 503 it
 * names the company and what could not be read, which is what someone
 * chasing an outage needs.
 */
export function advancePaymentError(err: unknown): string {
  const status = (err as AdvancePaymentApiError)?.status;
  const message = (err as Error)?.message;

  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return message || "You do not have the Advance_Payment permission.";
  if (status === 503) return message || "SAP could not be reached. Try again shortly.";
  if (message) return message;
  return "Could not load from SAP. Please try again.";
}

/** The problems a refused action lists, beside its message. */
export function advancePaymentProblems(err: unknown): string[] {
  const problems = (err as AdvancePaymentApiError)?.errors?.problems;
  return Array.isArray(problems) ? (problems as string[]) : [];
}

/** `?a=1&b=2`, leaving out anything empty. */
const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

/**
 * A file as React Native's FormData sends one. `expo-document-picker` and
 * `expo-image-picker` both hand back a uri; the cast is what RN's polyfill
 * expects and TypeScript's DOM `FormData` does not describe.
 */
function appendFile(body: FormData, field: string, file: PickedFile): void {
  body.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || "application/octet-stream",
  } as unknown as Blob);
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const advancePaymentService = {
  /* --- SAP lookups -------------------------------------------------- */

  /**
   * Active, unfrozen suppliers matching `search` (code OR name, contains).
   * A caller that narrows further after the rows arrive — the VENDA / ORGV
   * prefix filter — asks for more, so the narrowing has enough to work on.
   */
  vendors: async (
    company: AdvancePaymentCompany,
    search = "",
    limit = PICKER_LIMIT,
  ): Promise<SapVendor[]> =>
    rows<SapVendor>(
      guard(await api.get(`${BASE}/vendors/${query({ company, search, limit })}`)),
    ),

  /** Employee advance accounts matching `search`. */
  employees: async (company: AdvancePaymentCompany, search = ""): Promise<SapEmployee[]> =>
    rows<SapEmployee>(
      guard(
        await api.get(`${BASE}/employees/${query({ company, search, limit: PICKER_LIMIT })}`),
      ),
    ),

  /** One vendor's open A/P invoices (OPCH), oldest due first. */
  openVendorInvoices: async (
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapOpenInvoice[]> =>
    rows<SapOpenInvoice>(
      guard(
        await api.get(
          `${BASE}/open-invoices/${query({
            company,
            party_type: "vendor",
            card_code: cardCode,
            limit: DOCUMENT_LIMIT,
          })}`,
        ),
      ),
    ),

  /**
   * One vendor's open purchase orders — only those with something still to
   * receive — newest first.
   */
  openVendorPurchaseOrders: async (
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapOpenPurchaseOrder[]> =>
    rows<SapOpenPurchaseOrder>(
      guard(
        await api.get(
          `${BASE}/open-purchase-orders/${query({
            company,
            card_code: cardCode,
            limit: DOCUMENT_LIMIT,
          })}`,
        ),
      ),
    ),

  /**
   * The vendor's "All": every open document except its bills and POs — goods
   * receipts not yet billed, goods returns, credit memos, payments on account
   * and journals. Oldest due first.
   */
  openOtherDocuments: async (
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapLedgerDocument[]> =>
    rows<SapLedgerDocument>(
      guard(
        await api.get(
          `${BASE}/open-other-documents/${query({
            company,
            card_code: cardCode,
            limit: DOCUMENT_LIMIT,
          })}`,
        ),
      ),
    ),

  /**
   * The company's Budget and Sub Budget cost centres, for Payment Purpose.
   *
   * Cost centres belong to ONE company's SAP, so this is re-read whenever the
   * company changes and a code chosen under one company means nothing under
   * another.
   */
  budgets: async (company: AdvancePaymentCompany): Promise<SapBudget[]> =>
    rows<SapBudget>(guard(await api.get(`${BASE}/budgets/${query({ company })}`))),

  /**
   * A partner's whole open ledger (JDT1, as SAP's own ageing reads it),
   * oldest due first, with the totals that say which way the balance runs.
   */
  partnerLedger: async (
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapPartnerLedger> =>
    unwrap<SapPartnerLedger>(
      guard(
        await api.get(
          `${BASE}/open-documents/${query({
            company,
            card_code: cardCode,
            limit: DOCUMENT_LIMIT,
          })}`,
        ),
      ),
    ),

  /** Every bank account of the company, house bank or not. */
  houseBanks: async (company: AdvancePaymentCompany): Promise<SapHouseBank[]> =>
    rows<SapHouseBank>(guard(await api.get(`${BASE}/house-banks/${query({ company })}`))),

  /** The company's cash accounts, from the chart of accounts. */
  cashAccounts: async (company: AdvancePaymentCompany): Promise<SapCashAccount[]> =>
    rows<SapCashAccount>(guard(await api.get(`${BASE}/cash-accounts/${query({ company })}`))),

  /** A payee's bank accounts in SAP, the default first. */
  partnerBankAccounts: async (
    company: AdvancePaymentCompany,
    cardCode: string,
  ): Promise<SapPartnerBankAccount[]> =>
    rows<SapPartnerBankAccount>(
      guard(
        await api.get(
          `${BASE}/partner-bank-accounts/${query({ company, card_code: cardCode })}`,
        ),
      ),
    ),

  /** Active departments with their sub-departments, by name. */
  departments: async (): Promise<OmsDepartment[]> =>
    rows<OmsDepartment>(guard(await api.get(`${BASE}/departments/`))),

  /** Active employees from the master, for the request form's pickers. */
  employeeDirectory: async (q: DirectoryQuery = {}): Promise<DirectoryEmployee[]> =>
    rows<DirectoryEmployee>(
      guard(
        await api.get(
          `${BASE}/employee-directory/${query({
            roles: q.roles?.length ? q.roles.join(",") : undefined,
            search: q.search,
            not_in_sap: q.notInSapFor ? "1" : undefined,
            company: q.notInSapFor,
          })}`,
        ),
      ),
    ),

  /* --- Payment requests --------------------------------------------- */

  /** Your own requests (`mine`), or the approval desk's (`desk`), newest first. */
  requests: async (scope: RequestScope): Promise<ApiRequest[]> =>
    rows<ApiRequest>(
      guard(await api.get(`${BASE}/requests/${query({ scope })}`, undefined, FRESH)),
    ),

  /** One request, with its history and its route. */
  request: async (id: number): Promise<ApiRequest> =>
    unwrap<ApiRequest>(guard(await api.get(`${BASE}/requests/${id}/`, undefined, FRESH))),

  /** Raise a request: saved and routed to its first approver in one step. */
  createRequest: async (input: ApiRequestInput, files: PickedFile[]): Promise<ApiRequest> => {
    const body = new FormData();
    body.append("data", JSON.stringify(input));
    files.forEach((file) => appendFile(body, "files", file));
    return unwrap<ApiRequest>(guard(await api.post(`${BASE}/requests/`, body)));
  },

  /** The creator's edit; `resubmit` sends a returned request on again. */
  editRequest: async (
    id: number,
    input: ApiRequestInput,
    options: {
      files: PickedFile[];
      removeFileIds: number[];
      resubmit: boolean;
      version?: number;
    },
  ): Promise<ApiRequest> => {
    const body = new FormData();
    body.append("data", JSON.stringify(input));
    options.files.forEach((file) => appendFile(body, "files", file));
    body.append("remove_file_ids", JSON.stringify(options.removeFileIds));
    body.append("resubmit", options.resubmit ? "true" : "false");
    if (options.version !== undefined) body.append("version", String(options.version));
    return unwrap<ApiRequest>(guard(await api.post(`${BASE}/requests/${id}/edit/`, body)));
  },

  /**
   * Approve, reject, return, send back, cancel or resubmit.
   *
   * `version` is the flow version the screen acted on; the server refuses the
   * action when someone else has moved the request on since it was read.
   */
  act: async (
    id: number,
    action: StageAction,
    remarks = "",
    version?: number,
  ): Promise<ApiRequest> =>
    unwrap<ApiRequest>(
      guard(await api.post(`${BASE}/requests/${id}/${action}/`, { remarks, version })),
    ),

  /**
   * The Payment stage's payment and bank details. `manualToken`, from
   * `confirmManualPassword`, is needed when the payee's account is typed by
   * hand rather than picked from their SAP accounts.
   */
  savePayout: async (
    id: number,
    payout: ApiPayout,
    version?: number,
    manualToken?: string | null,
  ): Promise<ApiRequest> =>
    unwrap<ApiRequest>(
      guard(
        await api.put(`${BASE}/requests/${id}/payout/`, {
          ...payout,
          version,
          ...(manualToken ? { manual_token: manualToken } : {}),
        }),
      ),
    ),

  /** The Payment user's password, before typing a payee account by hand. Returns the token. */
  confirmManualPassword: async (id: number, password: string): Promise<string> =>
    unwrap<{ token: string }>(
      guard(await api.post(`${BASE}/requests/${id}/confirm-password/`, { password })),
    ).token,

  /**
   * Read a payment's proof and find its UTR (`POST /payment-proof/`).
   *
   * NOTHING IS STORED: the server reads the file - a bank advice, a screenshot,
   * a statement - and answers with the best reference, what it checked it
   * against (this line's amount, the account paid to, the invoices this request
   * pays) and the runners-up. Whether to take the UTR is the screen's decision,
   * exactly as on the web.
   */
  readPaymentProof: async (
    file: PickedFile,
    query: PaymentProofQuery,
  ): Promise<PaymentProofResult> => {
    const body = new FormData();
    appendFile(body, "file", file);
    body.append("company", query.company);
    if (query.amount) body.append("amount", query.amount);
    if (query.toAccount) body.append("to_account", query.toAccount);
    if (query.cardCode) body.append("card_code", query.cardCode);
    // One field per invoice, as the view's `getlist('invoices')` expects.
    for (const invoice of query.invoices) body.append("invoices", invoice);
    return unwrap<PaymentProofResult>(
      guard(await api.post(`${BASE}/payment-proof/`, body)),
    );
  },

  /** After paying: one transfer line's UTR, and the proof it was read from. */
  recordUtr: async (
    id: number,
    lineId: number,
    utr: string,
    proof: unknown,
  ): Promise<ApiRequest> =>
    unwrap<ApiRequest>(
      guard(
        await api.post(`${BASE}/requests/${id}/payout-lines/${lineId}/utr/`, { utr, proof }),
      ),
    ),

  /** A bank proof, or a payment method's proof (`payoutLineId`). */
  addRequestFile: async (
    id: number,
    file: PickedFile,
    purpose: "BANK_PROOF" | "PAYMENT_PROOF",
    payoutLineId?: number,
  ): Promise<ApiRequest> => {
    const body = new FormData();
    appendFile(body, "file", file);
    body.append("purpose", purpose);
    if (payoutLineId) body.append("payout_line_id", String(payoutLineId));
    return unwrap<ApiRequest>(guard(await api.post(`${BASE}/requests/${id}/files/`, body)));
  },

  removeRequestFile: async (id: number, fileId: number): Promise<ApiRequest> =>
    unwrap<ApiRequest>(guard(await api.delete(`${BASE}/requests/${id}/files/${fileId}/`))),

  /* --- Reading an attached file -------------------------------------- *
   *
   * These bypass `api` on purpose. Both endpoints answer with BYTES, not the
   * `{success, data}` envelope, and both are permission-checked — so the file
   * cannot simply be handed to `<Image source={{ uri }} />` or `openURL`, which
   * would send an unauthenticated request and come back 401.
   *
   * An image is read into a data URI and shown in the app; anything else is
   * downloaded to a file and handed to whatever app the device has for it.
   * Same two shapes the receipt viewer uses. */

  /** One of a request's files as a data URI, for showing in the app. */
  requestFileImage: async (id: number, fileId: number): Promise<string> =>
    fetchDataUri(`${API_BASE_URL}${BASE}/requests/${id}/files/${fileId}/`),

  /**
   * OCR a PO's / bill's latest SAP attachment (a scan or a photo) and check
   * its invoice fields against SAP. Can take ~10 s a page; the server caches
   * the result, so reading the same document again is instant.
   */
  readDocumentAttachment: async (
    company: AdvancePaymentCompany,
    kind: SapAttachmentKind,
    docEntry: number,
  ): Promise<AttachmentReading> =>
    unwrap<AttachmentReading>(
      guard(
        await api.get(
          `${BASE}/document-attachment/read/${query({ company, kind, doc_entry: docEntry })}`,
        ),
      ),
    ),

  /** A PO's or bill's latest SAP attachment as a data URI. */
  documentAttachmentImage: async (
    company: AdvancePaymentCompany,
    kind: SapAttachmentKind,
    docEntry: number,
  ): Promise<string> =>
    fetchDataUri(
      `${API_BASE_URL}${BASE}/document-attachment/${query({ company, kind, doc_entry: docEntry })}`,
    ),

  /** One of a request's files, saved locally; returns the URI to open it with. */
  saveRequestFile: async (id: number, fileId: number, name: string): Promise<string> =>
    download(`${API_BASE_URL}${BASE}/requests/${id}/files/${fileId}/`, name),

  /** A PO's or bill's SAP attachment, saved locally. */
  saveDocumentAttachment: async (
    company: AdvancePaymentCompany,
    kind: SapAttachmentKind,
    docEntry: number,
    name: string,
  ): Promise<string> =>
    download(
      `${API_BASE_URL}${BASE}/document-attachment/${query({ company, kind, doc_entry: docEntry })}`,
      name,
    ),
};

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

/** What a failed file read means, in words a requester can act on. */
function fileError(status: number): string {
  if (status === 403) return "You do not have permission to open this file.";
  if (status === 404) return "That file is no longer on the server.";
  if (status === 503) return "SAP could not be reached. Try again shortly.";
  return `The file could not be opened (status ${status}).`;
}

/** The bytes, as a `data:` URI an `<Image>` can render. */
async function fetchDataUri(url: string): Promise<string> {
  const token = await storage.getAccessToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new AdvancePaymentApiError(fileError(res.status));
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new AdvancePaymentApiError("That file could not be read."));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * The bytes, written to a file the OS can open.
 *
 * `documentDirectory` rather than the cache, which the OS may purge while the
 * viewer app is still holding the file; on Android the path is handed over as a
 * `content://` URI, because a `file://` one throws FileUriExposedException in
 * the app that receives it.
 */
async function download(url: string, name: string): Promise<string> {
  const FileSystem = await import("expo-file-system/legacy");
  const { Platform } = await import("react-native");
  const token = await storage.getAccessToken();

  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const safe = name.replace(/[^\w.\- ]+/g, "_") || "attachment";
  const result = await FileSystem.downloadAsync(url, `${dir}${safe}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) throw new AdvancePaymentApiError(fileError(result.status));
  return Platform.OS === "android"
    ? await FileSystem.getContentUriAsync(result.uri)
    : result.uri;
}
