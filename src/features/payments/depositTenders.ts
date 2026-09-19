/**
 * Where each tender in a deposit ended up, once it has posted.
 *
 * A deposit is one document to the person banking it and TWO different
 * accounting events underneath:
 *
 *   CASH    is posted to SAP by the deposit itself — the drawer is credited
 *           and the bank debited, under this deposit's own document number.
 *
 *   CHEQUE  is NOT posted by the deposit. It already reached SAP when its own
 *           receipt posted (Dr bank / Cr receivable), so posting it again
 *           would debit the bank twice. It is recorded under the RECEIPT's
 *           document number, not the deposit's.
 *
 * That is correct, and completely invisible on screen: an approver sees a
 * deposit for ₹100,000 and one SAP document covering ₹60,000 of it, with
 * nothing saying where the other ₹40,000 went. This produces both halves so
 * the screen can say it.
 *
 * Pure, so the arithmetic and the "where" can be asserted directly — see
 * `depositTenders.test.ts`.
 */
import type { BankDeposit } from "@/src/services/payments.service";

export interface ChequeRecord {
  /** The cheque as written, for matching against the paper. */
  chequeNumber: string;
  /** The payer's bank — theirs, not ours. */
  payerBank: string;
  amount: number;
  /** The receipt that banked it, and where SAP recorded it. */
  receiptNo: string;
  sapDocNum: number | null;
  postedAt: string | null;
}

export interface DepositTenders {
  /**
   * The cash this deposit POSTED to SAP — `deposit_amount`, the money that
   * actually reached the bank.
   *
   * NOT the cash in the linked receipts. The AP team sometimes spends part of
   * a collection before banking it (that is what `shortfall_reason` records),
   * and SAP is told what was banked. Showing the receipts' figure here would
   * print a number the SAP document does not contain.
   */
  cashTotal: number;
  /** Cash collected but not banked. Zero for a full deposit. */
  cashShortfall: number;
  /** Total cheques, already in SAP under their own receipts. */
  chequeTotal: number;
  /** One entry per cheque, with the document it is recorded under. */
  cheques: ChequeRecord[];
  /** True when the deposit carries both tenders — the case worth explaining. */
  isMixed: boolean;
  /** True when there is no cash at all: SAP receives nothing for this deposit. */
  isChequeOnly: boolean;
}

const toAmount = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Split a deposit into what SAP took and what was already there.
 *
 * Reads the deposit's own lines, so it needs no extra request and stays true
 * for a deposit that has not posted yet — the split is a property of what is
 * being banked, not of the posting.
 */
export function depositTenders(
  deposit:
    | (Pick<BankDeposit, "lines"> &
       Partial<Pick<BankDeposit, "deposit_amount" | "collected_amount">>)
    | null
    | undefined,
): DepositTenders {
  let cashCollected = 0;
  let chequeTotal = 0;
  const cheques: ChequeRecord[] = [];

  for (const line of deposit?.lines ?? []) {
    for (const method of line.methods ?? []) {
      const amount = toAmount(method.amount);
      if (method.method === "CASH") {
        cashCollected += amount;
        continue;
      }
      if (method.method !== "CHEQUE") continue;

      chequeTotal += amount;
      cheques.push({
        chequeNumber: (method.cheque_number || "").trim(),
        payerBank: (method.bank_name || "").trim(),
        amount,
        receiptNo: line.receipt_no,
        // Null while the receipt has not posted — which is possible: a
        // deposit can be raised over a receipt still awaiting SAP. The screen
        // says "pending" rather than inventing a document number.
        sapDocNum: line.receipt_sap_doc_num ?? null,
        postedAt: line.receipt_posted_at ?? null,
      });
    }
  }

  // What SAP holds is `deposit_amount`. Fall back to the receipts' cash only
  // when the field is absent — an older cached payload, or a caller passing
  // lines alone — where a full deposit is the safe reading.
  const cashTotal =
    deposit?.deposit_amount === undefined || deposit?.deposit_amount === null
      ? cashCollected
      : toAmount(deposit.deposit_amount);

  return {
    cashTotal,
    // Never negative: `deposit_amount` cannot exceed the cash collected (the
    // server rejects that), but a stale payload should still not render a
    // minus sign.
    cashShortfall: Math.max(0, cashCollected - cashTotal),
    chequeTotal,
    cheques,
    isMixed: cashTotal > 0 && chequeTotal > 0,
    isChequeOnly: cashTotal === 0 && chequeTotal > 0,
  };
}
