/**
 * The landing rule, asserted.
 *
 * These tests exist because the thing being encoded is a POLICY, not a
 * mechanism: "a verifier should not land on sales charts" is a decision
 * somebody made, and the only way it survives the next module being added is
 * if the ranking itself is written down as an assertion rather than implied by
 * the order of a list nobody reads.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MODULE_PRIORITY,
  hasModule,
  homeModuleFor,
  isSingleModuleUser,
  modulesFor,
  routeIsOnHomeModule,
  sidebarModulesFor,
  type CanReach,
} from "./moduleHome.ts";

/** A user who can reach exactly these screens. */
const reaching = (...screens: string[]): CanReach =>
  (screen: string) => screens.includes(screen);

const nobody: CanReach = () => false;
const everybody: CanReach = () => true;

/* Representative screens, one per module. */
const ORDERS = "orders/ordertracking";
const PAYMENTS = "payments/payment-tracking";
const VERIFY = "payments/verification";
const DEPOSITS = "payments/deposit-tracking";
const PRODUCTION = "production/tracking";
const BACKDATE = "backdate/tracking";

const keys = (can: CanReach) => modulesFor(can).map((m) => m.key);

describe("the priority order itself", () => {
  it("is Orders, Payments, Deposits, Production, BackDate", () => {
    // THE DECISION. Changing this list is changing where users land, so it is
    // asserted literally rather than derived from the table under test.
    assert.deepEqual(
      MODULE_PRIORITY.map((m) => m.key),
      ["orders", "payments", "deposits", "production", "backdate"],
    );
  });

  it("names every module exactly once", () => {
    const seen = new Set(MODULE_PRIORITY.map((m) => m.key));
    assert.equal(seen.size, MODULE_PRIORITY.length);
  });

  it("gives every module at least one screen to be held by", () => {
    // A module with no screens can never be reached, so it would rank first
    // for nobody and quietly never appear.
    for (const module of MODULE_PRIORITY) {
      assert.ok(module.screens.length > 0, module.key);
    }
  });
});

describe("hasModule", () => {
  const payments = MODULE_PRIORITY.find((m) => m.key === "payments")!;

  it("holds on ANY one of the module's screens", () => {
    assert.equal(hasModule(payments, reaching(VERIFY)), true);
  });

  it("does not hold on a screen of a different module", () => {
    assert.equal(hasModule(payments, reaching(ORDERS)), false);
  });

  it("does not hold on the SHARED tracking-details screen", () => {
    // Shared screens open for any payments-adjacent user, so counting one
    // would hand Payments to a deposits-only user.
    assert.equal(hasModule(payments, reaching("payments/tracking-details")), false);
  });
});

describe("a user holding one module", () => {
  it("lands on that module, whichever it is", () => {
    const cases: [string, string][] = [
      [ORDERS, "orders"],
      [PAYMENTS, "payments"],
      [DEPOSITS, "deposits"],
      [PRODUCTION, "production"],
      [BACKDATE, "backdate"],
    ];
    for (const [screen, key] of cases) {
      assert.equal(homeModuleFor(reaching(screen))?.key, key, screen);
    }
  });

  it("gets NO module entries in the drawer", () => {
    // Their home IS the app. An entry pointing back at the page they are on
    // is noise, and this is the behaviour the drawer filter depends on.
    assert.deepEqual(sidebarModulesFor(reaching(PRODUCTION)), []);
    assert.equal(isSingleModuleUser(reaching(PRODUCTION)), true);
  });
});

describe("a user holding several modules", () => {
  it("lands on the highest-ranked one", () => {
    assert.equal(homeModuleFor(reaching(BACKDATE, PAYMENTS))?.key, "payments");
    assert.equal(homeModuleFor(reaching(PRODUCTION, DEPOSITS))?.key, "deposits");
    assert.equal(homeModuleFor(reaching(BACKDATE, PRODUCTION))?.key, "production");
  });

  it("keeps Orders first when they hold it", () => {
    // Orders is the biggest surface; losing it would be a downgrade for
    // somebody who mainly works orders and holds one payments screen.
    assert.equal(
      homeModuleFor(reaching(ORDERS, PAYMENTS, DEPOSITS, BACKDATE))?.key,
      "orders",
    );
  });

  it("puts every OTHER module in the drawer, in priority order", () => {
    const can = reaching(BACKDATE, ORDERS, DEPOSITS);
    assert.equal(homeModuleFor(can)?.key, "orders");
    assert.deepEqual(
      sidebarModulesFor(can).map((m) => m.key),
      ["deposits", "backdate"],
    );
    assert.equal(isSingleModuleUser(can), false);
  });

  it("ranks an admin (every screen) on Orders, with the rest in the drawer", () => {
    assert.equal(homeModuleFor(everybody)?.key, "orders");
    assert.deepEqual(
      sidebarModulesFor(everybody).map((m) => m.key),
      ["payments", "deposits", "production", "backdate"],
    );
  });
});

describe("a user holding no module at all", () => {
  it("has no home module rather than a wrong one", () => {
    // Null is a real answer: a reports-only or admin-settings-only user keeps
    // whatever the dashboard showed before.
    assert.equal(homeModuleFor(nobody), null);
    assert.deepEqual(keys(nobody), []);
  });

  it("gets an empty drawer list, not a crash on the missing head", () => {
    assert.deepEqual(sidebarModulesFor(nobody), []);
    assert.equal(isSingleModuleUser(nobody), false);
  });

  it("and no route belongs to a home module they do not have", () => {
    assert.equal(routeIsOnHomeModule("orders/ordertracking", nobody), false);
  });
});

describe("deposits are their own module despite the shared route prefix", () => {
  it("a deposits-only user does NOT count as payments", () => {
    // THE BUG THIS PREVENTS: a prefix test alone hands every `payments/`
    // screen to Payments, so the banking team lands on a payments home and
    // Deposits owns nothing.
    assert.deepEqual(keys(reaching(DEPOSITS)), ["deposits"]);
  });

  it("a payments-only user does NOT count as deposits", () => {
    assert.deepEqual(keys(reaching(PAYMENTS)), ["payments"]);
  });

  it("a verifier counts as payments, not deposits", () => {
    // A verifier's whole day is payments; the deposits home would show them
    // banking figures they have no part in.
    assert.deepEqual(keys(reaching(VERIFY)), ["payments"]);
  });

  it("someone doing both gets payments as home and deposits in the drawer", () => {
    const can = reaching(PAYMENTS, DEPOSITS);
    assert.equal(homeModuleFor(can)?.key, "payments");
    assert.deepEqual(sidebarModulesFor(can).map((m) => m.key), ["deposits"]);
  });
});

describe("routeIsOnHomeModule — what the drawer hides", () => {
  it("hides every route of the home module, not just its entry points", () => {
    // Hiding a module from the drawer means hiding ALL of it; leaving the
    // detail screens listed would show half a module.
    const can = reaching(BACKDATE);
    for (const route of [
      "backdate/create",
      "backdate/tracking",
      "backdate/tracking-details",
      "backdate/edit",
    ]) {
      assert.equal(routeIsOnHomeModule(route, can), true, route);
    }
  });

  it("keeps routes of the OTHER modules the user holds", () => {
    const can = reaching(PAYMENTS, PRODUCTION);
    assert.equal(routeIsOnHomeModule("payments/receive-payment", can), true);
    assert.equal(routeIsOnHomeModule("production/tracking", can), false);
  });

  it("NEVER hides order screens, even though Orders ranks first", () => {
    // THE STRANDING THIS PREVENTS. Orders' home is the sales dashboard —
    // charts, no order list, no create link — so dropping the order entries
    // under it leaves an orders user with no way to reach their own orders.
    // Every other module's home lists its entries; this one does not.
    for (const route of [
      "orders/ordertracking",
      "orders/orderlist",
      "orders/create",
      "approver/pending_approval",
    ]) {
      assert.equal(routeIsOnHomeModule(route, reaching(ORDERS)), false, route);
      assert.equal(routeIsOnHomeModule(route, everybody), false, route);
    }
  });

  it("treats approver screens as part of Orders all the same", () => {
    // Ownership is still correct — it is only the hiding that is withheld.
    const orders = MODULE_PRIORITY.find((m) => m.key === "orders")!;
    assert.equal(orders.ownsRoute("approver/pending_approval"), true);
    assert.equal(orders.homeShowsEntries, false);
  });

  it("still hides a lower module's screens when IT is the home", () => {
    // An orders user does not lose the payments hiding: Orders being the home
    // just means nothing is hidden at all for them.
    assert.equal(
      routeIsOnHomeModule("payments/receive-payment", reaching(ORDERS, PAYMENTS)),
      false,
    );
    assert.equal(
      routeIsOnHomeModule("payments/receive-payment", reaching(PAYMENTS)),
      true,
    );
  });

  it("does not hide deposit screens from someone homed on payments", () => {
    const can = reaching(PAYMENTS, DEPOSITS);
    assert.equal(routeIsOnHomeModule("payments/receive-payment", can), true);
    assert.equal(routeIsOnHomeModule("payments/bank-deposit", can), false);
    assert.equal(routeIsOnHomeModule("payments/deposit-tracking", can), false);
    assert.equal(routeIsOnHomeModule("payments/deposit-details", can), false);
  });

  it("does not hide payment screens from someone homed on deposits", () => {
    const can = reaching(DEPOSITS);
    assert.equal(routeIsOnHomeModule("payments/deposit-tracking", can), true);
    assert.equal(routeIsOnHomeModule("payments/payment-tracking", can), false);
  });

  it("leaves non-module routes alone", () => {
    // Settings, profile, permissions and the like are nobody's module and
    // must stay in the drawer for everyone.
    for (const route of ["settings", "profile", "permissions", "dashboard"]) {
      assert.equal(routeIsOnHomeModule(route, everybody), false, route);
    }
  });
});

describe("ownsRoute covers the screens that grant the module", () => {
  it("so a module can never be held but unrecognised", () => {
    // If a screen counts as holding the module, that screen's drawer entry
    // must also be recognised as the module's — otherwise the home page and
    // the drawer entry for it appear side by side.
    for (const module of MODULE_PRIORITY) {
      for (const screen of module.screens) {
        assert.equal(module.ownsRoute(screen), true, `${module.key}: ${screen}`);
      }
    }
  });

  it("and no two modules claim the same route", () => {
    const routes = MODULE_PRIORITY.flatMap((m) => m.screens);
    for (const route of routes) {
      const owners = MODULE_PRIORITY.filter((m) => m.ownsRoute(route));
      assert.equal(owners.length, 1, `${route} claimed by ${owners.length}`);
    }
  });
});
