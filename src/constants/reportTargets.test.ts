/**
 * What the Reports tab offers, and to whom.
 *
 * THE BUG THIS EXISTS FOR. The tab resolved to ONE route — the first the user
 * could reach — so anybody holding the sales daily report could never open
 * anything else from it. The Payments & Expenses board is held almost
 * entirely by administrators, who hold the daily report too, so in practice
 * the board was unreachable from the tab for every single person who had it.
 *
 * `Expense_Dashboard` is READ ONLY and stands alone: it opens no request and
 * decides nothing, so none of the keys that raise or approve a payment admit
 * here, and holding it admits nowhere else. Both halves are asserted, because
 * a permission that quietly widens is the kind of mistake nobody sees.
 *
 * Runs on Node's built-in runner; `pages.ts` reaches `permissions.ts` through
 * the `@/` alias, which `scripts/testResolver.mjs` resolves.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessScreen, reportTargetsFor } from "./pages.ts";

const BOARD = "advance-payments/expense-dashboard";

/** A user holding exactly `keys`, with no role worth anything. */
function holder(...keys: string[]) {
  return {
    id: 1,
    username: "u",
    role: "user",
    roles: [],
    permissions: keys,
    extra_pages: [],
  } as never;
}

const keysOf = (user: unknown) => reportTargetsFor(user as never).map((t) => t.key);

describe("the Reports tab", () => {
  it("offers the board to somebody who holds only its key", () => {
    assert.deepEqual(keysOf(holder("Expense_Dashboard")), ["expenses"]);
  });

  it("offers every report a user can reach, not just the first", () => {
    // THE CASE THE OLD RESOLVER GOT WRONG. Holding the daily report as well
    // used to mean the board could never be opened from this tab.
    const both = keysOf(holder("Reports", "Expense_Dashboard"));
    assert.ok(both.includes("expenses"), "the board must still be offered");
    assert.ok(both.length > 1, "more than one report must be offered");
  });

  it("offers nothing to a user with no report of any kind", () => {
    // The tab then shows the permission dialog rather than navigating
    // somewhere the server would refuse.
    assert.deepEqual(keysOf(holder()), []);
    assert.deepEqual(keysOf(null), []);
  });

  it("keeps the board's key to itself", () => {
    // Raising, approving, dispatching and reading every request are four
    // different jobs, and none of them is "look at the whole company's
    // spending".
    for (const key of [
      "Advance_Payment",
      "Advance_Payment_Approval",
      "Advance_Payment_Dispatch",
      "Advance_Payment_View_All",
      "Payments_Create",
    ]) {
      assert.equal(canAccessScreen(BOARD, holder(key)), false, key);
    }
  });

  it("does not let the board's key open anything else", () => {
    const user = holder("Expense_Dashboard");
    for (const screen of [
      "advance-payments/tracking",
      "advance-payments/approval",
      "advance-payments/create",
      "advance-payments/dispatch",
      "payments/dashboard",
    ]) {
      assert.equal(canAccessScreen(screen, user), false, screen);
    }
    assert.equal(canAccessScreen(BOARD, user), true);
  });
});
