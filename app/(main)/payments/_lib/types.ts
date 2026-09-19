import type { PaymentMethodType } from "./constants";

export interface CashNoteRow {
  id: string;
  denomination: number | null;
  quantity: string;
}

/**
 * A file chosen on the device, before upload.
 *
 * `uri` is a local path (camera capture, gallery item, or a copy of a document
 * pulled from Drive/Files) — it is what the multipart upload sends and what the
 * preview thumbnail renders.
 */
export interface AttachmentStub {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
}

/**
 * One payment method card. All variants share a single shape so a card can
 * switch method (Cash → UPI) without losing the amount already typed; the
 * method-specific parts simply stop being rendered.
 */
export interface PaymentMethodEntry {
  id: string;
  method: PaymentMethodType;
  amount: string;
  /** Cash only — denomination rows, plus whether that section is open. */
  noteRows: CashNoteRow[];
  notesExpanded: boolean;
  /** Cheque only. */
  chequeNumber: string;
  bankName: string;
  chequeDate: string;
  /** UPI / bank transfer / NEFT / RTGS — the payer's transaction reference. */
  reference: string;
  /** Every method except cash — proof of payment. */
  attachments: AttachmentStub[];
  /**
   * WHICH ACCOUNT OF OURS RECEIVES THIS LINE'S MONEY.
   *
   * PER LINE, not per receipt: one receipt can be part cash into a drawer and
   * part UPI into a bank, and each line is posted to the account it names. A
   * single receipt-level key would silently push one line's money into the
   * other's account.
   *
   * The value is the server's `key` — a cash account's G/L (`"1105001"`) or a
   * bank's `BANKCODE:GL` (`"INB:1104106"`). It is CLEARED when the method
   * changes, because a drawer is not a valid destination for a transfer and a
   * house bank is not one for cash.
   */
  accountKey: string;
}

export interface ReceivePaymentForm {
  company: string | null;
  /** A party sentinel or a named company user — see RECEIVED_FROM_OPTIONS. */
  receivedFrom: string | null;
  party: string | null;
  invoice: string | null;
  isAdvance: boolean;
  /**
   * SAP branch, chosen by the user — ADVANCE ONLY.
   *
   * An invoice payment inherits its branch from the invoice and the field is
   * read-only there, because SAP refuses a payment whose branch differs from
   * the invoice being paid.
   */
  sapBranchId: string | null;
  remarks: string;
  methods: PaymentMethodEntry[];
}
