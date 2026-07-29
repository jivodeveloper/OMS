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
  /** Display-ready size, e.g. "1.2 MB". */
  size: string;
  kind: AttachmentKind;
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
  /** Cheque only. */
  chequeNumber?: string;
  bankName?: string;
  chequeDate?: string;
  /** UPI and Cheque — proof of payment. */
  attachment?: Omit<ApprovalAttachment, "id">;
}

export interface ApprovalDetail {
  requestNo: string;
  status: ApprovalStatus;
  party: string;
  company: string;
  createdBy: string;
  createdDate: string;
  createdTime: string;
  invoice: string;
  paymentType: string;
  amount: number;
  remarks: string;
  payments: ApprovalPayment[];
  attachments: ApprovalAttachment[];
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
