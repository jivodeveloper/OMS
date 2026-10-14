/**
 * Realisation per variety: value ÷ litres, with free litres in the divisor.
 *
 * THE CASE THIS EXISTS FOR is the giveaway. An order of 100 L sold plus 20 L
 * free earns the same money over 120 L, and the rate an approver is shown has
 * to say so — a realisation that quietly ignored free goods would make every
 * heavily-discounted order look as good as a clean one, which is the exact
 * judgement the figure is on the screen to support.
 *
 * Ported from the web client, so these assert what its own tests do.
 *
 * Runs on Node's built-in runner; the module is pure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lineLitres,
  varietyLabel,
  varietyRealisation,
  type VarietyLine,
} from "./varietyRealisation.ts";

const line = (over: Partial<VarietyLine>): VarietyLine => ({
  variety_type: "COMMODITY",
  total: 0,
  ...over,
});

describe("varietyLabel", () => {
  it("names the three the server sends", () => {
    assert.equal(varietyLabel("PREMIUM"), "Premium");
    assert.equal(varietyLabel("COMMODITY"), "Commodity");
    assert.equal(varietyLabel("OTHERS"), "Other");
  });

  it("treats anything it does not know as Other", () => {
    // A blank type is the common one: most SKUs have none in SAP, and the
    // server falls back to sub-group. Whatever arrives, it is never dropped.
    for (const raw of ["", null, undefined, "premium ", "SOMETHING_NEW"]) {
      const label = varietyLabel(raw);
      assert.ok(["Premium", "Commodity", "Other"].includes(label), String(raw));
    }
    assert.equal(varietyLabel("premium "), "Premium");
    assert.equal(varietyLabel("SOMETHING_NEW"), "Other");
  });
});

describe("lineLitres", () => {
  it("takes the server's own figure when it sent one", () => {
    // `total_ltrs` already includes the giveaway, so adding the schemes on
    // top of it would count the free litres twice.
    assert.equal(lineLitres(line({ total_ltrs: 120, ltrs: 100, schemes: [{ qty: 20 }] })), 120);
  });

  it("adds the giveaway itself when the server sent none", () => {
    assert.equal(lineLitres(line({ ltrs: 100, schemes: [{ qty: 20 }] })), 120);
    assert.equal(lineLitres(line({ ltrs: 100, schemes: [] })), 100);
  });

  it("survives the shapes an order line actually arrives in", () => {
    assert.equal(lineLitres(line({ ltrs: "100", schemes: [{ qty: "5" }] })), 105);
    assert.equal(lineLitres(line({ ltrs: null, schemes: null })), 0);
    assert.equal(lineLitres(line({})), 0);
  });
});

describe("varietyRealisation", () => {
  it("divides what a variety earns by every litre that leaves", () => {
    const [only] = varietyRealisation([
      line({ variety_type: "COMMODITY", total: 12000, total_ltrs: 120 }),
    ]);
    assert.equal(only.amount, 12000);
    assert.equal(only.litres, 120);
    assert.equal(only.perLitre, 100);
  });

  it("lets free litres dilute the rate", () => {
    // ₹12,000 over 100 sold litres is ₹120/L; give 20 away and the order
    // still earns ₹12,000, but now over 120 L — ₹100/L. That drop is the
    // number an approver is being asked to judge.
    const sold = varietyRealisation([line({ total: 12000, ltrs: 100 })])[0];
    const withFree = varietyRealisation([
      line({ total: 12000, ltrs: 100, schemes: [{ qty: 20 }] }),
    ])[0];

    assert.equal(sold.perLitre, 120);
    assert.equal(withFree.perLitre, 100);
    assert.ok(withFree.perLitre < sold.perLitre);
  });

  it("groups the lines of one variety together", () => {
    const [group] = varietyRealisation([
      line({ variety_type: "PREMIUM", total: 5000, ltrs: 50 }),
      line({ variety_type: "PREMIUM", total: 5000, ltrs: 50 }),
    ]);
    assert.equal(group.label, "Premium");
    assert.equal(group.amount, 10000);
    assert.equal(group.litres, 100);
    assert.equal(group.perLitre, 100);
  });

  it("ranks Premium, then Commodity, then Other", () => {
    const order = varietyRealisation([
      line({ variety_type: "OTHERS", total: 100, ltrs: 1 }),
      line({ variety_type: "COMMODITY", total: 100, ltrs: 1 }),
      line({ variety_type: "PREMIUM", total: 100, ltrs: 1 }),
    ]).map((entry) => entry.label);
    assert.deepEqual(order, ["Premium", "Commodity", "Other"]);
  });

  it("leaves out a variety with no litres rather than calling it zero", () => {
    // Dividing by nothing is not a rate of zero; a ₹0/L on the screen reads
    // as a catastrophic rate rather than as an absent one.
    const rows = varietyRealisation([
      line({ variety_type: "PREMIUM", total: 500, ltrs: 0 }),
      line({ variety_type: "COMMODITY", total: 1000, ltrs: 10 }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, "Commodity");
  });

  it("has nothing to say about an order with no lines", () => {
    assert.deepEqual(varietyRealisation([]), []);
  });
});
