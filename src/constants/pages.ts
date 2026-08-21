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

/**
 * Every role name a user holds, lower-cased.
 *
 * The backend returns a `roles` array (primary role + extra_roles) alongside the
 * single `role` string. Reading only `role` would miss a user whose payment
 * function was granted via extra_roles — they would hold the payments role and
 * still be shown nothing.
 */
export const rolesOf = (
  role: string | null | undefined,
  roles?: string[] | null,
): string[] => {
  const all = new Set<string>();
  const add = (value: string) => {
    const name = String(value).trim().toLowerCase();
    if (name) all.add(name);
  };
  if (role) add(role);
  (roles || []).forEach((r) => {
    if (r) add(r);
  });
  return [...all];
};

/**
 * Whether a user holds an action permission.
 *
 * Admins hold all of them implicitly, and the four function roles confer their
 * matching key — the same rule the server applies in
 * payments/permissions.py:granted_keys, so a button the user sees matches what
 * the API will actually accept.
 */
export const hasPaymentAction = (
  action: PaymentAction,
  role?: string | null,
  extraPages: string[] = [],
  roles?: string[] | null,
): boolean => {
  // The ticked boxes are the ONLY source, matching granted_keys() on the
  // server. A role is identity — "this account works on payments" — not
  // authority, so it must not add permissions the admin did not tick.
  if (rolesOf(role, roles).includes("admin")) return true;
  return extraPages.includes(action);
};

// Expand a user's granted keys into the set of mobile screen names to unlock.
export const screensFromExtraPages = (keys: string[] = []): Set<string> => {
  const unlocked = new Set<string>();
  for (const page of ASSIGNABLE_PAGES) {
    if (keys.includes(page.key)) {
      page.screens.forEach((screen) => unlocked.add(screen));
    }
  }
  return unlocked;
};

// Which roles may reach each mobile screen by default. Single source of truth
// shared by the Drawer (visibility) and the bottom bar (tap gating). extra_pages
// grants add access on top of this.
export const SCREEN_ROLES: Record<string, string[]> = {
  dashboard: ["admin", "manager", "approver"],
  // Admin has no order-level notifications to act on, so the bell is hidden for
  // that role — both in the drawer and in the screen headers.
  notifications: ["manager", "billing", "approver", "auditor"],
  "orders/create": ["manager", "billing"],
  "orders/drafts": ["manager", "billing"],
  "orders/foc": ["manager", "billing"],
  "orders/orderlist": ["billing"],
  "reports/daily-report": ["admin", "billing"],
  // ── PAYMENTS SCREENS ARE NOT LISTED HERE, DELIBERATELY ─────────────────
  //
  // Every payments/deposit screen is gated by PAYMENT_ACTION_SCREENS below —
  // the action permissions an admin ticks — and canAccessScreen checks that
  // map FIRST, so any role entry here would be dead code that merely looks
  // authoritative.
  //
  // The role is identity only ("this account works in payments"); it confers
  // nothing. One dummy payments role therefore serves every payments user,
  // and access follows two things:
  //
  //   1. the page/action permissions granted to that user, and
  //   2. their assignment as an approver on a workflow level.
  //
  // This mirrors the backend, where payments/permissions.py has no
  // role -> permission map and granted_keys() reads only `extra_pages`.
  //
  // Adding a payments screen? Add it to PAYMENT_ACTION_SCREENS, not here.
  //
  // `approver` stays below for approval/* because the ORDERS approval flow
  // still uses that role; the payments roles do not appear.
  "approval/approval-details": ["admin", "approver"],
  "admin/order-flow": ["admin"],
  "admin/sales-quotation": ["admin"],
  "users/create": ["admin"],
  "users/allUsers": ["admin"],
  "users/pagePermissions": ["admin"],
  "users/addScheme": ["admin"],
  "sap/sap-sync": ["admin"],
  "sap/party-assignment": ["admin"],
  "sap/party-product-assignment": ["admin"],
  "approver/pending_approval": ["approver"],
  "orders/ordertracking": ["manager", "billing"],
  "orders/auditorapproval": ["auditor"],
};

/**
 * Whether a user (by role + extra_pages) may access a mobile screen. The Home
 * dashboard is always reachable (it's the landing screen); everything else is
 * granted by role (SCREEN_ROLES) or by an explicit extra_pages grant.
 */
/**
 * Payments screens, and which ACTION permissions open them.
 *
 * These screens are governed by the four Payment Permissions checkboxes rather
 * than by role, so any role — manager, billing, anything — can be given
 * payments work simply by ticking a box, and a payments role with nothing
 * ticked gets nothing.
 *
 * CREATE screens list only the create actions: an approver reviews documents,
 * they do not raise them, so showing them a form the server would reject is
 * worse than not showing it.
 */
const PAYMENT_ACTION_SCREENS: Record<string, PaymentAction[]> = {
  "payments/receive-payment": [PAYMENT_ACTIONS.PAYMENTS_CREATE],
  "payments/bank-deposit": [PAYMENT_ACTIONS.DEPOSIT_CREATE],
  "payments/payment-tracking": [
    PAYMENT_ACTIONS.PAYMENTS_CREATE,
    PAYMENT_ACTIONS.PAYMENTS_APPROVE,
  ],
  "payments/deposit-tracking": [
    PAYMENT_ACTIONS.DEPOSIT_CREATE,
    PAYMENT_ACTIONS.DEPOSIT_APPROVE,
  ],
  "payments/deposit-details": [
    PAYMENT_ACTIONS.DEPOSIT_CREATE,
    PAYMENT_ACTIONS.DEPOSIT_APPROVE,
  ],
  // Shared screens: any payments involvement opens them.
  "payments/tracking-details": ALL_PAYMENT_ACTIONS,
  "payments/tracking-progress": ALL_PAYMENT_ACTIONS,
  "approval/approval-details": ALL_PAYMENT_ACTIONS,
  // approval/payment-requests was REMOVED. Approvers work from the tracking
  // screens, which scope themselves from these same action permissions.
};

export const canAccessScreen = (
  screen: string,
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): boolean => {
  // Home (dashboard) and the user's own Profile are always reachable.
  if (screen === "dashboard" || screen === "profile") return true;
  // Admin holds every screen implicitly, payments and deposits included. This
  // mirrors the backend, where payments/permissions.py granted_keys() returns
  // the full ACTION_PERMISSION_KEYS set for an admin. Without this the app hid
  // payments pages the API would have served, because the
  // PAYMENT_ACTION_SCREENS branch below returns before SCREEN_ROLES is read.
  if (rolesOf(role, roles).includes("admin")) return true;
  if (screensFromExtraPages(extraPages).has(screen)) return true;
  // Payments screens follow the ACTION permissions an admin ticked, not the
  // role. A manager ticked for Payments_Create must reach the payment form;
  // a payments-role user who was ticked for nothing must not.
  const viaAction = PAYMENT_ACTION_SCREENS[screen];
  if (viaAction) {
    return viaAction.some((action) => extraPages.includes(action));
  }
  // Notifications is shared across modules: a payments/deposit user now receives
  // Payment/Deposit notifications, so anyone holding ANY payment action reaches
  // the inbox too — in ADDITION to the roles in SCREEN_ROLES.notifications
  // below. (This is additive, so the four notification roles keep their access
  // even with no payment permission.)
  if (
    screen === "notifications" &&
    ALL_PAYMENT_ACTIONS.some((action) => extraPages.includes(action))
  ) {
    return true;
  }
  const allowed = SCREEN_ROLES[screen];
  if (!allowed) return false;
  // Match on EVERY role held (primary + extra_roles), not just the primary.
  const held = rolesOf(role, roles);
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
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): AppRoute => {
  const normalizedRole = (role || "").toLowerCase();

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && canAccessScreen(own.screen, normalizedRole, extraPages, roles)) {
    return own;
  }

  for (const screen of ORDERS_FALLBACKS) {
    if (canAccessScreen(screen, normalizedRole, extraPages, roles)) {
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
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): CreateTarget[] =>
  CREATE_TARGETS.filter((t) =>
    canAccessScreen(t.screen, role, extraPages, roles),
  );

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
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): boolean => {
  const normalizedRole = (role || "").toLowerCase();
  const can = (screen: string) =>
    canAccessScreen(screen, normalizedRole, extraPages, roles);

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && can(own.screen)) return false;
  if (ORDERS_FALLBACKS.some(can)) return false;

  // No orders anywhere. Payments only counts if they actually hold one.
  return (
    can("payments/payment-tracking") || can("payments/deposit-tracking")
  );
};

export const resolveWorkQueueRoute = (
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): (AppRoute & { label: string; icon: string }) | null => {
  const normalizedRole = (role || "").toLowerCase();
  // Admin holds every screen, so the generic resolution below would pick
  // whichever orders screen matched first. Pin them to order tracking: a
  // four-tab footer left an unbalanced gap beside the centre FAB, and the
  // admin's natural work queue is the full order list.
  if (rolesOf(role, roles).includes("admin")) {
    return {
      screen: "orders/ordertracking",
      route: "/orders/ordertracking",
      label: "Orders",
      icon: "receipt-outline",
    };
  }
  const can = (screen: string) =>
    canAccessScreen(screen, normalizedRole, extraPages, roles);

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && can(own.screen)) {
    return { ...own, label: "Orders", icon: "receipt-outline" };
  }
  for (const screen of ORDERS_FALLBACKS) {
    if (can(screen)) {
      return {
        screen,
        route: `/${screen}`,
        label: "Orders",
        icon: "receipt-outline",
      };
    }
  }

  // No orders access — fall back to whichever payments queue they hold.
  // Approvers get their request queue; creators get their tracking list.
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
      screen: "payments/deposit-tracking",
      route: "/(main)/payments/deposit-tracking",
      label: "Deposits",
      icon: "business-outline",
    },
  ];
  for (const candidate of candidates) {
    if (can(candidate.screen)) return candidate;
  }

  // No orders, payments or deposits queue for this user (an admin, typically).
  // Returning a dashboard route here rendered a SECOND "Home" tab beside the
  // real one; null tells the footer to drop the tab instead.
  return null;
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
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): (AppRoute & { label: string }) | null => {
  const can = (screen: string) =>
    canAccessScreen(screen, (role || "").toLowerCase(), extraPages, roles);

  if (can("reports/daily-report")) {
    return {
      screen: "reports/daily-report",
      route: "/reports/daily-report",
      label: "Reports",
    };
  }
  if (can("payments/dashboard")) {
    return {
      screen: "payments/dashboard",
      route: "/(main)/payments/dashboard",
      label: "Payments Dashboard",
    };
  }
  return null;
};
