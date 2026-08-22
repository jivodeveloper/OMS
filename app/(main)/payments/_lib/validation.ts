import type { CashNoteRow, PaymentMethodEntry } from "./types";

/** Sum of denomination × quantity across the denomination rows. */
export const noteRowsTotal = (rows: CashNoteRow[]) =>
  rows.reduce(
    (sum, row) => sum + (row.denomination ?? 0) * (Number(row.quantity) || 0),
    0,
  );

export interface CashBreakdownError {
  message: string;
  /** Signed gap (denominations − amount): negative is short, positive is over. */
  difference: number;
}

/**
 * A cash payment's denominations must add up to exactly the amount entered.
 *
 * The breakdown is MANDATORY once an amount is typed: it is the count of the
 * physical notes handed over, and a cash receipt without it cannot be checked
 * against what the collector actually carries. Leaving it empty used to pass
 * silently, so a receipt could be raised for cash nobody had counted.
 *
 * Returns null only when there is genuinely nothing to complain about yet —
 * a non-cash method, or no amount typed — so the user is not shown an error
 * before they have had a chance to fill anything in.
 */
export const validateCashBreakdown = (
  entry: PaymentMethodEntry,
): CashBreakdownError | null => {
  if (entry.method !== "cash") return null;

  const amount = Number(entry.amount) || 0;
  if (amount <= 0) return null;

  const breakdown = noteRowsTotal(entry.noteRows);

  // No rows at all, or rows that are still blank. Both mean nothing has been
  // counted yet, and the whole amount is outstanding.
  if (entry.noteRows.length === 0 || breakdown === 0) {
    return {
      difference: -amount,
      message:
        `Add the cash denominations for ₹${amount.toLocaleString("en-IN")}. ` +
        `The note breakdown is required for a cash payment.`,
    };
  }

  if (breakdown === amount) return null;

  const difference = breakdown - amount;
  return {
    difference,
    message:
      difference < 0
        ? `Denominations are short by ₹${Math.abs(difference).toLocaleString("en-IN")}. They must equal the amount entered.`
        : `Denominations exceed the amount by ₹${difference.toLocaleString("en-IN")}. They must equal the amount entered.`,
  };
};

/** True when any card's denominations don't balance against its amount. */
export const hasBlockingErrors = (methods: PaymentMethodEntry[]) =>
  methods.some((entry) => validateCashBreakdown(entry) !== null);
