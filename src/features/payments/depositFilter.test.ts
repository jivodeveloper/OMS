/**
 * The deposit type decides which receipts are on offer.
 *
 * This was ignored entirely: the type was collected, stored and sent to the
 * server, but the picker listed every depositable receipt whatever it said —
 * so "Cash" showed cheques, and an employee could tick one while holding an
 * envelope of notes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cashTotalOf,
  receiptMatchesDepositType,
  selectionAfterTypeChange,
  tendersOf,
} from "./depositFilter.ts";

const cash = [{ method: "CASH" }];
const cheque = [{ method: "CHEQUE" }];
const both = [{ method: "CASH" }, { method: "CHEQUE" }];
const upi = [{ method: "UPI" }];

describe("tendersOf", () => {
  it("reports only what can be deposited", () => {
    assert.deepEqual([...tendersOf(both)].sort(), ["CASH", "CHEQUE"]);
  });

  it("ignores UPI, which is never carried to a bank", () => {
    assert.equal(tendersOf(upi).size, 0);
  });

  it("is case-insensitive about the method", () => {
    assert.deepEqual([...tendersOf([{ method: "cash" }])], ["CASH"]);
  });

  it("survives a missing or empty method list", () => {
    assert.equal(tendersOf(undefined).size, 0);
    assert.equal(tendersOf([]).size, 0);
  });
});

describe("cash deposits", () => {
  it("offer cash receipts", () => {
    assert.equal(receiptMatchesDepositType(cash, "cash"), true);
  });

  it("do NOT offer cheque receipts", () => {
    assert.equal(receiptMatchesDepositType(cheque, "cash"), false);
  });

  it("DO offer a receipt that also carries a cheque", () => {
    // The server banks a receipt whole, and the cheque riding along costs
    // nothing: a deposit counts cash only, so the cheque is recorded rather
    // than added in. This is also the only home such a receipt has — before
    // MIXED was removed it fitted nowhere else.
    assert.equal(receiptMatchesDepositType(both, "cash"), true);
  });
});

describe("cheque deposits", () => {
  it("offer cheque receipts", () => {
    assert.equal(receiptMatchesDepositType(cheque, "cheque"), true);
  });

  it("do NOT offer cash receipts", () => {
    assert.equal(receiptMatchesDepositType(cash, "cheque"), false);
  });

  it("do NOT offer a receipt that also carries cash", () => {
    // THE ASYMMETRY. Unlike the cash case this one is not harmless: the
    // deposit banks no cash, so real notes would ride in and never reach SAP.
    assert.equal(receiptMatchesDepositType(both, "cheque"), false);
  });
});

describe("every depositable receipt has exactly one home", () => {
  it("so nothing is left unbankable once MIXED is gone", () => {
    for (const methods of [cash, cheque, both]) {
      const homes = (["cash", "cheque"] as const).filter((type) =>
        receiptMatchesDepositType(methods, type));
      assert.equal(homes.length, 1);
    }
  });
});

describe("what is never offered", () => {
  it("a receipt with nothing depositable on it", () => {
    for (const type of ["cash", "cheque", "mixed"] as const) {
      assert.equal(receiptMatchesDepositType(upi, type), false);
    }
  });

  it("...not even before a type is chosen", () => {
    assert.equal(receiptMatchesDepositType(upi, null), false);
  });
});

describe("before a type is chosen", () => {
  it("nothing is filtered out", () => {
    // The screen locks the list until the header is complete; hiding rows for
    // a reason the user has not given yet would just look broken.
    assert.equal(receiptMatchesDepositType(cash, null), true);
    assert.equal(receiptMatchesDepositType(both, undefined), true);
  });
});

describe("changing the type", () => {
  const receipts = [
    { id: 1, methods: cash },
    { id: 2, methods: cheque },
    { id: 3, methods: both },
  ];

  it("drops selections the new type no longer offers", () => {
    // THE BUG THIS PREVENTS: a receipt ticked under "Mixed" stays selected
    // after switching to "Cash", so the banner counts a row the list does not
    // show and the deposit is submitted with a tender it says it has not got.
    // Cash keeps the cash receipt AND the one carrying cash + cheque: both
    // bank cash, and the cheque on #3 is recorded rather than counted.
    assert.deepEqual(
      selectionAfterTypeChange(receipts, ["1", "2", "3"], "cash"),
      ["1", "3"],
    );
    // Cheque keeps only #2. #3 is dropped because banking it would carry real
    // cash into a deposit that posts none.
    assert.deepEqual(
      selectionAfterTypeChange(receipts, ["1", "2", "3"], "cheque"),
      ["2"],
    );
  });

  it("keeps an already-valid selection untouched", () => {
    assert.deepEqual(selectionAfterTypeChange(receipts, ["1"], "cash"), ["1"]);
  });

  it("copes with a selected id that is no longer in the list", () => {
    assert.deepEqual(selectionAfterTypeChange(receipts, ["99"], "cash"), []);
  });
});

describe("cashTotalOf — what the deposit actually banks", () => {
  const receipt = (methods: unknown[]) => ({ methods }) as never;

  it("sums cash and ignores the cheque beside it", () => {
    // THE FIGURE THIS PROTECTS. Summing total_amount here would claim
    // 70,000 of cash, and the server would reject the deposit for holding
    // only 50,000.
    assert.equal(
      cashTotalOf([receipt([
        { method: "CASH", amount: "50000.00" },
        { method: "CHEQUE", amount: "20000.00" },
      ])]),
      50000,
    );
  });

  it("adds up across receipts", () => {
    assert.equal(
      cashTotalOf([
        receipt([{ method: "CASH", amount: "100.50" }]),
        receipt([{ method: "CASH", amount: "99.50" }]),
      ]),
      200,
    );
  });

  it("is zero for a cheque-only selection, not undefined", () => {
    assert.equal(
      cashTotalOf([receipt([{ method: "CHEQUE", amount: "400.00" }])]), 0);
  });

  it("ignores UPI, which never reaches a deposit", () => {
    assert.equal(
      cashTotalOf([receipt([{ method: "UPI", amount: "999.00" }])]), 0);
  });

  it("is case-insensitive about the method", () => {
    assert.equal(cashTotalOf([receipt([{ method: "cash", amount: "5" }])]), 5);
  });

  it("treats an unparseable amount as zero rather than NaN", () => {
    // Otherwise the whole total becomes NaN and renders as "₹NaN".
    assert.equal(
      cashTotalOf([
        receipt([{ method: "CASH", amount: "oops" }]),
        receipt([{ method: "CASH", amount: "10" }]),
      ]),
      10,
    );
  });

  it("survives receipts with no methods at all", () => {
    assert.equal(cashTotalOf([receipt([]), {} as never]), 0);
    assert.equal(cashTotalOf([]), 0);
  });
});
