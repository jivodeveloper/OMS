/**
 * Which receipts belong in a deposit of a given type.
 *
 * The deposit type decides what the employee is physically carrying to the
 * bank. A CASH deposit is an envelope of notes; a CHEQUE deposit is a stack of
 * paper. There is no third kind.
 *
 * MIXED WAS REMOVED, and the reason is worth keeping. A deposit's arithmetic
 * counts CASH ONLY: a cheque reached the bank when its own RECEIPT posted to
 * SAP, so the deposit records the DAY it was handed in and nothing more. Once
 * the two stopped being added together, "both tenders" stopped being a kind of
 * deposit — a cheque riding along on a cash deposit costs nothing, because it
 * is recorded rather than counted.
 *
 * That also fixes what MIXED was hiding: a receipt carrying BOTH cash and a
 * cheque used to fit only the MIXED type, so dropping MIXED without this
 * change would have made such receipts permanently unbankable. They now go in
 * a CASH deposit, where the cash is banked and matched to SAP exactly and the
 * cheque is listed as a record.
 *
 * Pure and free of React so the rule can be asserted directly — see
 * `depositFilter.test.ts`. The screen owns the list and the selection; this
 * owns only "does this receipt belong here?".
 */

/** The two shapes a deposit can take, as the picker offers them. */
export type DepositType = "cash" | "cheque";

/**
 * Tenders that can physically be deposited.
 *
 * Mirrors `PaymentMethodEntry.DEPOSITABLE_METHODS` on the server. UPI is
 * absent on purpose: it arrives electronically, so there is nothing to carry
 * and nothing to bank.
 */
export const DEPOSITABLE_METHODS = ["CASH", "CHEQUE"] as const;

export type DepositableMethod = (typeof DEPOSITABLE_METHODS)[number];

type MethodLike = { method: string };

/** The depositable tenders this receipt actually holds. */
export function tendersOf(methods: readonly MethodLike[] | undefined | null):
  Set<DepositableMethod> {
  const found = new Set<DepositableMethod>();
  for (const line of methods ?? []) {
    const method = String(line?.method || "").toUpperCase();
    if ((DEPOSITABLE_METHODS as readonly string[]).includes(method)) {
      found.add(method as DepositableMethod);
    }
  }
  return found;
}

/**
 * Does a receipt belong in a deposit of this type?
 *
 *   cash    money is being banked  -> any receipt holding CASH
 *   cheque  paper only             -> receipts holding CHEQUE and NO cash
 *
 * THE ASYMMETRY IS DELIBERATE. "Cash" asks only whether there is cash, so a
 * receipt carrying cash AND a cheque is offered: the server banks a receipt
 * whole ("a receipt is banked or it is not; it cannot be half-banked"), and
 * carrying its cheque along is harmless now that the cheque is recorded rather
 * than counted. "Cheque" excludes cash because the opposite is NOT harmless —
 * it would carry real cash into a deposit that banks none, and that cash would
 * silently never reach SAP.
 *
 * So every depositable receipt has exactly one home: with cash it goes in a
 * cash deposit, without cash in a cheque deposit. Nothing is strandable.
 *
 * A receipt with no depositable tender belongs nowhere — it should not have
 * reached the picker, and if it does it is not offered.
 *
 * With no type chosen yet, nothing is filtered: the screen locks the list
 * until the header is complete, and filtering an unreachable list would only
 * hide rows for a reason the user has not given yet.
 */
export function receiptMatchesDepositType(
  methods: readonly MethodLike[] | undefined | null,
  type: DepositType | null | undefined,
): boolean {
  const tenders = tendersOf(methods);
  if (tenders.size === 0) return false;
  if (!type) return true;

  switch (type) {
    case "cash":
      return tenders.has("CASH");
    case "cheque":
      return tenders.has("CHEQUE") && !tenders.has("CASH");
    default:
      return true;
  }
}

/**
 * The subset of `selectedIds` still valid after the type changes.
 *
 * Changing the type must not leave a receipt ticked but hidden: the list would
 * show "2 selected" with one row visible, and the deposit would be submitted
 * with a tender its type says it does not carry. Dropping them is the honest
 * move — the rows are gone from the screen, so the count should agree.
 */
export function selectionAfterTypeChange<T extends { id: number | string;
                                                     methods?: readonly MethodLike[] }>(
  receipts: readonly T[],
  selectedIds: readonly string[],
  type: DepositType | null | undefined,
): string[] {
  const stillValid = new Set(
    receipts
      .filter((receipt) => receiptMatchesDepositType(receipt.methods, type))
      .map((receipt) => String(receipt.id)),
  );
  return selectedIds.filter((id) => stillValid.has(id));
}

/**
 * The CASH in a set of receipts — the only money a deposit actually banks.
 *
 * Mirrors `services.cash_total_for_receipts` on the server, which is what
 * `collected_amount` is validated against. Cheques are excluded on purpose:
 * each was banked by its own receipt and is already in SAP, so adding it here
 * would show the employee a total matching neither the SAP document nor the
 * notes in their hand.
 *
 * The screen must not sum `total_amount` instead. On a receipt carrying both
 * tenders that figure includes the cheque, and the deposit would be submitted
 * claiming cash it does not hold — which the server now rejects.
 */
export function cashTotalOf(
  receipts: readonly { methods?: readonly (MethodLike & { amount?: unknown })[] }[],
): number {
  let total = 0;
  for (const receipt of receipts) {
    for (const entry of receipt.methods ?? []) {
      if (String(entry?.method || "").toUpperCase() !== "CASH") continue;
      const amount = Number(entry.amount ?? 0);
      // A malformed amount contributes nothing rather than turning the whole
      // total into NaN, which would render as "₹NaN" over the Deposit button.
      if (Number.isFinite(amount)) total += amount;
    }
  }
  return total;
}
