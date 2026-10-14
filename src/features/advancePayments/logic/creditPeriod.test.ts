/**
 * Bill or Advance, and the payee's credit period.
 *
 * BOTH ARE PORTED FROM THE WEB CLIENT verbatim
 * (`OMS-Frontend/src/pages/advancePayments/approvalData.ts`), so these assert
 * the same answers its own tests do. Two clients disagreeing about whether a
 * request is a bill or an advance would be two clients showing one approver
 * two different things about the same money.
 *
 * WHY `set` MATTERS. SAP gives a vendor with no agreed terms its default
 * group, "ADVANCE/CASH/0 DAYS". Reading that as a credit period would tell an
 * approver the vendor agreed to nothing — a fact nobody established — so it is
 * reported as not set instead.
 *
 * Runs on Node's built-in runner; the module is pure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { billOrAdvance, creditPeriod } from "./approvalData.ts";

/** Only `paymentAgainst` is read, so the rest of the form is not built. */
const form = (paymentAgainst: string) => ({ paymentAgainst }) as never;

describe("billOrAdvance", () => {
  it("calls a bill already received a Bill", () => {
    assert.equal(billOrAdvance(form("AGAINST_BILL")), "Bill");
  });

  it("calls money paid before the bill an Advance", () => {
    // Against a PO, and a bare advance, are the same thing to the reader:
    // it is going out before anything has been invoiced.
    assert.equal(billOrAdvance(form("AGAINST_PO")), "Advance");
    assert.equal(billOrAdvance(form("ADVANCE")), "Advance");
  });

  it("says nothing where it is neither", () => {
    // A ledger refund, an expense, "All" — forcing one of two words onto
    // these would be a classification nobody made.
    for (const other of ["AGAINST_LEDGER", "ALL", "OTHER", ""]) {
      assert.equal(billOrAdvance(form(other)), "", other);
    }
  });
});

describe("creditPeriod", () => {
  it("reads out the terms and the days", () => {
    assert.equal(
      creditPeriod({ terms: "NET-30", days: 30, set: true }),
      "NET-30 · 30 days credit",
    );
  });

  it("drops the day count when there is none to give", () => {
    // Terms that are real but carry no extra days: the name alone is honest,
    // "0 days credit" reads as a term somebody agreed to.
    assert.equal(creditPeriod({ terms: "IMMEDIATE", days: 0, set: true }), "IMMEDIATE");
  });

  it("will not pass SAP's default off as an agreed period", () => {
    assert.equal(
      creditPeriod({ terms: "ADVANCE/CASH/0 DAYS", days: 0, set: false }),
      "Not set in SAP",
    );
  });

  it("is empty when there are no terms at all", () => {
    // An employee, a payee not in SAP, or SAP unreachable — the server sends
    // null and the page shows no row rather than an empty one.
    assert.equal(creditPeriod(null), "");
    assert.equal(creditPeriod(undefined), "");
  });
});
