/**
 * PORTED FROM THE WEB CLIENT — `OMS-Frontend/src/pages/advancePayments/rules.ts`.
 *
 * Kept identical on purpose: the rules that decide what a request may be, what
 * it comes to and what may be done to it are the same product on both clients,
 * and two hand-written copies drift. Only the imports and the file type differ
 * (React Native has no `File`). Change it on the web first, then re-copy.
 */
/**
 * Advance Payments — the business rules the form follows. PURE, NO REACT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE OF ITS OWN
 * ─────────────────────────────────────────────────────────────────────────
 * The form is a cascade — Type → Payment Against → Business Partner →
 * documents → one payment line per document → total —
 * and every step decides what the next may show. Spread through JSX that is a
 * dozen `&&` conditions that drift apart; here it is one table (`CASE_RULES`)
 * and a few functions:
 *
 *   * `resolveCase`       — what the current answers make visible;
 *   * `applyChange`       — a change, plus everything it invalidates below it;
 *   * `changeAllocation`  — an edit to ONE document's payment line;
 *   * `allocationRows` / `validate` — the numbers, and what blocks submit.
 *
 * It is also the part the backend will have to agree with, so it is written
 * to be read as a specification, and `rules.test.ts` pins every case.
 *
 * WHERE THE DATA COMES FROM is decided here too, per case (`partnerSource`,
 * `REFERENCE_KINDS[kind].live`): SAP's vendors and open invoices and its
 * employee advance accounts for the connected cases, sample data for the
 * rest. The rules never fetch — a live list is loaded by the page — so a
 * SAP-sourced partner cannot be checked against a list here; it is kept
 * until something above it changes, and the documents chosen for it are held
 * as SNAPSHOTS in the form, so every figure computed below is computed from
 * exactly what the requester saw.
 *
 * THE ONE INVARIANT: state never holds a value that is not on screen. A hidden
 * field with a value in it is one the requester cannot see or correct, and it
 * would be submitted all the same. `sanitize` enforces it after every change,
 * so the explicit clears in `applyChange` are the stated behaviour and
 * `sanitize` is the net under them.
 */
import {
  PAYMENT_AGAINST_OPTIONS,
  VENDORS,
  type Company,
  type OpenDocument,
  type Partner,
  type PartnerType,
  GST_OPTIONS,
  type GstCode,
  type PaymentAgainst,
  type PaymentMode,
  type ReturnMethod,
} from "./constants";

/* ── Form state ──────────────────────────────────────────────────────────── */

/** How much of ONE document is being paid: a fixed rupee figure or a %. */
export interface Allocation {
  mode: PaymentMode;
  amount: string;
  percentage: string;
}

export const EMPTY_ALLOCATION: Allocation = { mode: "FIXED", amount: "", percentage: "" };

/**
 * One line of an Expense request: an amount (the invoice value) to an
 * expense G/L account.
 *
 * A requester who does not know the G/L ticks so (`glUnknown`) and says in
 * the remarks what it is for: the Payment desk picks it. The desk also records
 * the line's GST (the taxable amount is backed out of the amount), sets its
 * month (blank: the request's) and the TDS, deducted on the taxable amount.
 */
export interface ExpenseLineForm {
  /** The client's own key for the row (the server's id once saved, as text). */
  id: string;
  /** The invoice value. Fixed once raised: the Payment desk cannot change it. */
  amount: string;
  /** "I don't know the G/L account": remarks instead. */
  glUnknown: boolean;
  /** The Payment desk's: how much of the amount is GST. */
  gstCode: GstCode;
  glAccount: string;
  glName: string;
  effectMonth: string;
  remarks: string;
  /** The Payment desk's TDS for this line: "" (the request's), "NONE", or a code. */
  tdsOverride: string;
  /** As the server last worked them out (read-only): the TDS code and amount. */
  tdsCode: string;
  tdsAmount: string;
}

let expenseLineSeq = 0;

/** A fresh, empty expense line. */
export function newExpenseLine(): ExpenseLineForm {
  expenseLineSeq += 1;
  return {
    id: `new-${expenseLineSeq}`,
    amount: "",
    glUnknown: false,
    gstCode: "",
    glAccount: "",
    glName: "",
    effectMonth: "",
    remarks: "",
    tdsOverride: "",
    tdsCode: "",
    tdsAmount: "",
  };
}

/** A line's TDS choice meaning "no TDS on this line", whatever the request's. */
export const NO_TDS = "NONE";

/** SAP's Effective Month code for a date: "2026-10-07" -> "10-2026". */
export function monthCodeOf(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return year && month ? `${month}-${year}` : "";
}

export interface RequestForm {
  company: Company | "";
  type: PartnerType | "";
  paymentAgainst: PaymentAgainst | "";
  /**
   * What the requester TYPED when none of the listed answers fit. Held only
   * while the answer above it is the "other" one (`OTHER` / `CUSTOM`) — the
   * rules still branch on that value, so a typed answer behaves exactly like
   * choosing "Other" did, and the text says what the other thing is.
   */
  paymentAgainstOther: string;
  /** The partner's key — a CardCode, an employee's GL account, or a sample id. */
  partner: string;
  /**
   * The partner's display name, held beside the key because a SAP-sourced
   * partner is picked from a searched page of results: once the search moves
   * on, the page no longer holds them, and the picker would otherwise show a
   * bare code.
   */
  partnerName: string;
  /**
   * The chosen documents — several bills or several POs — as SNAPSHOTS.
   *
   * Whole documents rather than ids, because a live SAP list is fetched by the
   * page and cannot be looked up from here; the snapshot is also what the
   * requester saw, which is what an approver should be shown. One request can
   * settle part of three bills; they are still one payment to one partner.
   */
  selected: OpenDocument[];
  /**
   * One payment line per chosen document, keyed by its id. Each line has its
   * own mode, because "clear this bill, pay a quarter of that one" is the
   * normal shape of a part settlement.
   */
  allocations: Record<string, Allocation>;
  /** The typed amount of a case with no document to calculate it from. */
  amount: string;
  /** Vendor → Against PO only. */
  expectedDate: string;
  /* Employee Advance + Advance only: how and when it comes back. */
  returnMethod: ReturnMethod | "";
  returnMethodOther: string;
  /**
   * EMI only, and linked both ways: type the count and the EMI is worked out,
   * type the EMI and the count is. `applyChange` keeps them in step with each
   * other and with the amount.
   */
  installments: string;
  emiAmount: string;
  /**
   * EMI: the EMI Start Date. Other / Custom: Expected From Date. Unused (and
   * kept empty) for One Time, which has a single date.
   */
  expectedFromDate: string;
  /**
   * When the money is fully back. EMI: DERIVED from the start date and the
   * installment count, read-only. One Time: the Return Date, typed.
   * Other / Custom: typed.
   */
  expectedToDate: string;
  /** Employee Imprest only. */
  expectedBillDate: string;
  /**
   * The Department: SAP's budget head (cost-centre dimension 3) code, with its
   * name. The Workflow Engine's queries match on it to choose the approval
   * route. Per company, so a company change clears it.
   */
  budget: string;
  budgetName: string;
  /** Payment Purpose: what the money is for, a code of the Payment Desk's list. */
  purpose: string;
  purposeLabel: string;
  /**
   * The purpose is approved "by department" (its `needs_head`): the request
   * then names a Department Head. Set with the purpose, from the list.
   */
  purposeNeedsHead: boolean;
  /**
   * The Department Head: an HOD of the employee master, by employee code,
   * with their name. Asked only when `needsDepartmentHead`. They approve
   * through the OMS login the server matched to them (`departmentHeadLogin`,
   * a username); an HOD with none cannot be submitted.
   */
  departmentHead: string;
  departmentHeadName: string;
  departmentHeadLogin: string;
  /** Who owns this request: a HOD or Sub-HOD, for information only. */
  ownership: string;
  paymentDate: string;
  remarks: string;
  /* ── Expense only ── */
  /** Who is paid: an Expense has no SAP partner, so the name is typed. */
  payee: string;
  /** SAP's Sub Budget (dimension 4): every expense line in SAP carries one. */
  subBudget: string;
  subBudgetName: string;
  /** SAP's Effective Month ("10-2026") for every line that does not name its own: the Payment desk's. */
  effectMonth: string;
  /** An electricity expense: the head's owner, then the Director. */
  isElectricity: boolean;
  /** The Payment desk's TDS code for every line that does not name its own; "" none. */
  expenseTdsCode: string;
  expenseLines: ExpenseLineForm[];
}

export const EMPTY_FORM: RequestForm = {
  company: "",
  type: "",
  paymentAgainst: "",
  paymentAgainstOther: "",
  partner: "",
  partnerName: "",
  selected: [],
  allocations: {},
  amount: "",
  expectedDate: "",
  returnMethod: "",
  returnMethodOther: "",
  installments: "",
  emiAmount: "",
  expectedFromDate: "",
  expectedToDate: "",
  expectedBillDate: "",
  budget: "",
  budgetName: "",
  purpose: "",
  purposeLabel: "",
  purposeNeedsHead: false,
  departmentHead: "",
  departmentHeadName: "",
  departmentHeadLogin: "",
  ownership: "",
  paymentDate: "",
  remarks: "",
  payee: "",
  subBudget: "",
  subBudgetName: "",
  effectMonth: "",
  isElectricity: false,
  expenseTdsCode: "",
  expenseLines: [],
};

/* ── The documents a payment can be made against ─────────────────────────── */

export type ReferenceKind = "VENDOR_BILL" | "VENDOR_PO" | "VENDOR_OTHER" | "CUSTOMER_LEDGER";

interface ReferenceKindDef {
  /** One of them — "Bill". The heading form. */
  label: string;
  /** The same word mid-sentence — "bill", but "PO", never "po". */
  noun: string;
  /** The field's label — "Bills". */
  pluralLabel: string;
  placeholder: string;
  /** Column heading for the document number. */
  numberLabel: string;
  dateLabel: string;
  originalLabel: string;
  paidLabel: string;
  /**
   * The ways a line against this kind may be paid; the first is where a new
   * line starts. A PO takes either (a share of what is still to come, or a
   * rupee figure), a bill or any other document only a rupee figure.
   * `sanitize` holds every line to these, so no other mode can get in.
   */
  modes: readonly PaymentMode[];
  /** A sentence under the section title, when the list needs explaining. */
  intro?: string;
  /**
   * Read live from SAP by the page. `documents` is then empty: the rules
   * never hold a live list, only the snapshots the requester chose.
   */
  live: boolean;
  /** The SAMPLE documents, for a kind that is not live. */
  documents: OpenDocument[];
}

/**
 * The three document kinds, and the words each is described in.
 *
 * They share a shape and a calculation; only the vocabulary differs. The
 * three lists never overlap — a bill is only ever under Against Bill, a PO
 * only under Against PO, and "All" holds everything else — so no document
 * can be paid from two places in one request.
 */
export const REFERENCE_KINDS: Record<ReferenceKind, ReferenceKindDef> = {
  VENDOR_BILL: {
    label: "Bill",
    noun: "bill",
    pluralLabel: "Bills",
    placeholder: "Select Bills",
    numberLabel: "Bill Number",
    dateLabel: "Bill Date",
    originalLabel: "Original Amount",
    paidLabel: "Paid Amount",
    modes: ["FIXED"],
    // Live: `GET /advance-payments/open-invoices/?party_type=vendor`.
    live: true,
    documents: [],
  },
  VENDOR_PO: {
    label: "PO",
    noun: "PO",
    pluralLabel: "Purchase Orders",
    placeholder: "Select Open POs",
    numberLabel: "PO Number",
    dateLabel: "PO Date",
    originalLabel: "PO Amount",
    // What SAP's PaidToDate means on a PO: goods already received. Not
    // advances — SAP holds none against POs — so it is named for what it is.
    paidLabel: "Already Received",
    modes: ["PERCENT", "FIXED"],
    // Live: `GET /advance-payments/open-purchase-orders/?card_code=`.
    live: true,
    documents: [],
  },
  VENDOR_OTHER: {
    label: "Document",
    noun: "document",
    pluralLabel: "Documents",
    placeholder: "Select Documents",
    numberLabel: "Document Number",
    dateLabel: "Document Date",
    originalLabel: "Original Amount",
    paidLabel: "Paid Amount",
    modes: ["FIXED"],
    intro:
      "Every other open document for this vendor — goods receipts not yet billed, " +
      "goods returns, credit memos, payments on account and journal entries. " +
      "Bills and POs have their own options.",
    // Live: `GET /advance-payments/open-other-documents/?card_code=`.
    live: true,
    documents: [],
  },
  CUSTOMER_LEDGER: {
    label: "Ledger Item",
    noun: "ledger item",
    pluralLabel: "Ledger Items",
    placeholder: "Select Ledger Items",
    numberLabel: "Document",
    dateLabel: "Date",
    originalLabel: "Original Amount",
    paidLabel: "Settled",
    modes: ["FIXED"],
    intro:
      "The customer's open items in SAP. Payments received and credit memos are owed to them (Cr); " +
      "their invoices reduce what is refunded (Dr). The refund is the credits less the debits.",
    // Live: `GET /advance-payments/open-documents/?card_code=` (the customer's ledger).
    live: true,
    documents: [],
  },
};

/** A ledger DEBIT counts against the refund; everything else counts for it. */
export const lineSign = (doc: OpenDocument) => (doc.ledger?.direction === "DEBIT" ? -1 : 1);

/** What a line may still take: SAP's open amount, less what other OMS requests hold. */
export const availableOf = (doc: OpenDocument) => doc.oms?.available ?? doc.open;

/* ── The case table ──────────────────────────────────────────────────────── */

interface CaseRule {
  /** Documents must be picked, and the payment is calculated from them. */
  reference?: ReferenceKind;
  /** Ask when the payment is expected to be adjusted against the documents. Optional. */
  expectedDate?: boolean;
  /** Ask how the money comes back (One Time / EMI / Other), and over what period. */
  repayment?: boolean;
  /** Ask when the bill is expected. */
  expectedBillDate?: boolean;
  /** An Expense: lines to G/L accounts, a payee, Sub Budget and Month. */
  expense?: boolean;
}

/**
 * EVERY SUPPORTED (Type, Payment Against) PAIR, AND WHAT IT ASKS.
 *
 * A pair missing from a type's row is not offered for that type. A pair with
 * `{}` is offered and asks for a plain amount, nothing more.
 *
 * EMPLOYEE IMPREST asks for the expected bill date in every pair: the date
 * belongs to the imprest itself, not to what it is against, which is also why
 * it survives a Payment Against change within Imprest and is cleared only on
 * leaving the type. Its other rules are still open — when they are settled
 * they go in this row and nowhere else: `resolveCase`, the clearing and the
 * validation all read the table, so the form follows.
 */
export const CASE_RULES: Record<PartnerType, Partial<Record<PaymentAgainst, CaseRule>>> = {
  // A vendor advance is ALWAYS against a document: a bill or a PO. A bare
  // "Advance" with no reference is an amount nobody can later match to
  // anything, so it is not offered. `OTHER`, the free-text escape hatch, is
  // not offered either.
  //
  // "All" (every other open document, `VENDOR_OTHER`) is switched off, not
  // removed: add `ALL: { reference: "VENDOR_OTHER" }` back here to offer it.
  VENDOR: {
    AGAINST_PO: { reference: "VENDOR_PO", expectedDate: true },
    AGAINST_BILL: { reference: "VENDOR_BILL" },
  },
  // No Against Bill: an employee advance is paid ahead of expenses, and the
  // bills that follow are settled against the advance, not paid here.
  EMPLOYEE_ADVANCE: {
    ADVANCE: { repayment: true },
    OTHER: {},
  },
  EMPLOYEE_IMPREST: {
    ADVANCE: { expectedBillDate: true },
    // The imprest account (an ORGV business partner) has its own open bills
    // in SAP, and this pays against them, exactly as a vendor's bills are.
    // The bills are the expense already: there is no bill still to expect.
    AGAINST_BILL: { reference: "VENDOR_BILL" },
    OTHER: { expectedBillDate: true },
  },
  // A REFUND of what the customer is owed: against the open items on their
  // ledger (picked by hand, never all at once), or a typed amount on account.
  CUSTOMER: {
    AGAINST_LEDGER: { reference: "CUSTOMER_LEDGER" },
    ON_ACCOUNT: {},
  },
  // Straight to expense G/L accounts: no partner, no documents — its lines.
  EXPENSE: {
    DIRECT_EXPENSE: { expense: true },
    INDIRECT_EXPENSE: { expense: true },
  },
};

/* ── What the current answers make visible ───────────────────────────────── */

/**
 * Where a case's partner list comes from.
 *
 *   SAP_VENDORS     `GET /advance-payments/vendors/`, codes starting VENDA —
 *                   every vendor case except the two on sample documents
 *   SAP_IMPREST     the SAME lookup, codes starting ORGV — Employee Imprest
 *   SAP_EMPLOYEES   `GET /advance-payments/employees/` — Employee Advance
 *   SAMPLE_VENDORS  the sample vendors that own the sample POs / documents
 */
export type PartnerSource =
  | "SAP_VENDORS"
  | "SAP_IMPREST"
  | "SAP_EMPLOYEES"
  | "SAP_CUSTOMERS"
  | "SAMPLE_VENDORS";

/**
 * The CardCode prefix that marks each kind of business partner in SAP.
 *
 * SAP's supplier list (OCRD, CardType S) holds BOTH real vendors and the
 * per-employee imprest accounts, told apart only by their code series:
 * `VENDA000526  10M ANALYTICS` is a vendor, `ORGV000066  ABDUL KHATIB IMPREST
 * JWPL0108` is an employee's imprest account. Read off the live data in all
 * three companies (Sept 2026: OIL 500+ / 477, MART 170 / 53, BEVERAGES
 * 500+ / 245). A vendor picker that showed ORGV rows would offer to pay a
 * vendor advance into an employee's imprest, and vice versa.
 */
export const PARTNER_CODE_PREFIX: Partial<Record<PartnerSource, string>> = {
  SAP_VENDORS: "VENDA",
  SAP_IMPREST: "ORGV",
};

export function partnerSourceFor(
  type: PartnerType | "",
  reference: ReferenceKind | null,
): PartnerSource | null {
  if (type === "VENDOR") {
    // A vendor case paid against sample documents must list the sample
    // vendors that own them — a real SAP vendor has no sample PO to pick.
    return reference && !REFERENCE_KINDS[reference].live ? "SAMPLE_VENDORS" : "SAP_VENDORS";
  }
  if (type === "EMPLOYEE_ADVANCE") return "SAP_EMPLOYEES";
  if (type === "EMPLOYEE_IMPREST") return "SAP_IMPREST";
  if (type === "CUSTOMER") return "SAP_CUSTOMERS";
  // An Expense may name the SAP vendor it pays (optional).
  if (type === "EXPENSE") return "SAP_VENDORS";
  return null;
}

export const isLiveSource = (source: PartnerSource | null) =>
  source === "SAP_VENDORS" ||
  source === "SAP_IMPREST" ||
  source === "SAP_EMPLOYEES" ||
  source === "SAP_CUSTOMERS";

export interface ResolvedCase {
  paymentAgainstOptions: ReadonlyArray<{ value: PaymentAgainst; label: string }>;
  /** The document kind this case is paid against, once it is known. */
  reference: ReferenceKind | null;
  /** Vendor → Against PO: when the payment is expected to be adjusted. */
  expectedDate: boolean;
  /** Return Method and the Expected From / To period. */
  repayment: boolean;
  /** Installment count and EMI — repayment with EMI chosen. */
  installments: boolean;
  expectedBillDate: boolean;
  /** "Business Partner" for a vendor, "Employee" for either employee type. */
  partnerLabel: string;
  /** Where the partner list comes from — see `PartnerSource`. */
  partnerSource: PartnerSource | null;
  /** The partner list is read from SAP by the page, and `partners` is empty. */
  livePartners: boolean;
  /** The documents are read from SAP by the page, and `documents` is empty. */
  liveDocuments: boolean;
  /**
   * The SAMPLE partners this case may pick — already narrowed to those with
   * documents. Empty for a live source: the page fetches that list.
   */
  partners: Partner[];
  /** The chosen partner's SAMPLE documents. Empty for a live kind. */
  documents: OpenDocument[];
  /** The chosen documents — the snapshots held in the form. */
  selectedDocuments: OpenDocument[];
  /** Every question above the partner is answered, so the partner can be picked. */
  decided: boolean;
  /** A decided case with no document: the requester types the amount. */
  plainAmount: boolean;
  /** An Expense: lines, payee, Sub Budget, Month; no partner, no purpose. */
  expense: boolean;
}

function samplePartners(source: PartnerSource | null): Partner[] {
  return source === "SAMPLE_VENDORS" ? VENDORS : [];
}

/** The documents of `kind` belonging to `partner`. */
export function documentsFor(kind: ReferenceKind, partner: string): OpenDocument[] {
  return REFERENCE_KINDS[kind].documents.filter((doc) => doc.partner === partner);
}

export function resolveCase(form: RequestForm): ResolvedCase {
  const row = form.type ? CASE_RULES[form.type] : undefined;
  const paymentAgainstOptions = row
    ? PAYMENT_AGAINST_OPTIONS.filter((option) => option.value in row)
    : [];
  const rule = row && form.paymentAgainst ? row[form.paymentAgainst] : undefined;

  const reference: ReferenceKind | null = rule?.reference ?? null;
  const decided = Boolean(rule);

  const partnerSource = rule ? partnerSourceFor(form.type, reference) : null;
  const livePartners = isLiveSource(partnerSource);
  const liveDocuments = Boolean(reference && REFERENCE_KINDS[reference].live);

  // Only sample partners that HAVE a document of this kind. Offering a vendor
  // with no open PO under "Against PO" is offering a dead end: the next
  // dropdown would be empty and the requester would have to back out and
  // guess again. A live list cannot be narrowed like this — SAP's vendor
  // lookup does not say who has open invoices — so the invoice picker says
  // "none" for a vendor without any instead.
  const base = samplePartners(partnerSource);
  const partners =
    reference && !liveDocuments
      ? base.filter((partner) => documentsFor(reference, partner.value).length > 0)
      : base;

  const documents =
    reference && !liveDocuments && form.partner ? documentsFor(reference, form.partner) : [];
  const selectedDocuments = reference
    ? form.selected.filter((doc) => doc.partner === form.partner)
    : [];

  return {
    paymentAgainstOptions,
    reference,
    expectedDate: Boolean(rule?.expectedDate),
    repayment: Boolean(rule?.repayment),
    installments: Boolean(rule?.repayment) && form.returnMethod === "EMI",
    expectedBillDate: Boolean(rule?.expectedBillDate),
    partnerLabel:
      form.type === "VENDOR" || form.type === ""
        ? "Business Partner"
        : form.type === "CUSTOMER"
          ? "Customer"
          : form.type === "EXPENSE"
            ? "Vendor"
            : "Employee",
    partnerSource,
    livePartners,
    liveDocuments,
    partners,
    documents,
    selectedDocuments,
    decided,
    plainAmount: decided && reference === null && !rule?.expense,
    expense: Boolean(rule?.expense),
  };
}

/* ── Who approves ────────────────────────────────────────────────────────── */

/** Employee and Imprest requests always go to the requester's Department Head. */
const HEAD_TYPES: ReadonlyArray<PartnerType> = ["EMPLOYEE_ADVANCE", "EMPLOYEE_IMPREST"];

/**
 * Whether the request names a Department Head, who approves it: outside Mart,
 * an Employee or Imprest request, or a purpose approved "by department".
 * The server applies the same rule (`purposes.needs_department_head`).
 */
export function needsDepartmentHead(form: RequestForm): boolean {
  if (!form.company || form.company === "MART") return false;
  return (form.type !== "" && HEAD_TYPES.includes(form.type)) || form.purposeNeedsHead;
}

/** An HOD picked who has no OMS login: they could not approve it. */
export function departmentHeadLoginError(name: string): string {
  return `${name || "That Department Head"} has no OMS login to approve with. Choose another, or ask an administrator to create one.`;
}

/* ── Changing an answer, and what it invalidates ─────────────────────────── */

const CLEARED_DOCUMENTS = { selected: [] as OpenDocument[], allocations: {} } as const;
const CLEARED_PARTNER = { partner: "", partnerName: "" } as const;
/** Budget heads are cost centres of ONE company's SAP. The purpose is not. */
const CLEARED_DEPARTMENT = { budget: "", budgetName: "", subBudget: "", subBudgetName: "" } as const;
const CLEARED_REPAYMENT = {
  returnMethod: "",
  returnMethodOther: "",
  installments: "",
  emiAmount: "",
  expectedFromDate: "",
  expectedToDate: "",
} as const;

/** Only the input the line's mode shows may hold a value. */
function tidyAllocation(allocation: Allocation): Allocation {
  return allocation.mode === "FIXED"
    ? { ...allocation, percentage: "" }
    : { ...allocation, amount: "" };
}

/**
 * Drop every value the current answers do not show.
 *
 * Top-down, re-resolving as it goes, because each clear can change what the
 * next level offers — clearing the partner empties the document list, which
 * empties the payment lines.
 */
export function sanitize(form: RequestForm): RequestForm {
  const next = { ...form };

  let c = resolveCase(next);
  if (!c.paymentAgainstOptions.some((option) => option.value === next.paymentAgainst)) {
    next.paymentAgainst = "";
  }
  c = resolveCase(next);
  // A SAMPLE partner must be one the case offers. A LIVE one cannot be
  // checked here (the list is SAP's, searched by the page), so it is kept —
  // `applyChange` clears it whenever the company, type or source changes.
  const partnerOffered = c.livePartners
    ? true
    : c.partners.some((partner) => partner.value === next.partner);
  if (!c.decided || !partnerOffered) Object.assign(next, CLEARED_PARTNER);
  if (!next.partner) next.partnerName = "";

  c = resolveCase(next);
  // Keep only documents of THIS partner — and, for a sample kind, only ones
  // that kind actually holds — with exactly one payment line each: an existing
  // line survives (so ticking a second bill does not wipe what was typed
  // against the first), a new one starts empty, and a line for a document no
  // longer chosen is dropped.
  const sampleIds = c.liveDocuments ? null : new Set(c.documents.map((doc) => doc.id));
  next.selected = c.selectedDocuments.filter((doc) => !sampleIds || sampleIds.has(doc.id));
  // Every line in a mode its kind allows (a PO by % or amount, everything
  // else by amount), a new line in the kind's first; then tidied so only that
  // mode's input holds a value.
  const modes = c.reference ? REFERENCE_KINDS[c.reference].modes : (["FIXED"] as const);
  next.allocations = Object.fromEntries(
    next.selected.map((doc) => {
      const line = next.allocations[doc.id] ?? { ...EMPTY_ALLOCATION, mode: modes[0] };
      // A mode not allowed starts the line afresh: a rupee figure is not a %.
      const held = modes.includes(line.mode) ? line : { ...EMPTY_ALLOCATION, mode: modes[0] };
      return [doc.id, tidyAllocation(held)];
    }),
  );

  if (!c.plainAmount) next.amount = "";
  if (!c.expectedDate) next.expectedDate = "";
  if (!c.repayment) {
    next.returnMethod = "";
    next.expectedFromDate = "";
    next.expectedToDate = "";
  }
  // One Time has one date, the Return Date, held in `expectedToDate`.
  if (next.returnMethod === "ONE_TIME") next.expectedFromDate = "";
  if (!c.expectedBillDate) next.expectedBillDate = "";

  c = resolveCase(next);
  if (!c.installments) {
    next.installments = "";
    next.emiAmount = "";
  }

  // Expense fields live only on an Expense; an Expense names no purpose.
  if (!c.expense) {
    next.payee = "";
    next.subBudget = "";
    next.subBudgetName = "";
    next.effectMonth = "";
    next.isElectricity = false;
    next.expenseTdsCode = "";
    next.expenseLines = [];
  } else {
    next.purpose = "";
    next.purposeLabel = "";
    next.purposeNeedsHead = false;
  }

  // Typed answers live only as long as the "other" choice they describe.
  if (next.paymentAgainst !== "OTHER") next.paymentAgainstOther = "";
  if (next.returnMethod !== "CUSTOM") next.returnMethodOther = "";
  if (!needsDepartmentHead(next)) {
    next.departmentHead = "";
    next.departmentHeadName = "";
    next.departmentHeadLogin = "";
  }

  return next;
}

/**
 * Apply a change, then clear what it made stale.
 *
 * The explicit clears are the stated behaviour of each step — a new Type
 * starts the cascade again from the top; a new partner means the documents
 * were someone else's. `sanitize` then removes anything the new answers no
 * longer show, which is what keeps e.g. a vendor that still qualifies selected
 * across a Payment Against change, and drops one that does not.
 */
export function applyChange(form: RequestForm, patch: Partial<RequestForm>): RequestForm {
  const changed = (key: keyof RequestForm) => key in patch && patch[key] !== form[key];
  let next: RequestForm = { ...form, ...patch };

  // A company is a separate SAP database: its vendors, employees and invoices
  // are not the other companies', and a CardCode chosen under OIL may name
  // someone else — or no one — under MART.
  if (changed("company")) {
    next = { ...next, ...CLEARED_PARTNER, ...CLEARED_DOCUMENTS, ...CLEARED_DEPARTMENT };
  }
  if (changed("type")) {
    // A type with ONE answer (Expense: Direct Expense) has it picked for it.
    const only = next.type ? Object.keys(CASE_RULES[next.type]) : [];
    next = {
      ...next,
      // An Expense is not asked it: direct or indirect follows from its G/L
      // accounts (the server decides; indirect until a direct one is chosen).
      paymentAgainst:
        next.type === "EXPENSE"
          ? "INDIRECT_EXPENSE"
          : only.length === 1
            ? (only[0] as PaymentAgainst)
            : "",
      ...CLEARED_PARTNER,
      ...CLEARED_DOCUMENTS,
      amount: "",
      expectedDate: "",
      ...CLEARED_REPAYMENT,
      expectedBillDate: "",
    };
  }
  if (changed("paymentAgainst")) {
    // NOT the expected bill date: under Imprest it belongs to the type, so a
    // Payment Against change within Imprest keeps it, and `sanitize` removes
    // it anywhere it no longer applies.
    next = {
      ...next,
      ...CLEARED_DOCUMENTS,
      amount: "",
      expectedDate: "",
      ...CLEARED_REPAYMENT,
    };
    // The partner survives only while it comes from the SAME list: a SAP
    // vendor picked under Advance is still a SAP vendor under Against Bill,
    // but it is not one of the sample vendors Against PO lists.
    const before = resolveCase(form).partnerSource;
    const after = resolveCase(next).partnerSource;
    if (before !== after) next = { ...next, ...CLEARED_PARTNER };
  }
  // The dates mean something different under each method (a period for
  // Other, a start and a derived end for EMI, one return date for One Time),
  // so a date typed under one is not carried into another.
  if (changed("returnMethod")) {
    next = { ...next, installments: "", emiAmount: "", expectedFromDate: "", expectedToDate: "" };
  }
  if (next.returnMethod === "EMI") next = linkEmi(form, next, patch);
  // Documents belong to their partner. For a plain-amount case the partner
  // has no documents, so the typed amount stands.
  if (changed("partner") && resolveCase(next).reference) {
    next = { ...next, ...CLEARED_DOCUMENTS };
  }
  // An Expense's vendor names who is paid, unless something else was typed.
  if (changed("partner") && resolveCase(next).expense && (!form.payee || form.payee === form.partnerName)) {
    next = { ...next, payee: next.partnerName };
  }
  // Starting an Expense: one line to fill in. (The month is the Payment desk's.)
  if (resolveCase(next).expense && !resolveCase(form).expense) {
    next = { ...next, expenseLines: next.expenseLines.length ? next.expenseLines : [newExpenseLine()] };
  }

  return sanitize(next);
}

/**
 * Edit ONE document's payment line.
 *
 * A mode change starts the line afresh — a rupee figure is not a percentage —
 * but applies the rest of the same patch, so a quick "50%" that also switches
 * the line to Percentage lands as 50% rather than being wiped by its own
 * mode switch.
 */
export function changeAllocation(
  form: RequestForm,
  id: string,
  patch: Partial<Allocation>,
): RequestForm {
  const current = form.allocations[id];
  if (!current) return form;
  const next =
    patch.mode !== undefined && patch.mode !== current.mode
      ? { ...EMPTY_ALLOCATION, ...patch }
      : { ...current, ...patch };
  return sanitize({ ...form, allocations: { ...form.allocations, [id]: next } });
}

/* ── The numbers ─────────────────────────────────────────────────────────── */

/** Rounded to the paisa, so 33.33% of an odd balance is a payable figure. */
function toPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

export interface Calculation {
  /** The payment this would make, or null while nothing valid is entered. */
  payment: number | null;
  /** What is wrong with the entry, if anything. Shown under the input. */
  error: string | null;
}

/**
 * The payment against a document.
 *
 * ALWAYS FROM THE OPEN AMOUNT. A bill of ₹2,50,000 with ₹1,00,000 already paid
 * has ₹1,50,000 left, and "pay 50%" means half of what is left — ₹75,000 —
 * not half the invoice, which would ask for ₹1,25,000 against a balance that
 * cannot take it. The original amount is shown for context and used for
 * nothing.
 */
export function calculatePayment(
  document: OpenDocument,
  mode: PaymentMode,
  amount: string,
  percentage: string,
): Calculation {
  if (mode === "FIXED") {
    const value = parseNumber(amount);
    if (value === null) return { payment: null, error: null };
    if (Number.isNaN(value) || value <= 0) {
      return { payment: null, error: "Enter an amount above zero." };
    }
    if (value > document.open) {
      return {
        payment: null,
        error: `Cannot exceed the open amount of ${formatINR(document.open)}.`,
      };
    }
    if (value > availableOf(document)) return { payment: null, error: heldError(document) };
    return { payment: toPaise(value), error: null };
  }

  const percent = parseNumber(percentage);
  if (percent === null) return { payment: null, error: null };
  if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
    return { payment: null, error: "Enter a percentage above 0 and up to 100." };
  }
  const payment = toPaise((document.open * percent) / 100);
  if (payment > availableOf(document)) return { payment: null, error: heldError(document) };
  return { payment, error: null };
}

/** Other OMS requests already hold part of the document. */
function heldError(document: OpenDocument): string {
  const held = document.open - availableOf(document);
  return (
    `Only ${formatINR(availableOf(document))} is available: ${formatINR(held)} of it is ` +
    `already held by other OMS requests.`
  );
}

export interface AllocationRow {
  document: OpenDocument;
  allocation: Allocation;
  calc: Calculation;
}

/** One line per chosen document, with what it comes to. */
export function allocationRows(form: RequestForm): AllocationRow[] {
  return resolveCase(form).selectedDocuments.map((document) => {
    const allocation = form.allocations[document.id] ?? EMPTY_ALLOCATION;
    return {
      document,
      allocation,
      calc: calculatePayment(document, allocation.mode, allocation.amount, allocation.percentage),
    };
  });
}

export interface AllocationTotals {
  /** Sum of the chosen documents' open amounts. */
  open: number;
  /** Sum of every line that has a valid payment — the request's Payment Amount. */
  payment: number;
  /** Every line has a valid payment, so `payment` is the whole request. */
  complete: boolean;
}

/**
 * The total is summed in PAISE, as integers, and converted back once — adding
 * rupee floats line by line is how ₹0.1 + ₹0.2 becomes ₹0.30000000000000004.
 */
export function allocationTotals(rows: AllocationRow[]): AllocationTotals {
  const paise = (value: number) => Math.round(value * 100);
  // A ledger DEBIT (a customer's invoice) is netted off, as SAP nets it.
  return {
    open: rows.reduce((sum, row) => sum + lineSign(row.document) * paise(row.document.open), 0) / 100,
    payment:
      rows.reduce((sum, row) => sum + lineSign(row.document) * paise(row.calc.payment ?? 0), 0) / 100,
    complete: rows.length > 0 && rows.every((row) => row.calc.payment !== null),
  };
}

/** A plain amount, for a case with no document to measure it against. */
export function plainAmountError(amount: string): string | null {
  const value = parseNumber(amount);
  if (value === null) return null;
  if (Number.isNaN(value) || value <= 0) return "Enter an amount above zero.";
  return null;
}

/* ── Expense lines ───────────────────────────────────────────────────────── */

/** Most lines one Expense may carry (the server's `MAX_EXPENSE_LINES`). */
export const MAX_EXPENSE_LINES = 50;

const toPaisa = (value: number) => Math.round(value * 100) / 100;

/** A line's amount (its invoice value), or 0 while it is blank or not a positive number. */
export function lineInvoice(line: ExpenseLineForm): number {
  const value = parseNumber(line.amount);
  return value !== null && !Number.isNaN(value) && value > 0 ? value : 0;
}

/** A line's taxable amount: its amount less the GST the desk records — as the server works it. */
export function lineTaxable(line: ExpenseLineForm): number {
  const rate = GST_OPTIONS.find((o) => o.value === line.gstCode)?.rate ?? 0;
  return toPaisa((lineInvoice(line) * 100) / (100 + rate));
}

/** A line's GST: what of its amount is not taxable value. */
export function lineGst(line: ExpenseLineForm): number {
  return toPaisa(lineInvoice(line) - lineTaxable(line));
}

/** What an Expense is worth: the sum of its lines' invoice values. */
export function expenseTotal(lines: ExpenseLineForm[]): number {
  return toPaisa(lines.reduce((sum, line) => sum + lineInvoice(line), 0));
}

/** The TDS code a line deducts: its own, the request's, or none. */
export function lineTdsCode(line: ExpenseLineForm, form: RequestForm): string {
  if (line.tdsOverride === NO_TDS) return "";
  return line.tdsOverride || form.expenseTdsCode;
}

/**
 * A line's TDS on its taxable amount, rounded to the rupee (as the Act and
 * the server round it). `rateOf` the rate of a TDS code; without it, the TDS
 * the server last worked out.
 */
export function lineTds(line: ExpenseLineForm, form: RequestForm, rateOf?: (code: string) => number | null): number {
  if (!rateOf) return Number(line.tdsAmount) || 0;
  const code = lineTdsCode(line, form);
  const rate = code ? rateOf(code) : null;
  return rate ? Math.round((lineTaxable(line) * rate) / 100) : 0;
}

/** An Expense's TDS: the sum of its lines'. */
export function expenseTds(form: RequestForm, rateOf?: (code: string) => number | null): number {
  return form.expenseLines.reduce((sum, line) => sum + lineTds(line, form, rateOf), 0);
}

/** What the Expense's payment pays: its invoice values less its TDS. */
export function expenseNet(form: RequestForm, rateOf?: (code: string) => number | null): number {
  return toPaisa(expenseTotal(form.expenseLines) - expenseTds(form, rateOf));
}

/* ── Repayment ───────────────────────────────────────────────────────────── */

export interface Emi {
  /** Per-installment amount, or null until amount and count are both valid. */
  emi: number | null;
  /** What is wrong with the installment count, if anything. */
  error: string | null;
  /** The division left a remainder, so the EMI shown is rounded. */
  rounded: boolean;
}

/**
 * EMI = Amount ÷ Number of Installments, and nothing more.
 *
 * Deliberately no interest, no schedule, no first-due date: the repayment
 * rules are not decided, and inventing them here would put numbers on screen
 * that nobody has agreed to. Rounded to the paisa, and says so when it had
 * to — ₹20,000 over 3 is not a round figure, and a requester should see that.
 */
export function calculateEmi(amount: string, installments: string): Emi {
  const count = parseNumber(installments);
  if (count === null) return { emi: null, error: null, rounded: false };
  if (Number.isNaN(count) || !Number.isInteger(count) || count < 1) {
    return { emi: null, error: "Enter a whole number of installments.", rounded: false };
  }
  const total = parseNumber(amount);
  if (total === null || Number.isNaN(total) || total <= 0) {
    return { emi: null, error: null, rounded: false };
  }
  const emi = toPaise(total / count);
  return { emi, error: null, rounded: toPaise(emi * count) !== toPaise(total) };
}

/**
 * The EMI a typed installment count gives, as the string the form holds.
 * Empty while it cannot be worked out, so a stale figure never sits beside a
 * count it no longer matches.
 */
function emiFor(amount: string, installments: string): string {
  const { emi } = calculateEmi(amount, installments);
  return emi === null ? "" : String(emi);
}

export interface InstallmentsFromEmi {
  installments: number | null;
  /** What is wrong with the EMI, if anything. */
  error: string | null;
  /** The final installment when it is smaller than the rest, else null. */
  lastInstallment: number | null;
}

/**
 * The other direction: how many installments a typed EMI takes.
 *
 * ROUNDED UP. Rs 20,000 at Rs 6,000 a month is four installments (three full
 * and a last one of Rs 2,000), not 3.33 of them, and never three that leave
 * Rs 2,000 unpaid. The short last one is reported so the form can say so.
 */
export function installmentsFromEmi(amount: string, emiAmount: string): InstallmentsFromEmi {
  const emi = parseNumber(emiAmount);
  if (emi === null) return { installments: null, error: null, lastInstallment: null };
  if (Number.isNaN(emi) || emi <= 0) {
    return { installments: null, error: "EMI must be more than zero.", lastInstallment: null };
  }
  const total = parseNumber(amount);
  if (total === null || Number.isNaN(total) || total <= 0) {
    return { installments: null, error: null, lastInstallment: null };
  }
  if (emi > total) {
    return { installments: null, error: "EMI cannot be more than the amount.", lastInstallment: null };
  }
  // The epsilon keeps 20000 / 5000 at exactly 4 rather than 4.0000000001 -> 5.
  const count = Math.ceil(total / emi - 1e-9);
  const last = toPaise(total - emi * (count - 1));
  return { installments: count, error: null, lastInstallment: last < emi ? last : null };
}

/**
 * Keep installments, EMI and the end date in step, from whichever was edited.
 *
 *   installments typed  ->  EMI = amount / installments
 *   EMI typed           ->  installments = ceil(amount / EMI)
 *   amount changed      ->  the COUNT stands and the EMI follows it, because
 *                           "over 4 months" is the decision a requester makes
 *                           and the rupee figure is its consequence
 *
 * A typed EMI is kept exactly as typed: replacing 6,000 with the 5,000 that
 * 4 installments would imply would be rewriting the requester's answer.
 */
function linkEmi(before: RequestForm, next: RequestForm, patch: Partial<RequestForm>): RequestForm {
  const edited = (key: keyof RequestForm) => key in patch && patch[key] !== before[key];
  let out = next;
  if (edited("installments")) {
    out = { ...out, emiAmount: emiFor(out.amount, out.installments) };
  } else if (edited("emiAmount")) {
    const { installments } = installmentsFromEmi(out.amount, out.emiAmount);
    out = { ...out, installments: installments === null ? "" : String(installments) };
  } else if (edited("amount") && out.installments) {
    out = { ...out, emiAmount: emiFor(out.amount, out.installments) };
  }
  return { ...out, expectedToDate: emiEndDate(out.expectedFromDate, out.installments) };
}

/**
 * `isoDate` plus `months` calendar months.
 *
 * The day is CLAMPED: 31 January plus one month is 28 (or 29) February, not
 * 3 March, which is what bumping a JavaScript Date's month would silently
 * give. Worked on the parts of the ISO string, so no timezone moves the day.
 */
export function addMonths(isoDate: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return "";
  const monthIndex = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), lastDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Expected To Date for EMI: the EMI Start Date plus one month per
 * installment. Empty until both are valid.
 *
 * Start + N months, as specified. Note the last installment of a monthly
 * plan starting on the 1st falls on start + (N - 1) months; start + N is the
 * month AFTER it. If "Expected To" should mean the date of the last EMI
 * itself, this is the one line to change.
 */
export function emiEndDate(start: string, installments: string): string {
  const count = parseNumber(installments);
  if (!start || count === null || Number.isNaN(count) || !Number.isInteger(count) || count < 1) {
    return "";
  }
  return addMonths(start, count);
}

/**
 * Today as `yyyy-mm-dd` in the requester's own timezone, the date on their
 * calendar, which is what "not before today" means to them. `toISOString`
 * would give the UTC date: a day behind in India until 05:30.
 */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "{label} cannot be before today." or null when the date is fine or empty. */
export function pastDateError(label: string, date: string, today: string): string | null {
  return date && date < today ? `${label} cannot be before today.` : null;
}

/**
 * Expected To must not be before Expected From. The same day is allowed — an
 * advance used and settled within one day is a real, if short, period.
 *
 * ISO `yyyy-mm-dd` strings compare correctly as text, so no Date parsing.
 */
export function expectedPeriodError(from: string, to: string): string | null {
  if (!from || !to) return null;
  return to < from ? "Expected To Date cannot be before Expected From Date." : null;
}

/* ── What blocks submit ──────────────────────────────────────────────────── */

export interface Validation {
  /** Visible fields still empty, by label. */
  missing: string[];
  /** Entries present but wrong. */
  problems: string[];
}

/**
 * An Expense's own fields: its lines — each an amount, and a G/L or (not
 * knowing it) remarks saying what it is for. `atPayment`: the Payment desk's
 * check — every line must then have its G/L and a month, and the request its
 * Sub Budget.
 */
export function validateExpense(form: RequestForm, { atPayment = false } = {}): Validation {
  const missing: string[] = [];
  const problems: string[] = [];
  if (atPayment && !form.subBudget) missing.push("Sub Budget");
  if (form.expenseLines.length === 0) missing.push("Expense lines");
  if (form.expenseLines.length > MAX_EXPENSE_LINES) {
    problems.push(`An Expense may have at most ${MAX_EXPENSE_LINES} lines.`);
  }
  if (atPayment && form.expenseLines.some((line) => !(line.effectMonth || form.effectMonth))) {
    missing.push("Month");
  }
  form.expenseLines.forEach((line, index) => {
    const n = index + 1;
    const error = plainAmountError(line.amount);
    if (error) problems.push(`Line ${n}: enter an amount above zero.`);
    else if (!line.amount) missing.push(`Amount on line ${n}`);
    if (atPayment) {
      if (!line.glAccount) missing.push(`G/L account on line ${n}`);
    } else if (line.glUnknown) {
      // Not knowing the G/L is allowed (Payment picks it), but then say what it is for.
      if (!line.remarks.trim()) missing.push(`Remarks on line ${n} (what it is for)`);
    } else if (!line.glAccount) {
      missing.push(`G/L account on line ${n}`);
    }
  });
  return { missing, problems };
}

/**
 * Required means required WHILE VISIBLE. A field the case does not show is
 * never listed as missing — it cannot be filled, and `sanitize` guarantees
 * it is empty anyway.
 */
export function validate(form: RequestForm, today: string = todayIso()): Validation {
  const c = resolveCase(form);
  const missing: string[] = [];
  const problems: string[] = [];

  if (!form.company) missing.push("Company");
  if (!form.type) missing.push("Type");
  if (form.type && !form.paymentAgainst) missing.push("Payment Against");
  else if (form.paymentAgainst === "OTHER" && !form.paymentAgainstOther.trim()) {
    missing.push("Payment Against (what it is)");
  }
  if (c.decided && !c.expense && !form.partner) missing.push(c.partnerLabel);
  if (!form.budget) missing.push("Department");
  if (c.expense) {
    const expense = validateExpense(form);
    missing.push(...expense.missing);
    problems.push(...expense.problems);
  } else if (!form.purpose) missing.push("Payment Purpose");
  if (needsDepartmentHead(form)) {
    if (!form.departmentHead) missing.push("Department Head");
    else if (!form.departmentHeadLogin) problems.push(departmentHeadLoginError(form.departmentHeadName));
  }
  // Vendor → Against PO's Expected Bill Date is optional; one that is given
  // still may not be in the past.
  const poDate = c.expectedDate
    ? pastDateError("Expected Bill Date", form.expectedDate, today)
    : null;
  if (poDate) problems.push(poDate);

  if (c.reference) {
    if (form.partner && form.selected.length === 0) {
      missing.push(REFERENCE_KINDS[c.reference].pluralLabel);
    }
    // Every line must carry a payment. Named by document, because "Payment
    // Amount" alone does not say which of four bills is the one left blank.
    for (const row of allocationRows(form)) {
      if (row.calc.error) problems.push(`${row.document.number}: ${row.calc.error}`);
      else if (row.calc.payment === null) missing.push(`Payment for ${row.document.number}`);
    }
    const totals = allocationTotals(allocationRows(form));
    if (c.reference === "CUSTOMER_LEDGER" && totals.complete && totals.payment <= 0) {
      problems.push(
        "The credits chosen must come to more than the invoices: the refund is the credits less the debits.",
      );
    }
  }
  if (c.plainAmount) {
    const error = plainAmountError(form.amount);
    if (error) problems.push(error);
    else if (!form.amount) missing.push("Amount");
  }

  if (c.repayment) {
    if (!form.returnMethod) missing.push("Return Method");
    else if (form.returnMethod === "CUSTOM" && !form.returnMethodOther.trim()) {
      missing.push("Return Method (what it is)");
    }
    if (form.returnMethod === "EMI") {
      const count = calculateEmi(form.amount, form.installments);
      const fromEmi = installmentsFromEmi(form.amount, form.emiAmount);
      if (count.error) problems.push(count.error);
      else if (!form.installments) missing.push("Number of Installments");
      if (fromEmi.error) problems.push(fromEmi.error);
      else if (!form.emiAmount) missing.push("EMI Amount");
      // The end date is derived, so only the start can ever be "missing".
      if (!form.expectedFromDate) missing.push("EMI Start Date");
      const start = pastDateError("EMI Start Date", form.expectedFromDate, today);
      if (start) problems.push(start);
    } else if (form.returnMethod === "ONE_TIME") {
      if (!form.expectedToDate) missing.push("Return Date");
      const back = pastDateError("Return Date", form.expectedToDate, today);
      if (back) problems.push(back);
    } else if (form.returnMethod) {
      if (!form.expectedFromDate) missing.push("Expected From Date");
      if (!form.expectedToDate) missing.push("Expected To Date");
      const period = expectedPeriodError(form.expectedFromDate, form.expectedToDate);
      if (period) problems.push(period);
    }
  }
  if (c.expectedBillDate && !form.expectedBillDate) missing.push("Expected Bill Date");
  const billDate = c.expectedBillDate
    ? pastDateError("Expected Bill Date", form.expectedBillDate, today)
    : null;
  if (billDate) problems.push(billDate);
  // An Expense is not asked them: dated the day it is raised, remarks optional.
  if (!c.expense) {
    if (!form.ownership.trim()) missing.push("Ownership");
    if (!form.paymentDate) missing.push("Payment Date");
    const payDate = pastDateError("Payment Date", form.paymentDate, today);
    if (payDate) problems.push(payDate);
    if (!form.remarks.trim()) missing.push("Remarks");
  }

  return { missing, problems };
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const INR_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * ₹1,50,000 — Indian grouping, as the app's Excel exports use. Paise are
 * shown only when there are some, so a round figure stays round and a
 * calculated ₹12,345.67 is not silently rounded to the rupee.
 */
export function formatINR(value: number): string {
  return Number.isInteger(value) ? INR_WHOLE.format(value) : INR_PAISE.format(value);
}

/** 04 Aug 2026. */
/**
 * A partner's SAP balance (`OCRD.Balance`, debit minus credit) as a side:
 * a vendor with a CREDIT balance is owed money by us; a DEBIT balance means
 * the vendor owes us (usually advances already paid).
 */
export function balanceSide(
  balance: string | number | null | undefined,
  who = "the vendor",
): {
  amount: number;
  side: "Cr" | "Dr" | "";
  meaning: string;
} {
  const value = Number(balance ?? 0) || 0;
  const amount = Math.round(Math.abs(value) * 100) / 100;
  if (amount === 0) return { amount: 0, side: "", meaning: "Nothing outstanding" };
  return value < 0
    ? { amount, side: "Cr", meaning: `Payable to ${who}` }
    : { amount, side: "Dr", meaning: `Receivable from ${who} (e.g. advances paid)` };
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Due documents ───────────────────────────────────────────────────────── */

/** Where a bill or PO stands against its due date: past it, on it, or neither. */
export type DueState = "OVERDUE" | "DUE_TODAY" | null;

export function dueState(doc: OpenDocument, today: string = todayIso()): DueState {
  if (!doc.dueDate) return null;
  if (doc.dueDate < today) return "OVERDUE";
  if (doc.dueDate === today) return "DUE_TODAY";
  return null;
}

/** "Overdue since 03 Sep 2026" / "Due today", or "" when not due. */
export function dueLabel(doc: OpenDocument, today: string = todayIso()): string {
  const state = dueState(doc, today);
  if (state === "OVERDUE") return `Overdue since ${formatDate(doc.dueDate as string)}`;
  if (state === "DUE_TODAY") return "Due today";
  return "";
}

/**
 * Due documents first, the longest overdue at the top; the rest keep their
 * order. What is due is what the payment is most likely for, and what an
 * approver should see first.
 */
export function dueFirst<T>(items: T[], docOf: (item: T) => OpenDocument, today: string = todayIso()): T[] {
  const due = items
    .filter((item) => dueState(docOf(item), today))
    .sort((a, b) => (docOf(a).dueDate as string).localeCompare(docOf(b).dueDate as string));
  return [...due, ...items.filter((item) => !dueState(docOf(item), today))];
}

