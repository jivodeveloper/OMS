/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/requestApi.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * The form and the server's request, each way. PURE, NO REACT.
 *
 * The pages keep working in the form's terms (`RequestForm`, `PayoutDetails`)
 * because every component that shows or edits a request already speaks
 * them; this is the one place those shapes meet the API's
 * (`advance_payment/serializers.py`).
 *
 *   toApiRequest    the form, as `POST /requests/` takes it
 *   fromApiRequest  the server's request, as the pages hold it
 *   payoutToApi / payoutFromApi   the same for the payment details
 *
 * Round-trips: a request raised and read back gives the form it was raised
 * with (`requestApi.test.ts` holds it), so an edit starts exactly where the
 * creator left it.
 */
import type {
  AdvancePaymentCompany,
  ApiPayout,
  ApiRequest,
  ApiRequestDocument,
  ApiRequestFile,
  ApiRequestInput,
  ApiRequestLog,
} from "../../../services/advancePayment.service";
import type { AdvanceRequestEntry, ApprovalStatus, Decision } from "./approvalData";
import type { FileAttachment, PickedFile } from "./attachments";
import type { OpenDocument, PaymentMode } from "./constants";
import type { PayoutDetails, PayoutLine, PayoutMethod, UtrProof } from "./payout";
import {
  EMPTY_ALLOCATION,
  EMPTY_FORM,
  allocationRows,
  resolveCase,
  type Allocation,
  type ReferenceKind,
  type RequestForm,
} from "./rules";

/* ── Small conversions ───────────────────────────────────────────────────── */

const orNull = (value: string) => (value.trim() ? value.trim() : null);

/** "20000.00" -> "20000", as a person would have typed it. */
function plain(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : value;
}

const number = (value: string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** `PCH-10256` -> 10256: the DocEntry the form's document id carries. */
function docEntryOf(doc: OpenDocument): number {
  if (doc.attachment?.docEntry) return doc.attachment.docEntry;
  return Number(doc.id.split("-").pop());
}

const KIND_OF: Partial<Record<ReferenceKind, "BILL" | "PO">> = {
  VENDOR_BILL: "BILL",
  VENDOR_PO: "PO",
};

/* ── The request ─────────────────────────────────────────────────────────── */

export function toApiRequest(form: RequestForm): ApiRequestInput {
  const c = resolveCase(form);
  const kind = c.reference ? KIND_OF[c.reference] : undefined;
  const documents: ApiRequestDocument[] = kind
    ? allocationRows(form).map(({ document, allocation, calc }) => ({
        kind,
        sap_doc_entry: docEntryOf(document),
        sap_doc_num: document.number,
        vendor_ref: document.reference ?? "",
        doc_date: document.date || null,
        due_date: document.dueDate ?? null,
        original_amount: String(document.original),
        paid_amount: String(document.paid),
        open_amount: String(document.open),
        mode: allocation.mode,
        percentage: allocation.mode === "PERCENT" ? allocation.percentage : null,
        amount: String(calc.payment ?? 0),
        attachment_file: document.attachment?.fileName ?? "",
        attachment_count: document.attachment?.count ?? 0,
        attachment_date: document.attachment?.date || null,
        attachment_check: document.reading ?? null,
      }))
    : [];
  const total = documents.reduce((sum, d) => sum + Math.round(Number(d.amount) * 100), 0) / 100;

  return {
    company: form.company as AdvancePaymentCompany,
    request_type: form.type as ApiRequestInput["request_type"],
    payment_against: form.paymentAgainst,
    payment_against_other: form.paymentAgainst === "OTHER" ? form.paymentAgainstOther : "",
    partner_code: form.partner,
    partner_name: form.partnerName,
    amount: kind ? String(total) : form.amount,
    documents,
    department_id: form.department ? Number(form.department) : null,
    sub_department_id: form.subDepartment ? Number(form.subDepartment) : null,
    expected_date: orNull(form.expectedDate),
    expected_bill_date: orNull(form.expectedBillDate),
    return_method: form.returnMethod,
    return_method_other: form.returnMethod === "CUSTOM" ? form.returnMethodOther : "",
    installments: form.installments ? Number(form.installments) : null,
    emi_amount: orNull(form.emiAmount),
    expected_from_date: orNull(form.expectedFromDate),
    expected_to_date: orNull(form.expectedToDate),
    payment_date: orNull(form.paymentDate),
    priority: form.priority,
    remarks: form.remarks,
    owner_label: form.ownership,
    budget_code: form.budget,
    sub_budget_code: form.subBudget,
  };
}

function documentFromApi(doc: ApiRequestDocument, partner: string, company: AdvancePaymentCompany): OpenDocument {
  const kind = doc.kind === "PO" ? "po" : "bill";
  return {
    id: `${doc.kind === "PO" ? "POR" : "PCH"}-${doc.sap_doc_entry}`,
    number: doc.sap_doc_num || String(doc.sap_doc_entry),
    date: doc.doc_date ?? "",
    partner,
    original: number(doc.original_amount),
    paid: number(doc.paid_amount),
    open: number(doc.open_amount),
    reference: doc.vendor_ref || undefined,
    dueDate: doc.due_date || undefined,
    attachment: doc.attachment_file
      ? {
          company,
          kind,
          docEntry: doc.sap_doc_entry,
          fileName: doc.attachment_file,
          count: doc.attachment_count,
          date: doc.attachment_date ?? "",
        }
      : undefined,
    reading: doc.attachment_check ?? undefined,
  };
}

function allocationFromApi(doc: ApiRequestDocument): Allocation {
  const mode = doc.mode as PaymentMode;
  return mode === "PERCENT"
    ? { ...EMPTY_ALLOCATION, mode, percentage: plain(doc.percentage) }
    : { ...EMPTY_ALLOCATION, mode, amount: plain(doc.amount) };
}

export function formFromApi(api: ApiRequest): RequestForm {
  const selected = api.documents.map((d) => documentFromApi(d, api.partner_code, api.company));
  const allocations = Object.fromEntries(
    api.documents.map((d, i) => [selected[i].id, allocationFromApi(d)]),
  );
  return {
    ...EMPTY_FORM,
    company: api.company,
    type: api.request_type,
    paymentAgainst: api.payment_against as RequestForm["paymentAgainst"],
    paymentAgainstOther: api.payment_against_other,
    partner: api.partner_code,
    partnerName: api.partner_name,
    selected,
    allocations,
    amount: api.documents.length ? "" : plain(api.amount),
    expectedDate: api.expected_date ?? "",
    returnMethod: api.return_method as RequestForm["returnMethod"],
    returnMethodOther: api.return_method_other,
    installments: api.installments ? String(api.installments) : "",
    emiAmount: plain(api.emi_amount),
    expectedFromDate: api.expected_from_date ?? "",
    expectedToDate: api.expected_to_date ?? "",
    expectedBillDate: api.expected_bill_date ?? "",
    department: String(api.department.id),
    departmentName: api.department.name,
    subDepartment: api.sub_department ? String(api.sub_department.id) : "",
    subDepartmentName: api.sub_department?.name ?? "",
    hasSubDepartments: api.sub_department !== null,
    ownership: api.owner_label,
    paymentDate: api.payment_date ?? "",
    priority: api.priority,
    remarks: api.remarks,
    budget: api.budget_code ?? "",
    budgetName: api.budget_name ?? "",
    subBudget: api.sub_budget_code ?? "",
    subBudgetName: api.sub_budget_name ?? "",
  };
}

const STATUS: Record<ApiRequest["status"], ApprovalStatus> = {
  IN_APPROVAL: "PENDING",
  RETURNED: "RETURNED",
  COMPLETED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
};

/** The action that settled or turned the request, for each status that has one. */
const DECIDED_BY: Partial<Record<ApprovalStatus, string>> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RETURNED: "RETURNED",
  CANCELLED: "CANCELLED",
};

function decisionOf(api: ApiRequest, status: ApprovalStatus): Decision | undefined {
  const action = DECIDED_BY[status];
  if (!action) return undefined;
  const logs: ApiRequestLog[] = [...(api.last_decision ? [api.last_decision] : []), ...(api.logs ?? [])];
  const row = [...logs].reverse().find((log) => log.action === action);
  if (!row) return undefined;
  return {
    status: status as Decision["status"],
    by: row.actor?.name ?? "—",
    on: row.created_on,
    remarks: row.remarks,
  };
}

const fileFromApi = (file: ApiRequestFile): FileAttachment => ({
  id: `file-${file.id}`,
  name: file.name,
  size: file.size,
  serverId: file.id,
});

export function fromApiRequest(api: ApiRequest): AdvanceRequestEntry {
  const status = STATUS[api.status];
  return {
    id: String(api.id),
    serverId: api.id,
    requestNo: api.request_no,
    requestedBy: api.created_by?.name ?? "—",
    requestedOn: api.created_on,
    form: formFromApi(api),
    files: api.files.filter((f) => f.purpose === "SUPPORTING").map(fileFromApi),
    status,
    payout: api.payout ? payoutFromApi(api.payout, api.files) : undefined,
    decision: decisionOf(api, status),
    api,
  };
}

/* ── The payment details ─────────────────────────────────────────────────── */

export function payoutFromApi(payout: ApiPayout, files: ApiRequestFile[]): PayoutDetails {
  return {
    beneficiaryName: payout.beneficiary_name,
    toAccountNumber: payout.to_account_number,
    toIfsc: payout.to_ifsc,
    toAccountManual: payout.to_account_manual,
    bankAttachments: files
      .filter((f) => f.purpose === "BANK_PROOF" && f.payout_line_id === null)
      .map(fileFromApi),
    lines: payout.lines.map(
      (line): PayoutLine => ({
        id: `line-${line.id}`,
        serverId: line.id,
        method: line.method as PayoutMethod,
        amount: plain(line.amount),
        fromAccount: line.from_account,
        noteRows: (line.cash_notes ?? []).map((row, i) => ({
          id: `note-${line.id}-${i}`,
          denomination: row.denomination,
          quantity: String(row.quantity),
        })),
        chequeNumber: line.cheque_number,
        chequeBank: line.cheque_bank,
        chequeDate: line.cheque_date ?? "",
        attachments: files.filter((f) => f.payout_line_id === line.id).map(fileFromApi),
        utr: line.utr || undefined,
        utrProof: (line.utr_proof as UtrProof | null | undefined) ?? undefined,
      }),
    ),
  };
}

export function payoutToApi(payout: PayoutDetails): ApiPayout {
  return {
    beneficiary_name: payout.beneficiaryName,
    to_account_number: payout.toAccountNumber,
    to_ifsc: payout.toIfsc,
    to_account_manual: payout.toAccountManual,
    lines: payout.lines.map((line) => ({
      id: line.serverId,
      method: line.method,
      amount: line.amount,
      from_account: line.fromAccount,
      cheque_number: line.method === "CHEQUE" ? line.chequeNumber : "",
      cheque_bank: line.method === "CHEQUE" ? line.chequeBank : "",
      cheque_date: line.method === "CHEQUE" && line.chequeDate ? line.chequeDate : null,
      cash_notes:
        line.method === "CASH"
          ? line.noteRows
              .filter((row) => row.denomination && Number(row.quantity) > 0)
              .map((row) => ({ denomination: row.denomination as number, quantity: Number(row.quantity) }))
          : [],
    })),
  };
}

/**
 * What saving the payout must upload and remove, once the server has the
 * lines. Lines are matched by position: the server keeps them in the order
 * they were sent, and a new line is always added at the end.
 */
export function payoutFileChanges(
  payout: PayoutDetails,
  saved: ApiPayout,
  before: PayoutDetails | undefined,
): {
  upload: Array<{ file: PickedFile; purpose: "BANK_PROOF" | "PAYMENT_PROOF"; lineId?: number }>;
  remove: number[];
} {
  const upload: Array<{ file: PickedFile; purpose: "BANK_PROOF" | "PAYMENT_PROOF"; lineId?: number }> = [];
  payout.bankAttachments.forEach((a) => a.file && upload.push({ file: a.file, purpose: "BANK_PROOF" }));
  payout.lines.forEach((line, index) => {
    const lineId = saved.lines[index]?.id;
    line.attachments.forEach((a) => a.file && upload.push({ file: a.file, purpose: "PAYMENT_PROOF", lineId }));
  });
  const kept = new Set(
    [...payout.bankAttachments, ...payout.lines.flatMap((l) => l.attachments)]
      .map((a) => a.serverId)
      .filter((id): id is number => id !== undefined),
  );
  const had = before
    ? [...before.bankAttachments, ...before.lines.flatMap((l) => l.attachments)]
        .map((a) => a.serverId)
        .filter((id): id is number => id !== undefined)
    : [];
  return { upload, remove: had.filter((id) => !kept.has(id)) };
}
