/**
 * The footer must not lie about where you are.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activeTabFor } from "./bottomTab.ts";

describe("the reported bug", () => {
  it("lights the work-queue tab on Production Tracking, not Home", () => {
    // THE BUG. Production was in no list, so it fell through to "home": the
    // footer said dashboard while the user read production orders, and the
    // tab that took them there looked inactive.
    assert.equal(activeTabFor("/(main)/production/tracking"), "orders");
  });

  it("and on every other production screen", () => {
    for (const p of [
      "/(main)/production/tracking-details",
      "/(main)/production/tracking-progress",
    ]) {
      assert.equal(activeTabFor(p), "orders", p);
    }
  });

  it("and on BackDate, which had the same hole", () => {
    for (const p of [
      "/(main)/backdate/tracking",
      "/(main)/backdate/tracking-details",
      "/(main)/backdate/tracking-progress",
      "/(main)/backdate/edit-request",
    ]) {
      assert.equal(activeTabFor(p), "orders", p);
    }
  });
});

describe("home is lit by the dashboard and nothing else", () => {
  it("the dashboard itself", () => {
    assert.equal(activeTabFor("/(main)/dashboard"), "home");
  });

  it("but NOT the payments analytics screen, which is Reports", () => {
    // Its path also contains "dashboard"; lighting Home there would say the
    // user is on their home page while they read charts.
    assert.equal(activeTabFor("/(main)/payments/dashboard"), "reports");
    assert.equal(activeTabFor("/(main)/payments/dashboard/person"), "reports");
  });

  it("and NOT an unrecognised screen", () => {
    // NULL IS THE POINT. Defaulting to home is what made this wrong for every
    // section nobody remembered to list.
    for (const p of [
      "/(main)/settings",
      "/(main)/permissions",
      "/(main)/users/editUser",
      "/(auth)/login",
      "",
      null,
      undefined,
    ]) {
      assert.equal(activeTabFor(p), null, String(p));
    }
  });
});

describe("the work-queue tab", () => {
  it("covers orders and both approval desks", () => {
    for (const p of [
      "/(main)/orders/orderlist",
      "/(main)/orders/ordertracking",
      "/(main)/orders/orderdetails",
      "/(main)/approver/pending_approval",
      "/(main)/orders/auditorapproval",
    ]) {
      assert.equal(activeTabFor(p), "orders", p);
    }
  });

  it("covers payments, deposits and verification", () => {
    for (const p of [
      "/(main)/payments/payment-tracking",
      "/(main)/payments/deposit-tracking",
      "/(main)/payments/deposit-details",
      "/(main)/payments/verification",
      "/(main)/payments/tracking-details",
    ]) {
      assert.equal(activeTabFor(p), "orders", p);
    }
  });

  it("covers a shared approval screen, which belongs to the queue it came from", () => {
    assert.equal(activeTabFor("/(main)/approval/approval-details"), "orders");
  });
});

describe("the create tab", () => {
  it("wins over the section a form lives in", () => {
    // A create form sits inside its module's section, but the tab that opened
    // it is the "+".
    for (const p of [
      "/orders/create",
      "/(main)/payments/receive-payment?openMode=create",
      "/(main)/backdate/create",
      "/(main)/users/create",
    ]) {
      assert.equal(activeTabFor(p), "create", p);
    }
  });
});

describe("profile and reports", () => {
  it("profile", () => {
    assert.equal(activeTabFor("/(main)/profile"), "profile");
  });

  it("the sales daily report", () => {
    assert.equal(activeTabFor("/(main)/reports/daily"), "reports");
  });
});

describe("case and shape", () => {
  it("does not care about casing", () => {
    assert.equal(activeTabFor("/(MAIN)/Production/Tracking"), "orders");
  });

  it("needs the section to be a path segment, not a stray substring", () => {
    // "backdated" is not the BackDate module. Matching on the bare word would
    // light the tab for any screen whose name happened to contain it.
    assert.equal(activeTabFor("/(main)/orders/backdated-summary"), "orders");
    assert.equal(activeTabFor("/(main)/production"), null);
  });
});
