/**
 * The ported rules still behave as the web client's do.
 *
 * These modules were COPIED from `OMS-Frontend/src/pages/advancePayments/`
 * rather than rewritten, and this is what keeps the copy honest: the handful of
 * behaviours the whole feature turns on, asserted here with the same figures the
 * web's own tests use (AP 10256 is ₹2,50,000 with ₹1,00,000 paid, so ₹1,50,000
 * open). If a re-copy from the web changes any of them, this fails rather than
 * the app quietly asking for a different amount than the web would.
 *
 * Runs on Node's built-in runner with native type-stripping — the modules are
 * pure, and the one service import is a type.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OpenDocument } from "./constants.ts";
import {
  CASE_RULES,
  NO_TDS,
  PARTNER_CODE_PREFIX,
  allocationRows,
  allocationTotals,
  applyChange,
  calculatePayment,
  changeAllocation,
  EMPTY_FORM,
  expectedPeriodError,
  pastDateError,
  dueFirst,
  dueLabel,
  dueState,
  expenseNet,
  expenseTds,
  expenseTotal,
  lineGst,
  lineTaxable,
  newExpenseLine,
  resolveCase,
  validate,
  validateExpense,
  type ExpenseLineForm,
  type RequestForm,
} from "./rules.ts";
import { paidAmount, payeeOf, requestAmount } from "./approvalData.ts";
import { toApiRequest } from "./requestApi.ts";
import { ownerLabel, withCodePrefix } from "./sapMapping.ts";

const BILL_10256: OpenDocument = {
  id: "PCH-10256",
  number: "10256",
  date: "2026-08-04",
  partner: "VENDA000101",
  original: 250000,
  paid: 100000,
  open: 150000,
};
const BILL_10271: OpenDocument = {
  id: "PCH-10271",
  number: "10271",
  date: "2026-08-19",
  partner: "VENDA000101",
  original: 84000,
  paid: 0,
  open: 84000,
};

/** A vendor bill case with both bills picked. */
function twoBills(): RequestForm {
  let form = applyChange(EMPTY_FORM, { company: "OIL" });
  form = applyChange(form, { type: "VENDOR" });
  form = applyChange(form, { paymentAgainst: "AGAINST_BILL" });
  form = applyChange(form, { partner: "VENDA000101", partnerName: "ABC Technologies" });
  return applyChange(form, { selected: [BILL_10256, BILL_10271] });
}

describe("the ported Advance Payment rules", () => {
  it("takes a percentage of the OPEN amount, not the invoice total", () => {
    // Half of what is LEFT on a part-paid bill: ₹75,000, never ₹1,25,000.
    assert.equal(calculatePayment(BILL_10256, "PERCENT", "", "50").payment, 75000);
    assert.equal(calculatePayment(BILL_10256, "FIXED", "150000", "").payment, 150000);
    assert.equal(
      calculatePayment(BILL_10256, "FIXED", "150001", "").error,
      "Cannot exceed the open amount of ₹1,50,000.",
    );
  });

  it("gives every chosen document its own payment line, and totals them", () => {
    let form = twoBills();
    form = changeAllocation(form, "PCH-10256", { amount: "50000" });
    form = changeAllocation(form, "PCH-10271", { amount: "84000" });

    const totals = allocationTotals(allocationRows(form));
    assert.equal(totals.open, 234000);
    assert.equal(totals.payment, 134000);
    assert.equal(totals.complete, true);
    // And that total is what the server is asked for.
    assert.equal(toApiRequest(form).amount, "134000");
    assert.equal(toApiRequest(form).documents.length, 2);
    assert.equal(toApiRequest(form).documents[0].kind, "BILL");
  });

  it("offers each type only the Payment Against options its case table holds", () => {
    const optionsFor = (type: RequestForm["type"]) =>
      resolveCase({ ...EMPTY_FORM, type }).paymentAgainstOptions.map((o) => o.value);

    assert.deepEqual(optionsFor("VENDOR"), ["AGAINST_BILL", "AGAINST_PO"]);
    assert.deepEqual(optionsFor("EMPLOYEE_ADVANCE"), ["ADVANCE", "OTHER"]);
    assert.deepEqual(optionsFor("EMPLOYEE_IMPREST"), ["ADVANCE", "AGAINST_BILL", "OTHER"]);
    // A vendor advance is always against a document — a bare "Advance" is an
    // amount nobody can later match to anything.
    assert.equal("ADVANCE" in CASE_RULES.VENDOR, false);
  });

  it("draws a vendor from VENDA and an imprest account from ORGV", () => {
    assert.equal(PARTNER_CODE_PREFIX.SAP_VENDORS, "VENDA");
    assert.equal(PARTNER_CODE_PREFIX.SAP_IMPREST, "ORGV");

    // The prefix is matched on the CODE alone: SAP's supplier list holds both
    // kinds, and a vendor NAMED "ORGVALE LOGISTICS" is still a vendor.
    const rows = [
      { card_code: "VENDA000105", card_name: "ORGVALE LOGISTICS" },
      { card_code: "ORGV000901", card_name: "RAHUL SHARMA IMPREST" },
    ].map((row) => ({ ...row, gstin: "", currency: "INR", balance: "0", phone: "", email: "" }));

    assert.deepEqual(
      withCodePrefix(rows, "VENDA").map((row) => row.card_code),
      ["VENDA000105"],
    );
    assert.deepEqual(
      withCodePrefix(rows, "ORGV").map((row) => row.card_code),
      ["ORGV000901"],
    );
  });

  it("drops what a changed answer invalidates", () => {
    const form = twoBills();
    assert.equal(form.selected.length, 2);

    // Another company is another SAP database: the vendor and its bills go.
    const moved = applyChange(form, { company: "MART" });
    assert.equal(moved.partner, "");
    assert.deepEqual(moved.selected, []);
    assert.deepEqual(moved.allocations, {});
  });

  it("asks Employee Imprest for an amount AND the expected bill date", () => {
    // The form puts these two on ONE row, which only makes sense while the case
    // asks for exactly them: a plain amount (no document to calculate it from)
    // plus the date the imprest's bills are expected.
    const imprest = (paymentAgainst: RequestForm["paymentAgainst"]) =>
      resolveCase({ ...EMPTY_FORM, type: "EMPLOYEE_IMPREST", paymentAgainst });

    for (const against of ["ADVANCE", "OTHER"] as const) {
      const c = imprest(against);
      assert.equal(c.plainAmount, true, against);
      assert.equal(c.expectedBillDate, true, against);
      assert.equal(c.reference, null, against);
    }

    // Against Bill is paid from the bills themselves: no amount to type, and
    // no bill still to expect either — the bills are the expense.
    const bills = imprest("AGAINST_BILL");
    assert.equal(bills.reference, "VENDOR_BILL");
    assert.equal(bills.plainAmount, false);
    assert.equal(bills.expectedBillDate, false);
  });

  it("refuses a date the web form would not offer", () => {
    // The pickers carry the same bounds as the web's `min=` attributes, and
    // these are the messages behind them.
    assert.equal(pastDateError("Payment Date", "2026-09-25", "2026-09-26"),
      "Payment Date cannot be before today.");
    assert.equal(pastDateError("Payment Date", "2026-09-26", "2026-09-26"), null);
    // A period may start and end on one day, but never run backwards.
    assert.equal(expectedPeriodError("2026-10-01", "2026-09-30"),
      "Expected To Date cannot be before Expected From Date.");
    assert.equal(expectedPeriodError("2026-10-01", "2026-10-01"), null);
  });

  it("sends a payload the server's own validator accepts", () => {
    /*
     * The rules `advance_payment/services/requests.py::clean` enforces, checked
     * against what we actually send. A refused create is invisible from here —
     * the server just answers "The request could not be saved." — so the shape
     * is pinned in a test rather than found by a requester.
     */
    let form = twoBills();
    form = changeAllocation(form, "PCH-10256", { amount: "50000" });
    form = changeAllocation(form, "PCH-10271", { amount: "84000" });
    form = applyChange(form, {
      budget: "BackOff",
      budgetName: "Back Office",
      purpose: "RAW_MATERIAL",
      purposeLabel: "Raw Material Purchase",
      ownership: ownerLabel({
        employee_code: "JWPL0030",
        employee_name: "PRESHIT SINGH",
        role: 1,
        role_label: "HOD",
        designation: null,
      }),
      paymentDate: "2026-10-01",
      remarks: "Part settlement of two bills.",
    });

    const payload = toApiRequest(form);
    assert.equal(payload.company, "OIL");
    assert.equal(payload.request_type, "VENDOR");
    assert.equal(payload.payment_against, "AGAINST_BILL");
    // `_clean_routing` REQUIRES both, and checks the budget head against the
    // company's SAP cost centres: a request without them is refused outright.
    assert.equal(payload.budget_code, "BackOff");
    assert.equal(payload.purpose_code, "RAW_MATERIAL");
    // Sub Budget is no longer asked for at all, so it is not sent; the server
    // clears the column itself.
    assert.ok(!("sub_budget_code" in payload));
    assert.ok(Number(payload.amount) > 0);
    // `_OWNER_CODE` on the server is /\(([A-Za-z0-9]+)\)\s*$/ — an owner whose
    // label does not end in a bracketed code is stored as plain text and can
    // never be matched to the employee master.
    assert.match(payload.owner_label, /\(([A-Za-z0-9]+)\)\s*$/);

    for (const doc of payload.documents) {
      assert.equal(doc.kind, "BILL");
      // A BILL is paid by amount only — the server refuses PERCENT on one.
      assert.equal(doc.mode, "FIXED");
      assert.equal(doc.percentage, null);
      assert.ok(doc.sap_doc_entry > 0, "every line needs its SAP entry");
      assert.ok(Number(doc.open_amount) > 0, "nothing open cannot be paid");
      assert.ok(Number(doc.amount) > 0 && Number(doc.amount) <= Number(doc.open_amount));
    }
  });

  it("sends a PO percentage the server works out to the same figure", () => {
    // The server recomputes `open * percentage / 100` and refuses a line whose
    // amount differs by more than a paisa, so the two must agree exactly.
    const po: OpenDocument = {
      id: "POR-4501",
      number: "4501",
      date: "2026-07-22",
      partner: "VENDA000101",
      original: 500000,
      paid: 150000,
      open: 350000,
    };
    let form = applyChange(EMPTY_FORM, { company: "OIL" });
    form = applyChange(form, { type: "VENDOR" });
    form = applyChange(form, { paymentAgainst: "AGAINST_PO" });
    form = applyChange(form, { partner: "VENDA000101", partnerName: "ABC Technologies" });
    form = applyChange(form, { selected: [po] });
    form = changeAllocation(form, "POR-4501", { mode: "PERCENT", percentage: "25" });

    const [line] = toApiRequest(form).documents;
    assert.equal(line.kind, "PO");
    assert.equal(line.mode, "PERCENT");
    assert.equal(line.percentage, "25");
    assert.equal(Number(line.amount), 87500); // 25% of the 3,50,000 still open
  });

  it("names every visible field that is still empty", () => {
    const { missing } = validate(EMPTY_FORM, "2026-09-26");
    assert.deepEqual(missing, [
      "Company",
      "Type",
      // The Department (SAP's budget head) and what the money is for, in the
      // order `validate` names them on the web.
      "Department",
      "Payment Purpose",
      "Ownership",
      "Payment Date",
      "Remarks",
    ]);
  });

  it("asks for the Department and the Payment Purpose", () => {
    const { missing } = validate(EMPTY_FORM, "2026-09-26");
    assert.ok(missing.includes("Department"));
    assert.ok(missing.includes("Payment Purpose"));
  });

  it("clears the Department when the company changes, and keeps the purpose", () => {
    // `bpl`-style scoping applies to cost centres too — "BackOff" under OIL is
    // not the same cost centre as "BackOff" under MART, and may not exist at
    // all. Carrying the code across would post the money to the wrong place.
    // The PURPOSE is the Payment Desk's own list and means the same under every
    // company, so it survives.
    const form = applyChange(
      {
        ...EMPTY_FORM,
        company: "OIL",
        budget: "BackOff",
        budgetName: "Back Office",
        purpose: "RENT",
        purposeLabel: "Rent",
      },
      { company: "MART" },
    );
    assert.deepEqual([form.budget, form.budgetName], ["", ""]);
    assert.equal(form.purpose, "RENT");
  });

  it("nets a customer refund: credits less the invoices they owe", () => {
    // `_clean_documents` SIGNS a customer's ledger total the way SAP nets an
    // outgoing payment, and refuses a refund that does not come to more than
    // nothing. The app must compute the same figure, or the requester sees a
    // total the server will not accept.
    const item = (id: string, open: number, direction: "CREDIT" | "DEBIT"): OpenDocument => ({
      id,
      number: id,
      date: "2026-08-01",
      partner: "CUSTA000606",
      original: open,
      paid: 0,
      open,
      ledger: { object: 24, line: 0, direction },
    });
    let form = applyChange(EMPTY_FORM, { company: "OIL" });
    form = applyChange(form, { type: "CUSTOMER" });
    form = applyChange(form, { paymentAgainst: "AGAINST_LEDGER" });
    form = applyChange(form, { partner: "CUSTA000606", partnerName: "Acme Retail" });
    form = applyChange(form, {
      selected: [item("RCT-1", 50000, "CREDIT"), item("INV-9", 20000, "DEBIT")],
    });
    form = changeAllocation(form, "RCT-1", { amount: "50000" });
    form = changeAllocation(form, "INV-9", { amount: "20000" });

    const totals = allocationTotals(allocationRows(form));
    assert.equal(totals.payment, 30000);
    assert.equal(requestAmount(form), 30000);
  });
});

describe("due documents", () => {
  const doc = (id: string, dueDate?: string): OpenDocument => ({
    id, number: id, date: "2026-08-01", partner: "V", original: 100, paid: 0, open: 100, dueDate,
  });
  const TODAY = "2026-09-23";

  it("calls a document due on or after its due date", () => {
    assert.equal(dueState(doc("a", "2026-09-01"), TODAY), "OVERDUE");
    assert.equal(dueState(doc("b", TODAY), TODAY), "DUE_TODAY");
    assert.equal(dueState(doc("c", "2026-10-01"), TODAY), null);
    // No due date is not "due" — a PO without one is not overdue, it is silent.
    assert.equal(dueState(doc("d"), TODAY), null);
    assert.equal(dueLabel(doc("b", TODAY), TODAY), "Due today");
    assert.equal(dueLabel(doc("c", "2026-10-01"), TODAY), "");
  });

  it("puts due documents first, the longest overdue at the top, the rest in their order", () => {
    const docs = [doc("later", "2026-10-01"), doc("today", TODAY), doc("none"), doc("old", "2026-08-15")];
    assert.deepEqual(
      dueFirst(docs, (d) => d, TODAY).map((d) => d.id),
      ["old", "today", "later", "none"],
    );
  });
});

/* ------------------------------------------------------------------ *
 * Expense requests
 *
 * The web's own `expense.test.ts` figures, kept here for the same reason as
 * everything above: an Expense is the only request whose amount the client
 * works out from its lines, and a copy that rounded the taxable amount a
 * different way would ask SAP for a different figure than the web would.
 * ------------------------------------------------------------------ */

const TDS_RATES: Record<string, number> = { "C194-2": 2, "J194-10": 10 };
const rateOf = (code: string) => TDS_RATES[code] ?? null;

const expenseLine = (patch: Partial<ExpenseLineForm>): ExpenseLineForm => ({
  ...newExpenseLine(),
  ...patch,
});

/** An Expense as the form holds it: two lines, one without a G/L. */
function expenseForm(patch: Partial<RequestForm> = {}): RequestForm {
  return [
    { company: "OIL" as const, type: "EXPENSE" as const },
    {
      budget: "Factory",
      budgetName: "Factory",
      isElectricity: true,
      expenseLines: [
        expenseLine({ amount: "11800", glAccount: "5680011", glName: "ELECTRICITY EXPENSES" }),
        expenseLine({ amount: "3000.50", glUnknown: true, remarks: "Penalty, G/L to confirm" }),
      ],
    },
    patch,
  ].reduce<RequestForm>((form, next) => applyChange(form, next), EMPTY_FORM);
}

describe("an Expense request", () => {
  it("is not asked Payment Against, and starts with one empty line", () => {
    const form = applyChange(applyChange(EMPTY_FORM, { company: "OIL" }), { type: "EXPENSE" });
    // Provisional: the server makes it direct when the G/L accounts are.
    assert.equal(form.paymentAgainst, "INDIRECT_EXPENSE");
    assert.equal(form.expenseLines.length, 1);
    const c = resolveCase(form);
    assert.equal(c.expense, true);
    assert.equal(c.plainAmount, false);
    assert.equal(c.reference, null);
  });

  it("is complete without a payee, ownership, payment date, sub budget, month or remarks", () => {
    assert.deepEqual(validate(expenseForm(), "2026-10-08"), { missing: [], problems: [] });
  });

  it("needs each line's amount, and its G/L — or, not knowing it, what it is for", () => {
    const { missing, problems } = validate(
      expenseForm({
        expenseLines: [
          expenseLine({ amount: "0", glAccount: "5670001" }),
          expenseLine({ amount: "" }),
          expenseLine({ amount: "5", glUnknown: true }),
        ],
      }),
      "2026-10-08",
    );
    assert.ok(problems.includes("Line 1: enter an amount above zero."));
    assert.deepEqual(missing, [
      "Amount on line 2",
      "G/L account on line 2",
      "Remarks on line 3 (what it is for)",
    ]);
  });

  it("at Payment needs every line's G/L, a month and a sub budget", () => {
    assert.deepEqual(validateExpense(expenseForm(), { atPayment: true }).missing, [
      "Sub Budget",
      "Month",
      "G/L account on line 2",
    ]);
  });

  it("is worth its lines' amounts; the desk's GST backs the taxable amount out", () => {
    const form = expenseForm();
    assert.equal(expenseTotal(form.expenseLines), 14800.5);
    assert.equal(requestAmount(form), 14800.5);
    const taxed = expenseLine({ amount: "11800", gstCode: "CGST_SGST_18" });
    assert.equal(lineTaxable(taxed), 10000);
    assert.equal(lineGst(taxed), 1800);
    assert.equal(lineTaxable(expenseLine({ amount: "1049.99", gstCode: "IGST_5" })), 999.99);
  });

  it("deducts TDS on the taxable amount, to the rupee — the request's code, a line's own, or none", () => {
    const form = expenseForm({
      expenseTdsCode: "C194-2",
      expenseLines: [
        expenseLine({ amount: "11800", gstCode: "CGST_SGST_18", glAccount: "5680011" }),
        expenseLine({ amount: "2500", glAccount: "5670001", tdsOverride: "J194-10" }),
        expenseLine({ amount: "700", glAccount: "5670001", tdsOverride: NO_TDS }),
      ],
    });
    // 200 (2% of the taxable 10,000, not of 11,800) + 250 + 0
    assert.equal(expenseTds(form, rateOf), 450);
    assert.equal(expenseNet(form, rateOf), 15000 - 450);
  });

  it("sends the lines, and no purpose, sub budget or month of its own", () => {
    const input = toApiRequest(expenseForm({ payee: "Tester" }));
    assert.equal(input.request_type, "EXPENSE");
    assert.equal(input.partner_code, "");
    assert.equal(input.partner_name, "Tester");
    assert.equal(input.amount, "14800.5");
    assert.equal(input.budget_code, "Factory");
    assert.equal(input.purpose_code, "");
    assert.equal(input.sub_budget_code, "");
    assert.equal(input.effect_month, "");
    assert.equal(input.is_electricity, true);
    assert.deepEqual(
      (input.expense_lines ?? []).map((line) => [line.amount, line.gl_account, line.remarks]),
      [
        ["11800", "5680011", ""],
        ["3000.50", "", "Penalty, G/L to confirm"],
      ],
    );
  });

  it("pays the invoice values less the TDS the server worked out", () => {
    // What a read-back request carries: the server's own tds_amount per line.
    const form = expenseForm();
    form.expenseLines[0] = { ...form.expenseLines[0], tdsAmount: "236" };
    form.expenseLines[1] = { ...form.expenseLines[1], tdsAmount: "60" };
    assert.equal(requestAmount(form), 14800.5);
    assert.equal(paidAmount(form), 14800.5 - 296);
  });

  it("names its payee, who is not a SAP partner", () => {
    assert.equal(payeeOf(expenseForm({ payee: "Tester" })), "Tester");
  });
});
