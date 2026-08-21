import { api, API_BASE_URL } from "./api";
import { storage } from "@/src/utils/storage";

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
  /**
   * Present only when the server was asked for balances (`with_open_invoices`
   * or `include_balance`). Read live from SAP, so absent on the plain list.
   */
  open_invoice_count?: number;
  open_balance?: string;
}

/**
 * One open A/R invoice, exactly as the HANA query names its columns.
 *
 * The keys are `doc_entry` / `doc_num`, NOT `sap_doc_entry` / `sap_doc_num` —
 * those prefixed names belong to the ALLOCATION payload we send back when
 * creating a receipt. Mixing them up yields `undefined` at runtime with no type
 * error, which is exactly what produced "INV-undefined" in the picker.
 */
export interface OpenInvoice {
  doc_entry: number;
  doc_num: number;
  doc_date: string;
  due_date: string;
  party_ref: string | null;
  card_code: string;
  card_name: string;
  currency: string;
  doc_total: number;
  paid_to_date: number;
  balance_due: number;
  days_overdue: number;
  /** SAP branch this invoice belongs to — the payment must match it. */
  bpl_id: number | null;
  bpl_name: string;
}

export interface CollectionPerson {
  id: number;
  name: string;
  code: string;
  company: Company | "";
  phone: string;
  is_active: boolean;
}

/**
 * One SAP House Bank Account (DSC1). OMS keeps no bank table — SAP is the
 * master, so a bank added there appears here after the next cache refresh.
 *
 * `key` identifies the ACCOUNT ("CODE:GL"), because one bank can hold several.
 * That is what a dropdown sends and what the backend resolves the G/L from.
 */
export interface BankAccount {
  bank_code: string;
  display_name: string;
  gl_account: string;
  account_number: string;
  branch: string;
  ifsc: string;
  key: string;
  label: string;
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
  /**
   * Snapshots taken when the invoice was picked, so the detail screen can show
   * what was owed at the time without re-reading SAP — and so a later payment
   * against the same invoice does not rewrite this one's history.
   */
  invoice_total?: string;
  balance_at_selection?: string;
}

/** One SAP branch a payment may be posted to. */
export interface SapBranch {
  bpl_id: number;
  bpl_name: string;
}

export interface CreateReceiptPayload {
  company: Company;
  card_code: string;
  card_name: string;
  payment_date: string;
  received_from_type: "PARTY" | "PERSON";
  received_from_person?: number | null;
  is_advance?: boolean;
  /** Advance only — an invoice payment inherits its branch from the invoice. */
  sap_branch_id?: number | null;
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
   * `sap_doc_num` is the number an accountant reads in SAP;
   * `sap_trans_id` is the journal-entry key that finds the posting in JDT1.
   * All are null until the document posts, and stay null if posting fails.
   *
   * `sap_trans_id` is additionally null on anything posted before it was
   * captured — the Service Layer never returns it, so the backend reads it
   * back from SAP. Always null-check it separately from the other two.
   */
  sap_doc_entry: number | null;
  sap_doc_num: number | null;
  sap_trans_id: number | null;
  sap_branch_id: number | null;
  sap_branch_name: string;
  /** The branch this WILL post to, and where it came from. */
  sap_branch?: {
    bpl_id: number | null;
    name: string;
    source: "invoice" | "user" | "none";
    editable: boolean;
    conflict: boolean;
  } | null;
  sap_posted_at: string | null;
  /**
   * SAP's own words from the latest posting attempt — the success confirmation
   * or the rejection reason. Shown verbatim so the user knows exactly what to
   * fix before resubmitting.
   */
  sap_response: string;
  is_advance: boolean;
  created_by_username: string;
  received_from_type: "PARTY" | "PERSON";
  received_from_person: number | null;
  received_from_name?: string;
  /** Cash/UPI/cheque lines making up the total. */
  methods: {
    id: number;
    method: PaymentMethodKind;
    amount: string;
    upi_reference?: string;
    cheque_number?: string;
    /** The CUSTOMER's bank on a cheque — not one of ours. */
    bank_name?: string;
    cheque_date?: string | null;
    /** OUR account for this line, resolved from the admin mapping. */
    deposit_account?: {
      bank_name: string;
      gl_account: string;
      account_number: string;
      branch: string;
    } | null;
    /** Note breakdown — cash lines only. */
    denominations?: { id: number; denomination: number; quantity: number;
                      line_total?: string }[];
  }[];
  /** Which SAP invoices this receipt was applied to. Empty for an advance. */
  allocations: {
    id: number;
    sap_doc_entry: number;
    sap_doc_num: number | null;
    invoice_type: number;
    amount_applied: string;
    /** Snapshots from when the invoice was selected. */
    invoice_total?: string;
    balance_at_selection?: string;
  }[];
  /** Uploaded proof — cheque images, UPI screenshots. */
  attachments: {
    id: number;
    attachment_type: string;
    type_display: string;
    original_name: string;
    uploaded_by_name: string;
    download_url: string;
    created_at: string;
  }[];
  approval: {
    id: number;
    status: string;
    current_level: number;
    total_levels: number;
    level_label: string;
    round_number?: number;
    /** Populated only while the latest round stands rejected. */
    rejection_reason?: string;
    rejected_by?: string;
    rejected_at?: string | null;
  } | null;
  /**
   * What the CALLER may do with this document, decided server-side.
   *
   * Present on the detail endpoint only. The client cannot derive these: the
   * rules depend on the approval ladder and forbid self-approval, so working
   * them out locally would mean two authorities that can disagree.
   */
  permissions?: {
    can_decide: boolean;
    can_edit: boolean;
    can_resubmit: boolean;
  };
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
  /**
   * The cheque fields are present on CHEQUE lines only (the serializer always
   * sends them; they are empty strings for cash). The deposit picker shows
   * them so an employee can match a row to the cheque in their hand.
   */
  methods: {
    id: number;
    method: PaymentMethodKind;
    amount: string;
    cheque_number?: string;
    bank_name?: string;
    cheque_date?: string | null;
  }[];
}

export interface CreateDepositPayload {
  company: Company;
  deposit_date: string;
  deposited_by?: number | null;
  /** SAP house bank account key ("CODE:GL"). The backend resolves the G/L. */
  bank_key: string;
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
  bank_key: string;
  bank_code: string;
  bank_gl_account: string;
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
  sap_trans_id: number | null;
  sap_posted_at: string | null;
  /** SAP's own words — see PaymentReceipt. */
  sap_response: string;
  created_by_name: string;
  created_at: string;
  /**
   * The banked receipts, each carrying enough of its receipt for an approver
   * to verify the physical money without opening it separately — which tender
   * it was, and for a cheque its number, the payer's bank and its date.
   */
  lines: {
    id: number;
    receipt: number;
    receipt_no: string;
    card_name: string;
    card_code: string;
    payment_date: string;
    receipt_status: string;
    receipt_total: string;
    receipt_remarks: string;
    collected_by: string;
    methods: {
      id: number;
      method: PaymentMethodKind;
      amount: string;
      upi_reference?: string;
      cheque_number?: string;
      bank_name?: string;
      cheque_date?: string | null;
    }[];
    amount: string;
  }[];
  approval: {
    id: number;
    status: string;
    current_level: number;
    total_levels: number;
    level_label: string;
  } | null;
  /**
   * What the CALLER may do with this deposit. Same shape and same server
   * helper as a receipt, so both detail screens gate their action bar
   * identically. Present on the detail endpoint only.
   */
  permissions?: {
    can_decide: boolean;
    can_edit: boolean;
    can_resubmit: boolean;
  };
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

  /**
   * Parties in a company.
   *
   * `withOpenInvoices` narrows the list to those that actually owe money — sent
   * when the user is paying against an invoice. For an ADVANCE it must stay
   * false: an advance is not invoice-linked, so a party with nothing
   * outstanding is still a legitimate payer.
   */
  getParties: async (
    company: Company,
    search = "",
    withOpenInvoices = false,
  ): Promise<PartyOption[]> => {
    const query = new URLSearchParams({ company });
    if (search.trim()) query.append("search", search.trim());
    if (withOpenInvoices) query.append("with_open_invoices", "true");
    const res = await api.get(
      `/payments/parties/?${query.toString()}`,
      undefined,
      // Balances move whenever anyone takes a payment, so the filtered list
      // must not be served stale.
      withOpenInvoices ? { cache: "no-store" } : undefined,
    );
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

  /** SAP branches for this company, for the advance-payment picker. */
  getSapBranches: async (company: Company): Promise<SapBranch[]> => {
    const res = await api.get(
      `/payments/sap-branches/?company=${encodeURIComponent(company)}`,
    );
    return rows<SapBranch>(res);
  },

  getBankAccounts: async (company?: Company): Promise<BankAccount[]> => {
    const suffix = company ? `?company=${company}` : "";
    const res = await api.get(`/payments/banks/${suffix}`);
    return rows<BankAccount>(res);
  },

  // ---- Receipts --------------------------------------------------------
  createReceipt: async (payload: CreateReceiptPayload): Promise<PaymentReceipt> => {
    const res = await api.post("/payments/receipts/", payload);
    return unwrap<PaymentReceipt>(res);
  },

  /**
   * Edit a receipt's content.
   *
   * Partial by design: send only what changed. Omitting `methods` or
   * `allocations` leaves the stored rows alone; sending them REPLACES the set.
   * The server re-checks that editing is still allowed, so a stale app cannot
   * rewrite an approved or posted document.
   */
  updateReceipt: async (
    id: number,
    payload: Partial<CreateReceiptPayload>,
  ): Promise<PaymentReceipt> => {
    const res = await api.patch(`/payments/receipts/${id}/`, payload);
    return unwrap<PaymentReceipt>(res);
  },

  submitReceipt: async (id: number): Promise<PaymentReceipt> => {
    const res = await api.post(`/payments/receipts/${id}/submit/`, {});
    return unwrap<PaymentReceipt>(res);
  },

  /**
   * Fetch the receipt as a PNG **data URI** so it can be shown inline with
   * <Image> (no device PDF viewer needed). Authenticated; posted-only +
   * access-controlled on the backend. Throws a readable message on 403/409.
   */
  getReceiptImage: async (id: number): Promise<string> => {
    const token = await storage.getAccessToken();
    const url = `${API_BASE_URL}/payments/receipts/${id}/sap-report/?as=png`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 409) {
      throw new Error(
        "SAP receipt is not available because this payment has not been posted successfully.",
      );
    }
    if (res.status === 403) throw new Error("You do not have access to this receipt.");
    if (!res.ok) throw new Error(`Could not load the receipt (status ${res.status}).`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The receipt image could not be read."));
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Download the receipt PDF to a persistent local file and hand it to the OS
   * (share sheet / open) so the user can save it or send it to the party.
   *
   * Uses ONLY expo-file-system (no native module beyond what the app already
   * bundles): the file is written to the document directory, then opened via an
   * Android content:// URI (or the file:// URI on iOS). Returns the file URI.
   * Throws a readable message on 403 / 409 / network error.
   */
  saveReceiptToDevice: async (id: number, receiptNo?: string): Promise<string> => {
    const FileSystem = await import("expo-file-system/legacy");
    const { Platform } = await import("react-native");
    const token = await storage.getAccessToken();

    const url = `${API_BASE_URL}/payments/receipts/${id}/sap-report/`;
    const name = `Receipt-${receiptNo || id}.pdf`;
    // documentDirectory persists (unlike cacheDirectory, which the OS may purge).
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    const target = `${dir}${name}`;
    const result = await FileSystem.downloadAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status === 409) {
      throw new Error(
        "SAP receipt is not available because this payment has not been posted successfully.",
      );
    }
    if (result.status === 403) throw new Error("You do not have access to this receipt.");
    if (result.status !== 200) {
      throw new Error(`Could not download the receipt (status ${result.status}).`);
    }
    if (Platform.OS === "android") {
      return await FileSystem.getContentUriAsync(result.uri);
    }
    return result.uri;
  },

  /**
   * Download the OMS-generated, SAP-style receipt PDF for a POSTED receipt and
   * return a URI the OS can open. The backend enforces posted-only + access
   * control; this only streams the bytes to a local file (authenticated) and,
   * on Android, exposes it as a grantable content:// URI (a raw file:// URI is
   * blocked by FileProvider). No SAP credentials are involved. Throws with a
   * readable message on 403 / 409 / network error.
   */
  downloadReceiptPdf: async (id: number): Promise<string> => {
    // Legacy FS API (downloadAsync/cacheDirectory/getContentUriAsync) — stable
    // in expo-file-system v19, which otherwise pushes the new File API.
    const FileSystem = await import("expo-file-system/legacy");
    const { Platform } = await import("react-native");
    const token = await storage.getAccessToken();
    const url = `${API_BASE_URL}/payments/receipts/${id}/sap-report/`;
    const target = `${FileSystem.cacheDirectory}Receipt-${id}.pdf`;
    const result = await FileSystem.downloadAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status === 409) {
      throw new Error(
        "SAP receipt is not available because this payment has not been posted successfully.",
      );
    }
    if (result.status === 403) {
      throw new Error("You do not have access to this receipt.");
    }
    if (result.status !== 200) {
      throw new Error(`Could not download the receipt (status ${result.status}).`);
    }
    if (Platform.OS === "android") {
      // Android blocks opening a file:// URI from another app; hand out a
      // content:// URI the PDF viewer is granted read access to.
      return await FileSystem.getContentUriAsync(result.uri);
    }
    return result.uri;
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
    /**
     * The deposit being EDITED, if any. Its own receipts are banked, so the
     * plain list excludes them — pass this and they come back, otherwise the
     * edit form loads with an empty picker and loses the selection.
     */
    depositId?: number | null,
  ): Promise<DepositableReceipt[]> => {
    const scope = depositId ? `&deposit=${depositId}` : "";
    const res = await api.get(
      `/payments/depositable-receipts/?company=${company}${scope}`,
      undefined,
      { cache: 'no-store' },
    );
    return rows<DepositableReceipt>(res);
  },

  createDeposit: async (payload: CreateDepositPayload): Promise<any> => {
    const res = await api.post("/payments/deposits/", payload);
    return unwrap<any>(res);
  },

  /**
   * Edit a deposit in place — used to correct one SAP refused.
   *
   * PATCH, not POST: the deposit NUMBER and its identity are kept, so
   * whatever already references it still resolves. The server re-checks
   * `can_edit` and answers 403 if the document has since posted.
   */
  updateDeposit: async (
    id: number,
    payload: Partial<CreateDepositPayload>,
  ): Promise<any> => {
    const res = await api.patch(`/payments/deposits/${id}/`, payload);
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

  /**
   * Attach one file to a receipt.
   *
   * Sent as multipart/form-data with the `{ uri, name, type }` shape React
   * Native's FormData understands — Content-Type is deliberately NOT set by
   * hand, because fetch has to add its own multipart boundary.
   */
  uploadReceiptAttachment: async (
    receiptId: number,
    file: { uri: string; name: string; mimeType: string },
    attachmentType: "CHEQUE_IMAGE" | "UPI_SCREENSHOT",
  ): Promise<void> => {
    const body = new FormData();
    body.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    body.append("attachment_type", attachmentType);
    await api.post(`/payments/receipts/${receiptId}/attachments/`, body);
  },

  /** Attach one file to a deposit. See uploadReceiptAttachment. */
  uploadDepositAttachment: async (
    depositId: number,
    file: { uri: string; name: string; mimeType: string },
    attachmentType: "DEPOSIT_SLIP" | "DEPOSIT_RECEIPT",
  ): Promise<void> => {
    const body = new FormData();
    body.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    body.append("attachment_type", attachmentType);
    await api.post(`/payments/deposits/${depositId}/attachments/`, body);
  },

  /** Status timeline for a receipt — who changed what, and when. */
  getReceiptHistory: async (id: number): Promise<StatusHistoryRow[]> => {
    const res = await api.get(`/payments/receipts/${id}/history/`, undefined, {
      cache: "no-store",
    });
    return rows<StatusHistoryRow>(res);
  },
};

export default paymentsService;
