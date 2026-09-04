import type { User } from "@/src/services/auth.service";
import {
  can,
  canAny,
  isAdmin,
  permissionKeysOf,
  rolesOf,
} from "@/src/constants/permissions";

// Canonical page-access keys shared with the WEB app. The `key` is what gets
// stored in User.extra_pages by the backend and must be identical across web
// and mobile, otherwise a grant made in one app won't be recognised by the other.
// `screens` maps each key to the mobile Drawer.Screen name(s) it unlocks; some
// keys (e.g. Product_Stock) have no mobile screen and simply do nothing here.
export interface AppPage {
  key: string;
  label: string;
  screens: string[];
}

export const ASSIGNABLE_PAGES: AppPage[] = [
  { key: "App_User", label: "App User", screens: ["users/allUsers", "users/create"] },
  { key: "Sap_Sync", label: "SAP Sync", screens: ["sap/sap-sync"] },
  { key: "Party_Assignment", label: "Party Assignment", screens: ["sap/party-assignment"] },
  { key: "Party_Product_Assignment", label: "Party Product Assignment", screens: ["sap/party-product-assignment"] },
  { key: "Add_Scheme", label: "Add Scheme", screens: ["users/addScheme"] },
  { key: "Order_Flow_Settings", label: "Order Flow Settings", screens: ["admin/order-flow"] },
  { key: "Product_Stock", label: "Stock", screens: [] },
  { key: "Reports", label: "Reports", screens: ["reports/daily-report"] },
  // NOTE: these keys must match the WEB app's page keys exactly — a grant made
  // in the web admin is stored in User.extra_pages and read by both clients.
  {
    key: "Receive_Payment",
    label: "Receive Payment",
    // The grant opens the form AND the tracking list it feeds, plus the shared
    // detail screen — granting the form alone would leave the creator unable to
    // see what became of what they raised.
    screens: [
      "payments/receive-payment",
      "payments/payment-tracking",
      "payments/tracking-details",
      "payments/tracking-progress",
      "approval/approval-details",
    ],
  },
  {
    key: "Bank_Deposit",
    label: "Bank Deposit",
    screens: [
      "payments/bank-deposit",
      "payments/deposit-tracking",
      "payments/deposit-details",
      "payments/tracking-details",
      "payments/tracking-progress",
      "approval/approval-details",
    ],
  },
  {
    // Analytics only — company-wide collection totals. Deliberately NOT
    // implied by any of the four action permissions: doing the work and
    // seeing everyone's figures are different kinds of access. The server
    // enforces the same key on every analytics endpoint.
    key: "Payments_Dashboard",
    label: "Payments Dashboard",
    screens: [
      "payments/dashboard",
      "payments/dashboard-person",
    ],
  },
  // "Payment_Requests" was REMOVED as a grantable page. The screen it named no
  // longer exists, and the grant had decayed into a bundle of tracking screens
  // under a label that promised a page an admin could no longer find — the
  // same screens Receive_Payment already opens. Approvers reach their work
  // through the tracking screens, gated by their action permissions.
];

/**
 * Payments ACTION permission keys.
 *
 * Unlike the page keys above these do not unlock a screen — they gate what the
 * user may DO once inside one (raise an entry, decide an approval). They live in
 * the same `extra_pages` list, so one admin grant screen covers both.
 *
 * Must match payments/permissions.py and the web app EXACTLY.
 */
export const PAYMENT_ACTIONS = {
  PAYMENTS_CREATE: "Payments_Create",
  PAYMENTS_APPROVE: "Payments_Approve",
  DEPOSIT_CREATE: "Deposit_Create",
  DEPOSIT_APPROVE: "Deposit_Approve",
} as const;

/** Every action key, for screens any payments involvement should open. */
const ALL_PAYMENT_ACTIONS = Object.values(PAYMENT_ACTIONS);

export type PaymentAction =
  (typeof PAYMENT_ACTIONS)[keyof typeof PAYMENT_ACTIONS];

// `rolesOf` and the permission primitives now live in one place, so authority
// has a single implementation. Re-exported here because this module's public
// surface already included `rolesOf` and several screens import it from here.
export { rolesOf, isAdmin } from "@/src/constants/permissions";

/**
 * Whether a user holds a payments ACTION permission.
 *
 * Now a thin wrapper over the central `can()`, so it reads the server's
 * authoritative `permissions` when present and falls back to `extra_pages` only
 * on the degraded path. Previously it consulted `extra_pages` alone, which
 * silently ignored any key granted through a ROLE BUNDLE on the backend's
 * Role Permissions matrix — the exact bug this migration exists to fix.
 */
export const hasPaymentAction = (
  action: PaymentAction,
  user: User | null | undefined,
): boolean => can(user, action);

// Expand a user's granted keys into the set of mobile screen names to unlock.
// Fed from `permissionKeysOf(user)` — the server's `permissions` when present,
// `extra_pages` on the degraded path — never from `extra_pages` directly.
export const screensFromExtraPages = (keys: string[] = []): Set<string> => {
  const unlocked = new Set<string>();
  for (const page of ASSIGNABLE_PAGES) {
    if (keys.includes(page.key)) {
      page.screens.forEach((screen) => unlocked.add(screen));
    }
  }
  return unlocked;
};

/**
 * Screen -> the permission KEY(s) that open it. Holding ANY listed key admits.
 *
 * This is the migrated, key-based half of screen authorization, and the shape
 * every future screen should use. A screen appears here only when the backend
 * registry actually defines a key for it — inventing a key the server does not
 * issue would gate the screen on something nobody can ever hold.
 *
 * The payments entries below are the ones this task migrates; they were already
 * key-based via PAYMENT_ACTION_SCREENS, and are folded in here so there is ONE
 * map rather than two consulted in a subtle order.
 */
export const SCREEN_KEYS: Record<string, string[]> = {
  // Admin pages — legacy flat keys, registered verbatim in the backend registry.
  "users/allUsers": ["App_User"],
  "users/create": ["App_User"],
  "users/addScheme": ["Add_Scheme"],
  "sap/sap-sync": ["Sap_Sync"],
  "sap/party-assignment": ["Party_Assignment"],
  "sap/party-product-assignment": ["Party_Product_Assignment"],
  "admin/order-flow": ["Order_Flow_Settings"],
  "reports/daily-report": ["Reports"],

  // Payments — the five action keys from payments/permissions.py.
  "payments/receive-payment": ["Payments_Create"],
  "payments/bank-deposit": ["Deposit_Create"],
  "payments/payment-tracking": ["Payments_Create", "Payments_Approve"],
  "payments/deposit-tracking": ["Deposit_Create", "Deposit_Approve"],
  "payments/deposit-details": ["Deposit_Create", "Deposit_Approve"],
  "payments/dashboard": ["Payments_Dashboard"],
  "payments/dashboard-person": ["Payments_Dashboard"],
  // Verification (handover). Its own key — a creator or an approver holds no
  // access here unless an admin grants it, which is the separation of duties
  // the whole feature exists for.
  //
  // No separate detail entry: verification reuses `approval/approval-details`,
  // which any payments participant may already open. The Verify ACTION there
  // is what the key gates, and the server refuses it regardless.
  "payments/verification": ["Payments_Verify"],
  // Shared screens: any payments involvement opens them.
  "payments/tracking-details": ALL_PAYMENT_ACTIONS,
  "payments/tracking-progress": ALL_PAYMENT_ACTIONS,
  "approval/approval-details": ALL_PAYMENT_ACTIONS,
};

/**
 * TRANSITIONAL — role-based screen access, for screens with NO permission key.
 *
 * Two distinct groups live here and both are deliberate:
 *
 *  1. Screens the backend registry has no key for at all (every `orders/*`
 *     screen, `approver/pending_approval`, `admin/sales-quotation`,
 *     `notifications`). The registry defines `orders.sales.*` keys, but they
 *     gate the order API ENDPOINTS; no key names these mobile screens, and
 *     inventing a mapping would be a guess at intent, not a migration.
 *
 *  2. `users/pagePermissions`, which grants authority to others. `App_User`
 *     covers user records, not the right to hand out permissions — gating it
 *     on that key would let a user-admin escalate themselves.
 *
 * These are NOT a fallback for migrated screens: a screen listed in SCREEN_KEYS
 * is decided there and never reaches this map. That separation is what stops
 * the old role architecture quietly becoming the primary mechanism again.
 *
 * Each entry is removed as the backend defines a key for it.
 */
export const SCREEN_ROLES: Record<string, string[]> = {
  dashboard: ["admin", "manager", "approver"],
  // Admin has no order-level notifications to act on, so the bell is hidden for
  // that role — both in the drawer and in the screen headers.
  notifications: ["manager", "billing", "approver", "auditor"],
  "orders/create": ["manager", "billing"],
  "orders/drafts": ["manager", "billing"],
  "orders/foc": ["manager", "billing"],
  "orders/orderlist": ["billing"],
  "admin/sales-quotation": ["admin"],
  // Grants authority to OTHER users, so it stays admin-only rather than moving
  // to `App_User`: that key covers user records, and gating this screen on it
  // would let a user-admin grant themselves anything.
  "users/pagePermissions": ["admin"],
  "approver/pending_approval": ["approver"],
  "orders/ordertracking": ["manager", "billing"],
  "orders/auditorapproval": ["auditor"],
};

/**
 * Whether a user may access a mobile screen.
 *
 * The order of decision matters and is deliberate:
 *
 *   1. Home and Profile are always reachable.
 *   2. Administrators hold everything — matching the server, which pre-expands
 *      an admin to every key in `effective_keys` and `granted_keys`.
 *   3. SCREEN_KEYS — the migrated, permission-key path. A screen listed there
 *      is decided there and STOPS; it never falls through to the role map, so
 *      a role can no longer grant a screen the keys deny.
 *   4. SCREEN_ROLES — only for screens the backend has no key for (see the map).
 *
 * Takes the whole `User` rather than loose role/extraPages arguments. Those
 * four parameters were easy to pass incompletely — one existing call site
 * omitted `roles` entirely, silently misresolving users whose role came from
 * `extra_roles` — and this makes that unrepresentable.
 */
export const canAccessScreen = (
  screen: string,
  user: User | null | undefined,
): boolean => {
  if (screen === "dashboard" || screen === "profile") return true;
  if (isAdmin(user)) return true;

  // Migrated screens: the key decides, full stop.
  const required = SCREEN_KEYS[screen];
  if (required) return canAny(user, required);

  // An explicit per-user page grant still opens its screens.
  if (screensFromExtraPages(permissionKeysOf(user)).has(screen)) return true;

  // Notifications is shared across modules: anyone holding a payment action
  // reaches the inbox, in ADDITION to the roles listed in SCREEN_ROLES.
  if (screen === "notifications" && canAny(user, ALL_PAYMENT_ACTIONS)) {
    return true;
  }

  // Unmigrated screens only: no registry key names them yet.
  const allowed = SCREEN_ROLES[screen];
  if (!allowed) return false;
  const held = rolesOf(user?.role, user?.roles);
  return allowed.some((r) => held.includes(r));
};

export type AppRoute = { screen: string; route: string };

/**
 * Each role's own "Orders" destination. There is no single orders screen — the
 * list a user should see depends on their role, so anything navigating to
 * "Orders" must resolve it rather than hardcode one (e.g. `orders/orderlist` is
 * BILLING-only; sending a manager there lands them on a page they can't open).
 */
export const ORDERS_BY_ROLE: Record<string, AppRoute> = {
  billing: { screen: "orders/orderlist", route: "/orders/orderlist" },
  manager: { screen: "orders/ordertracking", route: "/orders/ordertracking" },
  approver: {
    screen: "approver/pending_approval",
    route: "/approver/pending_approval",
  },
  auditor: { screen: "orders/auditorapproval", route: "/orders/auditorapproval" },
};

// Tried in order when a user's own role screen isn't reachable (e.g. an
// extra_pages grant gave them a different orders screen).
const ORDERS_FALLBACKS: string[] = [
  "orders/ordertracking",
  "orders/orderlist",
  "approver/pending_approval",
  "orders/auditorapproval",
];

/**
 * The Orders screen this user should actually land on: their role's own screen
 * when permitted, else the first orders screen they DO have access to, else the
 * dashboard (always reachable). Never returns a screen the user can't open.
 */
export const resolveOrdersRoute = (
  user: User | null | undefined,
): AppRoute => {
  const normalizedRole = (user?.role || "").toLowerCase();

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && canAccessScreen(own.screen, user)) {
    return own;
  }

  for (const screen of ORDERS_FALLBACKS) {
    if (canAccessScreen(screen, user)) {
      return { screen, route: `/${screen}` };
    }
  }

  return { screen: "dashboard", route: "/(main)/dashboard" };
};

// ---------------------------------------------------------------------------
// Permission-driven bottom bar
// ---------------------------------------------------------------------------

/** One thing a user can create, for the Create chooser sheet. */
export interface CreateTarget {
  key: "payment" | "deposit" | "order";
  label: string;
  description: string;
  icon: string;
  screen: string;
  route: string;
}

const CREATE_TARGETS: CreateTarget[] = [
  {
    key: "payment",
    label: "Receive Payment",
    description: "Record money collected from a party",
    icon: "cash-outline",
    screen: "payments/receive-payment",
    route: "/(main)/payments/receive-payment",
  },
  {
    key: "deposit",
    label: "Bank Deposit",
    description: "Bank the payments you have collected",
    icon: "business-outline",
    screen: "payments/bank-deposit",
    route: "/(main)/payments/bank-deposit",
  },
  {
    key: "order",
    label: "Sales Order",
    description: "Raise an order for a party",
    icon: "cart-outline",
    screen: "orders/create",
    route: "/orders/create",
  },
];

/**
 * Everything this user may create.
 *
 * Empty means the Create button should be hidden — offering a "+" that opens
 * nothing is worse than not offering it. One entry means tap-to-open; more than
 * one means show the chooser sheet.
 */
export const createTargetsFor = (
  user: User | null | undefined,
): CreateTarget[] =>
  CREATE_TARGETS.filter((t) => canAccessScreen(t.screen, user));

/**
 * The second bottom-bar tab: the user's own work queue.
 *
 * A payments user has no sales orders, so labelling that tab "Orders" and
 * sending them to an order list they cannot open is useless — they get
 * "Payments" (their tracking list) instead. Orders keeps priority when the user
 * genuinely has an orders screen, since that is the established flow.
 */
/**
 * Does this user work in payments/deposits but NOT in orders?
 *
 * Uses the SAME order-screen list that resolveWorkQueueRoute tries, so "the
 * second tab says Payments" and "the home page shows payments" can never
 * disagree — both answer from one source. A user who holds both keeps the
 * sales dashboard: orders is the bigger surface and losing it would be a
 * downgrade.
 */
export const isPaymentsOnlyUser = (
  user: User | null | undefined,
): boolean => {
  const normalizedRole = (user?.role || "").toLowerCase();
  const reach = (screen: string) => canAccessScreen(screen, user);

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && reach(own.screen)) return false;
  if (ORDERS_FALLBACKS.some(reach)) return false;

  // No orders anywhere. Payments only counts if they actually hold one.
  // Verification belongs here too: a verifier works payments all day and has
  // no sales orders at all, so without this they landed on the sales
  // dashboard — a page of empty order charts they cannot open a single one of.
  return (
    reach("payments/payment-tracking") ||
    reach("payments/verification") ||
    reach("payments/deposit-tracking")
  );
};

/**
 * The second bottom-bar tab, in priority order:
 *
 *   Orders -> Payments -> Deposits -> Payment Verify
 *
 * ALWAYS returns a destination, never null. The footer keeps five icons for
 * everyone, so it does not reflow between users — a bar that changes shape
 * with permissions makes the app look broken and moves the other tabs under
 * the user's thumb. A user who holds none of the four still gets the Orders
 * tab, and tapping it raises the existing "no permission" dialog rather than
 * navigating: `guarded()` in BottomBar re-checks access on every tap, so a
 * visible tab is never a reachable screen.
 */
export const resolveWorkQueueRoute = (
  user: User | null | undefined,
): AppRoute & { label: string; icon: string } => {
  const normalizedRole = (user?.role || "").toLowerCase();
  const ordersTab = {
    screen: "orders/ordertracking",
    route: "/orders/ordertracking",
    label: "Orders",
    icon: "receipt-outline",
  };

  // Admin holds every screen, so the generic resolution below would pick
  // whichever orders screen matched first. Pin them to order tracking: the
  // admin's natural work queue is the full order list.
  if (isAdmin(user)) return ordersTab;

  const reach = (screen: string) => canAccessScreen(screen, user);

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && reach(own.screen)) {
    return { ...own, label: "Orders", icon: "receipt-outline" };
  }
  for (const screen of ORDERS_FALLBACKS) {
    if (reach(screen)) {
      return {
        screen,
        route: `/${screen}`,
        label: "Orders",
        icon: "receipt-outline",
      };
    }
  }

  // No orders access — fall back to the payments work they hold, in priority
  // order: Payments, then Verify, then Deposits.
  //
  // Payments and Verify sit together because they are the same surface: both
  // are payment work, and a user holding either gets the payments home as
  // their dashboard (see isPaymentsOnlyUser). Payments comes first because a
  // user who does both records more often than they verify. Deposits is last
  // — it is the separate banking step.
  const candidates: (AppRoute & { label: string; icon: string })[] = [
    // Straight to the tracking list. The SUMMARY now lives on the dashboard
    // (a payments-only user's home page is the payments home), so sending the
    // tab there too would make Home and Payments the same screen.
    {
      screen: "payments/payment-tracking",
      route: "/(main)/payments/payment-tracking",
      label: "Payments",
      icon: "cash-outline",
    },
    {
      screen: "payments/verification",
      route: "/(main)/payments/verification",
      label: "Verify",
      icon: "shield-checkmark-outline",
    },
    {
      screen: "payments/deposit-tracking",
      route: "/(main)/payments/deposit-tracking",
      label: "Deposits",
      icon: "business-outline",
    },
  ];
  for (const candidate of candidates) {
    if (reach(candidate.screen)) return candidate;
  }

  // Holds none of the four. Keep the tab — the footer must not lose an icon —
  // and let the tap explain why it cannot be opened.
  return ordersTab;
};

/**
 * The Reports bottom-bar tab destination.
 *
 * The tab used to be pinned to the sales daily report, so a payments user —
 * who has no orders access at all — tapped Reports and got a permission
 * dialog. Their reporting surface is the Payments Dashboard, so that is where
 * the tab goes for them.
 *
 * Sales reports keep priority when the user holds them: that is the
 * established destination, and someone with both should not lose it.
 *
 * Returns `null` when the user has neither, so the caller can show the
 * "no permission" dialog against the label the user actually tapped rather
 * than sending them to a screen that would refuse them.
 */
export const resolveReportsRoute = (
  user: User | null | undefined,
): (AppRoute & { label: string }) | null => {
  const reach = (screen: string) => canAccessScreen(screen, user);

  if (reach("reports/daily-report")) {
    return {
      screen: "reports/daily-report",
      route: "/reports/daily-report",
      label: "Reports",
    };
  }
  if (reach("payments/dashboard")) {
    return {
      screen: "payments/dashboard",
      route: "/(main)/payments/dashboard",
      label: "Payments Dashboard",
    };
  }
  return null;
};
