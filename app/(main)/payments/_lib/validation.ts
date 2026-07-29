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
 * Returns null when there is nothing to complain about yet — no amount typed,
 * or no denominations recorded at all — so the user isn't shown an error before
 * they've had a chance to fill the section in.
 */
export const validateCashBreakdown = (
  entry: PaymentMethodEntry,
): CashBreakdownError | null => {
  if (entry.method !== "cash") return null;

  const amount = Number(entry.amount) || 0;
  if (amount <= 0) return null;
  if (entry.noteRows.length === 0) return null;

  const breakdown = noteRowsTotal(entry.noteRows);
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
