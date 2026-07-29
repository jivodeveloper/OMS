import type { PaymentMethodType } from "./constants";

export interface CashNoteRow {
  id: string;
  denomination: number | null;
  quantity: string;
}

export interface AttachmentStub {
  id: string;
  name: string;
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
  /** UPI and Cheque — proof of payment. */
  attachments: AttachmentStub[];
}

export interface ReceivePaymentForm {
  company: string | null;
  /** A party sentinel or a named company user — see RECEIVED_FROM_OPTIONS. */
  receivedFrom: string | null;
  party: string | null;
  invoice: string | null;
  isAdvance: boolean;
  remarks: string;
  methods: PaymentMethodEntry[];
}
