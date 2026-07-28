import type { PaymentMethodType, PayToType } from "./constants";

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
  /** Cash only — denomination rows. */
  noteRows: CashNoteRow[];
  /** UPI and Cheque only — proof of payment. */
  attachments: AttachmentStub[];
}

export interface ReceivePaymentForm {
  receivedFrom: PayToType | null;
  party: string | null;
  remarks: string;
  methods: PaymentMethodEntry[];
}
