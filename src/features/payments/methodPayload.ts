/**
 * Turning a payment-method card into the line the API expects.
 *
 * Extracted from the Receive Payment screen so it can be asserted directly.
 * The thing most worth asserting is the one most easily got wrong: a CHEQUE
 * carries TWO banks, and they are not interchangeable.
 *
 *   bank_name    the bank the CUSTOMER's cheque is drawn on, printed on the
 *                paper. Goes to SAP as BankCode. Free text, theirs.
 *   account_key  the account of OURS the money is received into, chosen from
 *                SAP's own list. The server resolves it and snapshots the
 *                result onto the line.
 *
 * Merging them would post the customer's bank as our receiving account, which
 * is both wrong and plausible-looking — the failure would surface as money
 * landing in the wrong G/L, days later, in SAP.
 *
 * WHY IT LIVES IN `src/` AND NOT BESIDE THE FORM
 * ----------------------------------------------
 * Expo Router bundles EVERYTHING under `app/` through `require.context`, not
 * just what the screens import — so a `.test.ts` file there is pulled into the
 * Android bundle, where `node:assert` does not exist and the build fails. The
 * `_` prefix stops a file becoming a route; it does not stop it being bundled.
 *
 * Keeping this module and its test in `src/` is also the convention the rest
 * of the app already follows: `app/` holds route shells, `src/` holds the
 * logic they call.
 */
import type { PaymentMethodEntry } from "@/app/(main)/payments/_lib/types";

/** The wire shape of one payment line. Mirrors `MethodPayload` on the service. */
export interface MethodLinePayload {
  method: "CASH" | "UPI" | "CHEQUE";
  amount: string;
  /** OUR receiving account. Empty only for a line raised without the picker. */
  account_key: string;
  denominations?: { denomination: number; quantity: number }[];
  cheque_number?: string;
  /** The CUSTOMER's bank — never our own. */
  bank_name?: string;
  cheque_date?: string;
  upi_reference?: string;
}

/**
 * One card → one API line.
 *
 * `account_key` is on EVERY method, including cash: a drawer is as much a
 * receiving account as a house bank, and the old behaviour of resolving cash
 * from an admin mapping is exactly what this replaces.
 */
export function buildMethodPayload(
  entry: PaymentMethodEntry,
): MethodLinePayload {
  const base = {
    method: entry.method.toUpperCase() as MethodLinePayload["method"],
    amount: String(Number(entry.amount) || 0),
    // The account the user picked for THIS line. Per line, never per receipt:
    // two lines can legitimately be received into two different accounts.
    account_key: entry.accountKey,
  };

  if (entry.method === "cash") {
    return {
      ...base,
      denominations: entry.noteRows
        .filter((row) => row.denomination && Number(row.quantity) > 0)
        .map((row) => ({
          denomination: Number(row.denomination),
          quantity: Number(row.quantity),
        })),
    };
  }

  if (entry.method === "cheque") {
    return {
      ...base,
      cheque_number: entry.chequeNumber,
      // THEIRS, not ours. See the module docstring.
      bank_name: entry.bankName,
      cheque_date: entry.chequeDate || undefined,
    };
  }

  // UPI. The receiving account rides on `base.account_key` like every other
  // method; only the payer's own reference is specific to a transfer.
  return { ...base, upi_reference: entry.reference || "" };
}

/**
 * The patch to apply when a card's method changes.
 *
 * The account goes with the method. A drawer is not a valid destination for a
 * transfer and a house bank is not one for cash, so switching clears the
 * choice rather than carrying across a key the server would reject — or,
 * worse, one it would accept for the wrong kind of account.
 *
 * Re-selecting the SAME method is not a change and must not wipe a choice the
 * user has already made.
 */
export function methodChangePatch(
  current: PaymentMethodEntry["method"],
  next: PaymentMethodEntry["method"],
): Partial<PaymentMethodEntry> {
  return next === current
    ? { method: next }
    : { method: next, accountKey: "" };
}

/**
 * Which list of accounts a method may be received into.
 *
 * CASH is received into a cash G/L; UPI and CHEQUE into a house bank. The
 * latter two share one list deliberately — SAP draws no distinction and the
 * same bank legitimately receives both, which is also what the server accepts.
 */
export function accountKindFor(
  method: PaymentMethodEntry["method"],
): "CASH" | "BANK" {
  return method === "cash" ? "CASH" : "BANK";
}
