/**
 * Which module's home page a user lands on.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A TABLE AND NOT ANOTHER `isXOnlyUser`
 * ─────────────────────────────────────────────────────────────────────────
 * The landing used to be a two-way branch: `isPaymentsOnlyUser` asked "can
 * they reach ANY orders screen?" and, if not, sent them to the payments home.
 * That answered one question — a verifier should not land on a wall of empty
 * sales charts — and could not answer any other. A third module had nowhere
 * to go: Production and BackDate users landed on the sales dashboard, which is
 * the same failure the payments branch was written to fix.
 *
 * It was also elimination, not priority. Orders always won, so somebody whose
 * actual job is payments but who holds one orders screen never saw a payments
 * home.
 *
 * This is the whole rule, in one ordered list. Adding a module is one entry.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RULE
 * ─────────────────────────────────────────────────────────────────────────
 *   home module = the FIRST module in this list the user can reach
 *   drawer      = every OTHER module they can reach
 *
 * A user holding ONE module gets that module's home and no module entries in
 * the drawer — the home IS the app for them. A user holding several gets the
 * highest-ranked one as their home and the rest to navigate to.
 *
 * A module is "reachable" when the user can open ANY of its screens. That is
 * screen-based rather than key-based on purpose: `canAccessScreen` already
 * folds together registry keys, per-user page grants, roles and admin, and a
 * second implementation of that would drift from it.
 *
 * Pure — it takes a `can(screen)` predicate rather than a User — so the order
 * can be asserted directly. See `moduleHome.test.ts`.
 */

/** Every module that owns a home page, in the order they were prioritised. */
export type ModuleKey =
  | "orders"
  | "payments"
  | "deposits"
  | "production"
  | "backdate";

/**
 * Deposit screens, which share the `payments/` route prefix.
 *
 * Banking is its own module with its own home, so a prefix test alone would
 * hand every deposit screen to Payments and leave Deposits owning nothing.
 */
const DEPOSIT_ROUTES = new Set([
  "payments/bank-deposit",
  "payments/deposit-tracking",
  "payments/deposit-details",
]);

export interface ModuleDef {
  key: ModuleKey;
  /** What the module is called on screen. */
  label: string;
  /**
   * Any one of these screens means the user has this module.
   *
   * Listed rather than derived from a permission key because several screens
   * are shared (`payments/tracking-details` opens for any payments action) and
   * a shared screen must not make a module count as held.
   */
  screens: string[];
  /**
   * Does this drawer route belong to the module?
   *
   * Separate from `screens`, which decides ACCESS. This decides OWNERSHIP, and
   * must cover every route of the module rather than just the entry points —
   * hiding a module from the drawer means hiding all of it.
   */
  ownsRoute: (route: string) => boolean;
  /**
   * Does this module's home page LIST its own entries and link to them?
   *
   * Only then may the drawer drop the module: hiding entries is safe when the
   * home is the module — its recent list, its counts, its create button — and
   * strands the user when it is not.
   *
   * Orders is the exception. It ranks first, but its home is the SALES
   * DASHBOARD: charts and totals, no order list, no create link. Hiding the
   * order screens under it would leave an orders user with no way to reach
   * their own orders at all.
   */
  homeShowsEntries: boolean;
}

/**
 * THE PRIORITY ORDER.
 *
 * Orders first because it is the largest module and most users who hold it
 * hold it as their main job. Deposits sits below Payments because banking is
 * the step AFTER collecting, and a user who does both records more often than
 * they bank — the same reasoning the bottom tab bar already uses. Production
 * and BackDate are narrow, single-purpose modules and rank last.
 *
 * To re-rank a module, move its entry. To add one, add an entry.
 */
export const MODULE_PRIORITY: ModuleDef[] = [
  {
    key: "orders",
    label: "Orders",
    // The four order screens a user can land on, matching ORDERS_FALLBACKS.
    screens: [
      "orders/ordertracking",
      "orders/orderlist",
      "approver/pending_approval",
      "orders/auditorapproval",
    ],
    ownsRoute: (route: string) =>
      route.startsWith("orders/") || route.startsWith("approver/"),
    // The sales dashboard — see `homeShowsEntries`.
    homeShowsEntries: false,
  },
  {
    key: "payments",
    label: "Payments",
    // Recording and verifying. NOT the shared tracking-details screens, which
    // a deposits-only user can also open.
    screens: [
      "payments/receive-payment",
      "payments/payment-tracking",
      "payments/verification",
    ],
    ownsRoute: (route: string) =>
      route.startsWith("payments/") && !DEPOSIT_ROUTES.has(route),
    homeShowsEntries: true,
  },
  {
    key: "deposits",
    label: "Deposits",
    screens: ["payments/bank-deposit", "payments/deposit-tracking"],
    ownsRoute: (route: string) => DEPOSIT_ROUTES.has(route),
    homeShowsEntries: true,
  },
  {
    key: "production",
    label: "Production",
    screens: ["production/tracking"],
    ownsRoute: (route: string) => route.startsWith("production/"),
    homeShowsEntries: true,
  },
  {
    key: "backdate",
    label: "BackDate",
    screens: ["backdate/create", "backdate/tracking"],
    ownsRoute: (route: string) => route.startsWith("backdate/"),
    homeShowsEntries: true,
  },
];

/** A predicate over screen names — `canAccessScreen(screen, user)`, curried. */
export type CanReach = (screen: string) => boolean;

/** True when the user can open any screen of this module. */
export function hasModule(module: ModuleDef, can: CanReach): boolean {
  return module.screens.some(can);
}

/** Every module the user holds, in priority order. */
export function modulesFor(can: CanReach): ModuleDef[] {
  return MODULE_PRIORITY.filter((module) => hasModule(module, can));
}

/**
 * The module whose home page this user lands on, or null when they hold none.
 *
 * Null is a real answer, not a failure: an admin-only or reports-only user has
 * no module home, and the caller falls back to what it showed before.
 */
export function homeModuleFor(can: CanReach): ModuleDef | null {
  return modulesFor(can)[0] ?? null;
}

/**
 * The modules that belong in the drawer: everything EXCEPT the one being shown
 * as the home page.
 *
 * Empty for a single-module user, which is the point.
 */
export function sidebarModulesFor(can: CanReach): ModuleDef[] {
  const [home, ...rest] = modulesFor(can);
  return home ? rest : [];
}

/** True when the user holds exactly one module. */
export function isSingleModuleUser(can: CanReach): boolean {
  return modulesFor(can).length === 1;
}

/**
 * True when this drawer route belongs to the module the user is homed on AND
 * that home page actually lists the module's entries.
 *
 * The drawer hides those: a single-module user has no module entries at all
 * (their home IS the app), and a multi-module user sees only the modules they
 * are NOT already looking at. An entry pointing back at the screen you are on
 * is noise.
 *
 * The `homeShowsEntries` half is what keeps Orders in the drawer — see the
 * field's own note. Without it, ranking Orders first would hide every order
 * screen behind a sales dashboard that links to none of them.
 */
export function routeIsOnHomeModule(route: string, can: CanReach): boolean {
  const home = homeModuleFor(can);
  return home ? home.homeShowsEntries && home.ownsRoute(route) : false;
}
