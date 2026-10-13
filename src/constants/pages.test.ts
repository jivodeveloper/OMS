/**
 * Everyone the server sends notifications to can reach the inbox.
 *
 * THE BUG THIS EXISTS FOR. `canAccessScreen("notifications", …)` granted the
 * inbox on the four PAYMENT keys and on four order roles, and on nothing else.
 * The notification framework, meanwhile, delivers for six modules. So a user
 * whose only module was Advance Payments or Credit Limit was sent
 * notifications by the server — five events per payment request
 * (`advance_payment/services/notify.py`) — and shown nowhere at all to read
 * them: no bell in the header, no Notifications row in the drawer, and the
 * inbox screen itself refusing to render if they ever reached it.
 *
 * It is asserted per module rather than over a list, because the failure is
 * silent: nothing throws, a screen simply is not offered, and the only symptom
 * is a user saying they never hear about their own requests.
 *
 * Runs on Node's built-in runner. `pages.ts` reaches `permissions.ts` through
 * the `@/` alias, which `scripts/testResolver.mjs` resolves.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessScreen } from "./pages.ts";

/** A user holding exactly `keys` and no role worth anything. */
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

describe("the notification inbox is reachable by everyone who is notified", () => {
  // One case per module that `notifications/` delivers for. The key names are
  // the backend registry's own, as `constants/permissions.ts` spells them.
  const MODULES: [string, string][] = [
    ["payments", "Payments_Create"],
    ["payments approval", "Payments_Approve"],
    ["deposits", "Deposit_Create"],
    ["deposits approval", "Deposit_Approve"],
    ["backdate", "BackDate"],
    ["backdate approval", "BackDate_Approval"],
    ["production", "Production_Order"],
    ["production approval", "Production_Order_Approval"],
    ["credit limit", "Credit_Limit"],
    ["credit limit approval", "Credit_Limit_Approval"],
    ["payment requests", "Advance_Payment"],
    ["payment request approval", "Advance_Payment_Approval"],
    ["payment request dispatch", "Advance_Payment_Dispatch"],
    ["payment requests, read only", "Advance_Payment_View_All"],
  ];

  for (const [what, key] of MODULES) {
    it(`opens for a user whose only module is ${what}`, () => {
      assert.equal(
        canAccessScreen("notifications", holder(key)),
        true,
        `${key} is notified by the server but could not reach the inbox`,
      );
    });
  }

  it("still opens for the order roles that never held a key", () => {
    // These predate the key registry and are granted by role alone.
    for (const role of ["manager", "billing", "approver", "auditor"]) {
      const user = { id: 1, username: "u", role, roles: [] } as never;
      assert.equal(canAccessScreen("notifications", user), true, role);
    }
  });

  it("does not open for a user with no module and no role", () => {
    // The grant is still a grant: it widened to every notified module, not to
    // everybody.
    assert.equal(canAccessScreen("notifications", holder()), false);
    assert.equal(canAccessScreen("notifications", null), false);
  });
});
