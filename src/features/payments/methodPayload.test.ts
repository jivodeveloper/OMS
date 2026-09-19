/**
 * The receiving account reaches the API, and never gets confused with the payer's bank.
 *
 * Two things are being protected here.
 *
 * FIRST, that the account the collector picked is actually SENT. A picker that
 * only decorates the screen is worse than none: it asks a person to make a
 * decision and then quietly discards it, and the money posts wherever the old
 * admin mapping happens to point.
 *
 * SECOND, that a CHEQUE's two banks stay apart. `bank_name` is the bank the
 * customer's cheque is drawn on; `account_key` is the account of ours the money
 * lands in. They look alike on screen and merging them is an easy mistake to
 * make — one that would surface days later as money in the wrong G/L.
 *
 * Runs on Node's built-in test runner with native type-stripping; the module
 * is pure and imports only a type, so nothing is installed or transformed.
 *
 * It lives in `src/`, NOT under `app/`: Expo Router bundles every file under
 * `app/` into the native build, and a test importing `node:assert` there
 * breaks the Android bundle outright.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountKindFor,
  buildMethodPayload,
  methodChangePatch,
} from "./methodPayload.ts";
import type { PaymentMethodEntry } from "@/app/(main)/payments/_lib/types";

function entry(over: Partial<PaymentMethodEntry> = {}): PaymentMethodEntry {
  return {
    id: "m1",
    method: "cash",
    amount: "50000",
    noteRows: [],
    notesExpanded: false,
    chequeNumber: "",
    bankName: "",
    chequeDate: "",
    reference: "",
    attachments: [],
    accountKey: "",
    ...over,
  } as PaymentMethodEntry;
}

describe("CASH", () => {
  it("sends the chosen cash account as account_key", () => {
    const line = buildMethodPayload(
      entry({ method: "cash", accountKey: "1105001" }),
    );
    assert.equal(line.method, "CASH");
    assert.equal(line.account_key, "1105001");
  });

  it("still sends the denomination breakdown", () => {
    const line = buildMethodPayload(
      entry({
        method: "cash",
        accountKey: "1105001",
        noteRows: [
          { id: "n1", denomination: 500, quantity: "20" },
          { id: "n2", denomination: 200, quantity: "10" },
        ],
      }),
    );
    assert.deepEqual(line.denominations, [
      { denomination: 500, quantity: 20 },
      { denomination: 200, quantity: 10 },
    ]);
    assert.equal(line.account_key, "1105001");
  });

  it("drops empty denomination rows without losing the account", () => {
    const line = buildMethodPayload(
      entry({
        method: "cash",
        accountKey: "1105003",
        noteRows: [
          { id: "n1", denomination: 500, quantity: "0" },
          { id: "n2", denomination: null, quantity: "5" },
        ],
      }),
    );
    assert.deepEqual(line.denominations, []);
    assert.equal(line.account_key, "1105003");
  });

  it("uses the CASH account list", () => {
    assert.equal(accountKindFor("cash"), "CASH");
  });
});

describe("UPI", () => {
  it("sends the chosen bank account as account_key", () => {
    const line = buildMethodPayload(
      entry({ method: "upi", accountKey: "HDF:1104201", reference: "UTR123" }),
    );
    assert.equal(line.method, "UPI");
    assert.equal(line.account_key, "HDF:1104201");
    assert.equal(line.upi_reference, "UTR123");
  });

  it("sends the account even with no payer reference to hand", () => {
    // The UTR is optional; the receiving account is not.
    const line = buildMethodPayload(
      entry({ method: "upi", accountKey: "INB:1104106", reference: "" }),
    );
    assert.equal(line.account_key, "INB:1104106");
    assert.equal(line.upi_reference, "");
  });

  it("uses the BANK account list", () => {
    assert.equal(accountKindFor("upi"), "BANK");
  });
});

describe("CHEQUE — two banks, kept apart", () => {
  it("sends the customer's bank AND our receiving account, separately", () => {
    // THE CROSS-TEST. Customer's cheque is drawn on SBI; we bank it into HDFC.
    const line = buildMethodPayload(
      entry({
        method: "cheque",
        bankName: "SBI",
        chequeNumber: "CHQ123456",
        chequeDate: "2026-09-18",
        accountKey: "HDF:1104201",
      }),
    );

    // Ours.
    assert.equal(line.account_key, "HDF:1104201");
    // Theirs, untouched.
    assert.equal(line.bank_name, "SBI");
    // ...and they are genuinely different values, not one copied into both.
    assert.notEqual(line.account_key, line.bank_name);
    assert.equal(line.cheque_number, "CHQ123456");
    assert.equal(line.cheque_date, "2026-09-18");
  });

  it("does not derive the receiving account from the customer's bank", () => {
    // Naming the customer's bank must leave our account empty — the collector
    // still has to say where it was banked.
    const line = buildMethodPayload(
      entry({ method: "cheque", bankName: "SBI", accountKey: "" }),
    );
    assert.equal(line.bank_name, "SBI");
    assert.equal(line.account_key, "");
  });

  it("does not put our account into the customer's bank field", () => {
    const line = buildMethodPayload(
      entry({ method: "cheque", bankName: "", accountKey: "HDF:1104201" }),
    );
    assert.equal(line.bank_name, "");
    assert.equal(line.account_key, "HDF:1104201");
  });

  it("uses the BANK account list, the same one UPI uses", () => {
    // SAP draws no distinction and the same house bank receives both.
    assert.equal(accountKindFor("cheque"), "BANK");
    assert.equal(accountKindFor("cheque"), accountKindFor("upi"));
  });
});

describe("several lines keep their own accounts", () => {
  it("does not let one line's account overwrite another's", () => {
    const lines = [
      entry({ id: "m1", method: "upi", accountKey: "HDF:1104201" }),
      entry({ id: "m2", method: "cash", accountKey: "1105001" }),
    ].map(buildMethodPayload);

    assert.equal(lines[0].method, "UPI");
    assert.equal(lines[0].account_key, "HDF:1104201");
    assert.equal(lines[1].method, "CASH");
    assert.equal(lines[1].account_key, "1105001");
    assert.notEqual(lines[0].account_key, lines[1].account_key);
  });

  it("keeps a cash line's drawer out of a bank line, and vice versa", () => {
    const lines = [
      entry({ id: "m1", method: "cash", accountKey: "1105001" }),
      entry({ id: "m2", method: "cheque", bankName: "SBI", accountKey: "INB:1104106" }),
    ].map(buildMethodPayload);

    assert.equal(lines[0].account_key, "1105001");
    assert.equal(lines[1].account_key, "INB:1104106");
    assert.equal(lines[1].bank_name, "SBI");
  });
});

describe("changing method", () => {
  it("clears the account, because it belongs to the old method", () => {
    // THE BUG THIS PREVENTS: picking an HDFC bank account under UPI and then
    // switching to CASH would otherwise submit CASH with a bank account_key.
    const patch = methodChangePatch("upi", "cash");
    assert.equal(patch.method, "cash");
    assert.equal(patch.accountKey, "");
  });

  it("clears it in the other direction too", () => {
    const patch = methodChangePatch("cash", "cheque");
    assert.equal(patch.method, "cheque");
    assert.equal(patch.accountKey, "");
  });

  it("keeps the account when the method has not actually changed", () => {
    // Re-selecting the same entry in the dropdown is not a change, and must
    // not silently discard a choice already made.
    const patch = methodChangePatch("upi", "upi");
    assert.equal(patch.method, "upi");
    assert.equal("accountKey" in patch, false);
  });

  it("does not move between the two bank methods' lists", () => {
    // UPI and CHEQUE share a list, but the key is still cleared: the rule is
    // "a method change clears it", and a narrower rule would be one more thing
    // to get wrong for no benefit.
    const patch = methodChangePatch("upi", "cheque");
    assert.equal(patch.accountKey, "");
  });
});

describe("backward compatibility", () => {
  it("still produces a valid line when no account was chosen", () => {
    // The server accepts a keyless line from builds released before this
    // picker and falls back to the old admin mapping. The client must not
    // crash or invent a key; the UI is what insists on a choice.
    const line = buildMethodPayload(entry({ method: "upi", accountKey: "" }));
    assert.equal(line.account_key, "");
    assert.equal(line.method, "UPI");
    assert.equal(line.amount, "50000");
  });

  it("normalises the amount the way the API expects", () => {
    assert.equal(buildMethodPayload(entry({ amount: "" })).amount, "0");
    assert.equal(buildMethodPayload(entry({ amount: "1234.50" })).amount, "1234.5");
  });
});
