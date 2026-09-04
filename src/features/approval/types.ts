/** Shared types for the Approval Requests feature. */

export type ApprovalStatus = "Pending" | "Approved" | "Rejected";

/** Status filter also allows "All", which is not a real request status. */
export type ApprovalStatusFilter = ApprovalStatus | "All";

/** Chip categories — each maps to its own colour in ApprovalTags. */
export type ApprovalTag =
  | "Invoice"
  | "Purchase"
  | "Vendor"
  | "Bank"
  | "Payment"
  | "Deposit";

export type ApprovalType =
  | "Invoice Approval"
  | "Payment Approval"
  | "Bank Deposit Approval";

export interface ApprovalRequest {
  id: string;
  requestNo: string;
  type: ApprovalType;
  party: string;
  /** SAP business-partner code. Optional here — list rows predate it. */
  partyCode?: string;
  company: string;
  amount: number;
  status: ApprovalStatus;
  createdBy: string;
  /** Display-ready date, e.g. "28 Jul 2026, 09:10 AM". */
  createdDate: string;
  /** Human-readable approval progress, e.g. "Level 2 of 3". */
  level: string;
  /** The kind of document behind the request, shown as the first info chip. */
  invoiceType: string;
  tags: ApprovalTag[];
}

// ── Approval details ──────────────────────────────────────────────────────

export type PaymentMethodType = "Cash" | "UPI" | "Cheque";

export type AttachmentKind = "image" | "pdf";

export interface ApprovalAttachment {
  id: string;
  name: string;
  /** Display-ready label — the attachment type, e.g. "Cheque image". */
  size: string;
  kind: AttachmentKind;
  /** Server path for viewing/downloading. Absent on legacy rows. */
  downloadUrl?: string;
}

export interface CashNoteRow {
  denomination: number;
  quantity: number;
}

/**
 * One payment inside a request. All three method variants share a shape so the
 * accordion can render any of them without a discriminated union at the call
 * site; the method-specific fields are simply absent on the others.
 */
export interface ApprovalPayment {
  id: string;
  type: PaymentMethodType;
  amount: number;
  /** Cash only. */
  noteRows?: CashNoteRow[];
  remarks?: string;
  /** UPI only. */
  upiReference?: string;
  /** Cheque only — the bank the CUSTOMER's cheque is drawn on. */
  chequeNumber?: string;
  bankName?: string;
  chequeDate?: string;
  /**
   * OUR account for this line, resolved from the admin mapping.
   *
   * Deliberately separate from `bankName`: one is the payer's bank, the other
   * is where we deposit. Showing them under one heading was what made the
   * cheque flow confusing.
   */
  depositAccount?: {
    bankName: string;
    glAccount: string;
    accountNumber: string;
    branch: string;
  } | null;
  /**
   * Proof of payment belonging to THIS method — a cheque image, a UPI
   * screenshot. A method can carry several (front and back of a cheque), so
   * this is a list; the separate Attachments card shows only what is left over.
   */
  attachments?: ApprovalAttachment[];
}

export interface ApprovalDetail {
  requestNo: string;
  status: ApprovalStatus;
  party: string;
  /** SAP business-partner code, shown beside the party name. */
  partyCode: string;
  company: string;
  createdBy: string;
  /**
   * The login behind `createdBy`. Carried but NOT rendered on the details
   * card — the full name reads better there. Kept because it is the only
   * unambiguous identity when two accounts share a display name, which the
   * live data does have.
   */
  createdByUsername: string;
  /** ISO timestamp the entry was raised, for the handover comparison. */
  createdAt: string | null;
  createdDate: string;
  createdTime: string;
  invoice: string;
  /** Invoice figures for the summary card. Zero when it is an advance. */
  invoiceAmount: number;
  paymentType: string;
  amount: number;
  remarks: string;
  /**
   * What SAP did with the receipt, for the SAP Information card.
   *
   * `status` here is the RECEIPT's status (POSTED / PENDING_ERROR / …), which
   * is not the same as `status` above — that one is the APPROVAL's state. A
   * receipt can be fully approved and still have failed to post, and the card
   * has to report the posting, not the approval.
   */
  sap: {
    status: string;
    sap_doc_entry: number | null;
    sap_doc_num: number | null;
    sap_trans_id: number | null;
    sap_posted_at: string | null;
    sap_response: string;
  };
  payments: ApprovalPayment[];
  attachments: ApprovalAttachment[];
  /** Server-decided: what the viewer may do. Drives the action bar. */
  canDecide: boolean;
  canEdit: boolean;
  canResubmit: boolean;
  /** Why it was sent back, so the creator can fix it. Empty when not rejected. */
  rejectionReason: string;
  rejectedBy: string;
  /** Receipt id, for navigating to the edit form. */
  documentId: number;
  /**
   * The handover (verification) axis — ORTHOGONAL to the approval status
   * above. A receipt carries both, and one is never inferred from the other.
   * Null on a backend that predates verification.
   */
  verificationStatus: "PENDING" | "VERIFIED" | null;
  /** `YYYY-MM-DD` the money changed hands. Null on a legacy row. */
  collectedAt: string | null;
  verifiedBy: string;
  verifiedByUsername: string;
  verifiedAt: string | null;
  verificationRemarks: string;
  /** Creator's user id, for the self-verification check. */
  createdById: number | null;
  /**
   * The collection person who physically handed the money over. Empty when the
   * party paid directly — that name is already shown as the party.
   */
  receivedFrom: string;
  /** Branch this will post to, with its source — "DELHI (Auto from Invoice)". */
  sapBranch: string;
}

/** Which dialog the approve/reject flow is currently showing. */
export type ApprovalDialogStage =
  | "none"
  | "approve"
  | "reject"
  | "loading"
  | "success";

export type ApprovalDecision = "approve" | "reject";

/** What the list hook returns — mirrors a future query result's shape. */
export interface ApprovalListState {
  requests: ApprovalRequest[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  search: string;
  status: ApprovalStatusFilter;
  setSearch: (value: string) => void;
  setStatus: (value: ApprovalStatusFilter) => void;
  onRefresh: () => void;
  retry: () => void;
}
