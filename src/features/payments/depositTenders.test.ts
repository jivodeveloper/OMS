/**
 * A mixed deposit is two accounting events, and the screen has to say so.
 *
 * The cash is posted by the deposit; the cheques were already in SAP under
 * their own receipts. An approver seeing a deposit for the full amount and one
 * SAP document covering part of it needs to be told where the rest went.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { depositTenders } from "./depositTenders.ts";

function line(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    receipt: 1,
    receipt_no: "RCP-OIL-0001",
    card_name: "A Customer",
    card_code: "C1",
    payment_date: "2026-09-01",
    receipt_posted_at: "2026-09-01T10:00:00Z",
    receipt_sap_doc_num: 8001,
    receipt_sap_doc_entry: 501,
    receipt_status: "POSTED",
    receipt_total: "100.00",
    receipt_remarks: "",
    collected_by: "",
    methods: [],
    amount: "100.00",
    ...over,
  };
}

/**
 * `deposit_amount` is the cash SAP was told about. It defaults to the cash in
 * the lines — a deposit banked in full — so the existing cases read as before;
 * pass it explicitly to model a shortfall.
 */
const deposit = (lines: any[], depositAmount?: string) => {
  const cash = lines.reduce(
    (sum, line) =>
      sum +
      (line.methods ?? []).reduce(
        (inner: number, m: any) =>
          inner + (m.method === "CASH" ? Number(m.amount) || 0 : 0),
        0,
      ),
    0,
  );
  return {
    lines,
    deposit_amount: depositAmount ?? String(cash),
  } as never;
};

describe("a cash-only deposit", () => {
  it("has cash, no cheques, and is not mixed", () => {
    const t = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "CASH", amount: "600.00" }] }),
    ]));
    assert.equal(t.cashTotal, 600);
    assert.equal(t.chequeTotal, 0);
    assert.deepEqual(t.cheques, []);
    assert.equal(t.isMixed, false);
    assert.equal(t.isChequeOnly, false);
  });
});

describe("a cheque-only deposit", () => {
  it("posts nothing of its own, so it is flagged as such", () => {
    const t = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "CHEQUE", amount: "400.00",
                         cheque_number: "112233", bank_name: "SBI" }] }),
    ]));
    assert.equal(t.cashTotal, 0);
    assert.equal(t.chequeTotal, 400);
    assert.equal(t.isChequeOnly, true);
    assert.equal(t.isMixed, false);
  });
});

describe("a mixed deposit — the case this exists for", () => {
  const t = depositTenders(deposit([
    line({
      receipt_no: "RCP-OIL-0001",
      receipt_sap_doc_num: 8001,
      methods: [
        { id: 1, method: "CASH", amount: "600.00" },
        { id: 2, method: "CHEQUE", amount: "400.00",
          cheque_number: "112233", bank_name: "SBI" },
      ],
    }),
  ]));

  it("splits the two tenders", () => {
    assert.equal(t.cashTotal, 600);
    assert.equal(t.chequeTotal, 400);
    assert.equal(t.isMixed, true);
  });

  it("says WHERE the cheque is recorded — its receipt, not the deposit", () => {
    assert.equal(t.cheques.length, 1);
    assert.equal(t.cheques[0].receiptNo, "RCP-OIL-0001");
    assert.equal(t.cheques[0].sapDocNum, 8001);
  });

  it("carries the cheque's own identity for matching the paper", () => {
    assert.equal(t.cheques[0].chequeNumber, "112233");
    assert.equal(t.cheques[0].payerBank, "SBI");
    assert.equal(t.cheques[0].amount, 400);
  });
});

describe("several cheques across several receipts", () => {
  it("accounts for each one separately", () => {
    const t = depositTenders(deposit([
      line({ receipt_no: "RCP-1", receipt_sap_doc_num: 9001,
             methods: [{ id: 1, method: "CHEQUE", amount: "100.00",
                         cheque_number: "111", bank_name: "SBI" }] }),
      line({ receipt_no: "RCP-2", receipt_sap_doc_num: 9002,
             methods: [{ id: 2, method: "CHEQUE", amount: "250.00",
                         cheque_number: "222", bank_name: "HDFC" }] }),
      line({ receipt_no: "RCP-3", receipt_sap_doc_num: 9003,
             methods: [{ id: 3, method: "CASH", amount: "50.00" }] }),
    ]));

    assert.equal(t.chequeTotal, 350);
    assert.equal(t.cashTotal, 50);
    assert.deepEqual(t.cheques.map((c) => c.receiptNo), ["RCP-1", "RCP-2"]);
    assert.deepEqual(t.cheques.map((c) => c.sapDocNum), [9001, 9002]);
  });
});

describe("a SHORT deposit — the AP team spent some of the cash", () => {
  // ₹600 collected in cash, ₹420 banked. SAP holds 420.
  const t = depositTenders(deposit([
    line({ methods: [{ id: 1, method: "CASH", amount: "600.00" }] }),
  ], "420.00"));

  it("reports what SAP holds, not what was collected", () => {
    assert.equal(t.cashTotal, 420);
  });

  it("reports the gap so the screen can explain it", () => {
    assert.equal(t.cashShortfall, 180);
  });

  it("a full deposit has no shortfall", () => {
    const full = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "CASH", amount: "600.00" }] }),
    ]));
    assert.equal(full.cashTotal, 600);
    assert.equal(full.cashShortfall, 0);
  });

  it("all the cash spent means SAP holds nothing", () => {
    const none = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "CASH", amount: "600.00" }] }),
    ], "0"));
    assert.equal(none.cashTotal, 0);
    assert.equal(none.isChequeOnly, false);
  });

  it("the cheque beside it is untouched by the shortfall", () => {
    // The cheque was banked by its own receipt; a cash shortfall cannot
    // reduce it and must not be netted against it.
    const mixed = depositTenders(deposit([
      line({ methods: [
        { id: 1, method: "CASH", amount: "600.00" },
        { id: 2, method: "CHEQUE", amount: "400.00", cheque_number: "1",
          bank_name: "SBI" },
      ] }),
    ], "420.00"));
    assert.equal(mixed.cashTotal, 420);
    assert.equal(mixed.chequeTotal, 400);
    assert.equal(mixed.cashShortfall, 180);
  });
});

describe("edges", () => {
  it("says 'not yet posted' rather than inventing a document number", () => {
    // A deposit CAN be raised over a receipt still awaiting SAP.
    const t = depositTenders(deposit([
      line({ receipt_sap_doc_num: null, receipt_posted_at: null,
             methods: [{ id: 1, method: "CHEQUE", amount: "100.00",
                         cheque_number: "333" }] }),
    ]));
    assert.equal(t.cheques[0].sapDocNum, null);
    assert.equal(t.cheques[0].postedAt, null);
  });

  it("ignores UPI, which never reaches a deposit", () => {
    const t = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "UPI", amount: "999.00" }] }),
    ]));
    assert.equal(t.cashTotal, 0);
    assert.equal(t.chequeTotal, 0);
    assert.deepEqual(t.cheques, []);
  });

  it("survives a deposit with no lines at all", () => {
    const t = depositTenders(deposit([]));
    assert.equal(t.cashTotal, 0);
    assert.equal(t.isMixed, false);
    assert.equal(t.isChequeOnly, false);
  });

  it("survives a null deposit", () => {
    assert.equal(depositTenders(null).cashTotal, 0);
    assert.deepEqual(depositTenders(undefined).cheques, []);
  });

  it("falls back to the lines when deposit_amount is absent", () => {
    // An older cached payload predating the field. A full deposit is the safe
    // reading — better than showing zero cash on a deposit that banked some.
    const t = depositTenders({
      lines: [line({ methods: [{ id: 1, method: "CASH", amount: "600.00" }] })],
    } as never);
    assert.equal(t.cashTotal, 600);
    assert.equal(t.cashShortfall, 0);
  });

  it("treats an unparseable amount as zero rather than NaN", () => {
    const t = depositTenders(deposit([
      line({ methods: [{ id: 1, method: "CASH", amount: "oops" }] }),
    ]));
    assert.equal(t.cashTotal, 0);
  });
});
