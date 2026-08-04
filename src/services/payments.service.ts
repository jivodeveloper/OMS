import { api } from "./api";

/**
 * Payments + deposits API.
 *
 * Mirrors the DRF serializers under /api/payments/. Every list the Receive
 * Payment and Bank Deposit screens render comes from here — the screens hold
 * no master data of their own, so a company added in the web admin appears in
 * the app without a release.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Company IS category — OIL/BEVERAGES/MART map 1:1 to SAP company databases. */
export type Company = "OIL" | "BEVERAGES" | "MART";

export interface CompanyOption {
  id: number;
  company: Company;
  display_name: string;
  is_active: boolean;
}

export interface PartyOption {
  card_code: string;
  card_name: string;
  label: string;
  company: Company;
  state?: string;
}

export interface OpenInvoice {
  sap_doc_entry: number;
  sap_doc_num: number;
  doc_date: string;
  due_date: string;
  doc_total: string;
  paid_to_date: string;
  balance_due: string;
}

export interface CollectionPerson {
  id: number;
  name: string;
  code: string;
  company: Company | "";
  phone: string;
  is_active: boolean;
}

export interface BankAccount {
  id: number;
  name: string;
  company: Company;
  account_type: "CASH" | "BANK";
  masked_number: string;
  is_active: boolean;
}

export type PaymentMethodKind = "CASH" | "UPI" | "CHEQUE";

export interface MethodPayload {
  method: PaymentMethodKind;
  amount: string;
  upi_reference?: string;
  cheque_number?: string;
  bank_name?: string;
  cheque_date?: string;
  denominations?: { denomination: number; quantity: number }[];
}

export interface AllocationPayload {
  sap_doc_entry: number;
  sap_doc_num?: number;
  amount_applied: string;
}

export interface CreateReceiptPayload {
  company: Company;
  card_code: string;
  card_name: string;
  payment_date: string;
  received_from_type: "PARTY" | "PERSON";
  received_from_person?: number | null;
  is_advance?: boolean;
  remarks?: string;
  methods: MethodPayload[];
  allocations?: AllocationPayload[];
}

export interface PaymentReceipt {
  id: number;
  receipt_no: string;
  company: Company;
  card_code: string;
  card_name: string;
  payment_date: string;
  total_amount: string;
  allocated_amount: string;
  unallocated_amount: string;
  status: string;
  status_display: string;
  remarks: string;
  created_by_name: string;
  created_at: string;
  /**
   * The permanent OMS<->SAP link, written only on a successful post.
   * `sap_doc_entry` is SAP's internal key (used for every later API call);
   * `sap_doc_num` is the number an accountant reads in SAP. All three are null
   * until the document posts, and stay null if posting fails.
   */
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  sap_posted_at: string | null;
  /**
   * SAP's own words from the latest posting attempt — the success confirmation
   * or the rejection reason. Shown verbatim so the user knows exactly what to
   * fix before resubmitting.
   */
  sap_response: string;
  /** Cash/UPI/cheque lines making up the total. */
  methods: {
    id: number;
    method: PaymentMethodKind;
    amount: string;
    upi_reference?: string;
    cheque_number?: string;
    bank_name?: string;
    cheque_date?: string | null;
  }[];
  approval: {
    id: number;
    status: string;
    current_level: number;
    total_levels: number;
    level_label: string;
  } | null;
}

/**
 * A posted receipt awaiting banking.
 *
 * The endpoint returns the full PaymentReceiptSerializer, so `methods` is
 * present — the deposit screen needs it to split the total into cash vs cheque.
 */
export interface DepositableReceipt {
  id: number;
  receipt_no: string;
  card_name: string;
  card_code: string;
  payment_date: string;
  total_amount: string;
  company: Company;
  status: string;
  methods: { id: number; method: PaymentMethodKind; amount: string }[];
}

export interface CreateDepositPayload {
  company: Company;
  deposit_date: string;
  deposited_by?: number | null;
  bank_account: number;
  deposit_type: "CASH" | "CHEQUE" | "MIXED";
  collected_amount: string;
  deposit_amount: string;
  shortfall_reason?: string;
  slip_number?: string;
  remarks?: string;
  receipt_ids: number[];
}

/** A bank deposit as returned by the API. */
export interface BankDeposit {
  id: number;
  deposit_no: string;
  company: Company;
  deposit_date: string;
  deposited_by: number | null;
  deposited_by_name: string;
  bank_account: number;
  bank_account_name: string;
  deposit_type: "CASH" | "CHEQUE" | "MIXED";
  collected_amount: string;
  deposit_amount: string;
  shortfall: string;
  shortfall_reason: string;
  slip_number: string;
  remarks: string;
  status: string;
  status_display: string;
  /** Permanent OMS<->SAP link — see PaymentReceipt. */
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  sap_posted_at: string | null;
  /** SAP's own words — see PaymentReceipt. */
  sap_response: string;
  created_by_name: string;
  created_at: string;
  lines: {
    id: number;
    receipt: number;
    receipt_no: string;
    card_name: string;
    amount: string;
  }[];
  approval: {
    id: number;
    status: string;
    current_level: number;
    total_levels: number;
    level_label: string;
  } | null;
}

/** One row of a document's status timeline. */
export interface StatusHistoryRow {
  id: number;
  from_status: string;
  to_status: string;
  reason: string;
  actor_kind: string;
  changed_by_username: string;
  created_at: string;
}

/**
 * One SAP posting attempt. Append-only on the server — a row is never edited
 * or removed, so a failed attempt stays visible after a later one succeeds.
 */
export interface SapPostingHistoryRow {
  id: number;
  attempt_number: number;
  action:
    | "POST_STARTED"
    | "POST_SUCCESS"
    | "POST_FAILED"
    | "POST_TIMEOUT"
    | "RESUBMITTED"
    | "MANUAL_RECOVERY";
  action_display: string;
  status: "POSTING" | "SUCCESS" | "FAILED" | "UNKNOWN";
  status_display: string;
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  sap_response: string;
  created_by_username: string;
  created_at: string;
}

/** What the signed-in user may DO in this module (server-decided). */
export interface PaymentPermissions {
  permissions: string[];
  available: { key: string; label: string }[];
  can: {
    Payments_Create: boolean;
    Payments_Approve: boolean;
    Deposit_Create: boolean;
    Deposit_Approve: boolean;
  };
}

// ---------------------------------------------------------------------------
// Response unwrapping
//
// New-module views wrap payloads in { success, message, data }; some lists then
// paginate INSIDE that. Normalising here keeps the shape juggling out of every
// screen.
// ---------------------------------------------------------------------------

const unwrap = <T>(body: any): T =>
  body && typeof body === "object" && "data" in body ? body.data : body;

const rows = <T>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const paymentsService = {
  /** What this user may do — drives which screens and buttons appear. */
  getMyPermissions: async (): Promise<PaymentPermissions | null> => {
    try {
      const res = await api.get("/payments/my-permissions/", undefined, { cache: 'no-store' });
      return unwrap<PaymentPermissions>(res);
    } catch {
      // Never block the UI on this — callers fall back to "no permissions",
      // and the server still rejects anything the user may not do.
      return null;
    }
  },

  // ---- Cascade: company -> party -> invoices ---------------------------
  getCompanies: async (): Promise<CompanyOption[]> => {
    const res = await api.get("/payments/companies/");
    return rows<CompanyOption>(res);
  },

  getParties: async (company: Company, search = ""): Promise<PartyOption[]> => {
    const query = new URLSearchParams({ company });
    if (search.trim()) query.append("search", search.trim());
    const res = await api.get(`/payments/parties/?${query.toString()}`);
    return rows<PartyOption>(res);
  },

  getOpenInvoices: async (
    company: Company,
    cardCode: string,
  ): Promise<OpenInvoice[]> => {
    const query = new URLSearchParams({ company, card_code: cardCode });
    // Balances change whenever anyone takes a payment, so this must never be
    // served from cache — a stale figure lets two collectors over-apply.
    const res = await api.get(
      `/payments/open-invoices/?${query.toString()}`,
      undefined,
      { cache: 'no-store' },
    );
    return rows<OpenInvoice>(res);
  },

  getCollectionPersons: async (company?: Company): Promise<CollectionPerson[]> => {
    const suffix = company ? `?company=${company}` : "";
    const res = await api.get(`/payments/collection-persons/${suffix}`);
    return rows<CollectionPerson>(res);
  },

  getBankAccounts: async (company?: Company): Promise<BankAccount[]> => {
    const suffix = company ? `?company=${company}` : "";
    const res = await api.get(`/payments/bank-accounts/${suffix}`);
    return rows<BankAccount>(res);
  },

  // ---- Receipts --------------------------------------------------------
  createReceipt: async (payload: CreateReceiptPayload): Promise<PaymentReceipt> => {
    const res = await api.post("/payments/receipts/", payload);
    return unwrap<PaymentReceipt>(res);
  },

  submitReceipt: async (id: number): Promise<PaymentReceipt> => {
    const res = await api.post(`/payments/receipts/${id}/submit/`, {});
    return unwrap<PaymentReceipt>(res);
  },

  listReceipts: async (params: Record<string, string> = {}): Promise<PaymentReceipt[]> => {
    const query = new URLSearchParams(params).toString();
    const res = await api.get(
      `/payments/receipts/${query ? `?${query}` : ""}`,
      undefined,
      { cache: 'no-store' },
    );
    return rows<PaymentReceipt>(res);
  },

  // ---- Deposits --------------------------------------------------------
  getDepositableReceipts: async (
    company: Company,
  ): Promise<DepositableReceipt[]> => {
    const res = await api.get(
      `/payments/depositable-receipts/?company=${company}`,
      undefined,
      { cache: 'no-store' },
    );
    return rows<DepositableReceipt>(res);
  },

  createDeposit: async (payload: CreateDepositPayload): Promise<any> => {
    const res = await api.post("/payments/deposits/", payload);
    return unwrap<any>(res);
  },

  submitDeposit: async (id: number): Promise<any> => {
    const res = await api.post(`/payments/deposits/${id}/submit/`, {});
    return unwrap<any>(res);
  },

  /** Deposits, for the tracking screen. `mine=true` scopes to the caller's own. */
  listDeposits: async (params: Record<string, string> = {}): Promise<BankDeposit[]> => {
    const query = new URLSearchParams(params).toString();
    const res = await api.get(
      `/payments/deposits/${query ? `?${query}` : ""}`,
      undefined,
      { cache: "no-store" },
    );
    return rows<BankDeposit>(res);
  },

  getReceipt: async (id: number): Promise<PaymentReceipt> => {
    const res = await api.get(`/payments/receipts/${id}/`, undefined, {
      cache: "no-store",
    });
    return unwrap<PaymentReceipt>(res);
  },

  getDeposit: async (id: number): Promise<BankDeposit> => {
    const res = await api.get(`/payments/deposits/${id}/`, undefined, {
      cache: "no-store",
    });
    return unwrap<BankDeposit>(res);
  },

  /** Status timeline for a receipt — who changed what, and when. */
  getReceiptHistory: async (id: number): Promise<StatusHistoryRow[]> => {
    const res = await api.get(`/payments/receipts/${id}/history/`, undefined, {
      cache: "no-store",
    });
    return rows<StatusHistoryRow>(res);
  },

  /**
   * Every SAP posting attempt on a receipt, newest first.
   *
   * Separate from `getReceiptHistory`: that timeline tracks the approval
   * lifecycle (who submitted, who approved), while this one records what
   * happened when the document was pushed to SAP — including the failures a
   * successful re-post would otherwise hide.
   */
  getReceiptSapHistory: async (id: number): Promise<SapPostingHistoryRow[]> => {
    const res = await api.get(
      `/payments/receipts/${id}/sap-history/`,
      undefined,
      { cache: "no-store" },
    );
    return rows<SapPostingHistoryRow>(res);
  },
};

export default paymentsService;
