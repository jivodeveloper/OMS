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
    ],
  },
  {
    key: "Bank_Deposit",
    label: "Bank Deposit",
    screens: [
      "payments/bank-deposit",
      "payments/deposit-tracking",
      "payments/tracking-details",
    ],
  },
  {
    key: "Payment_Requests",
    label: "Payment Requests",
    // One grant opens the list and the detail screen it navigates to; granting
    // the list alone would dead-end every "View Details" tap.
    screens: ["approval/payment-requests", "approval/approval-details"],
  },
  {
    key: "Deposit_Requests",
    label: "Deposit Requests",
    screens: ["approval/deposit-requests", "approval/approval-details"],
  },
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

export type PaymentAction =
  (typeof PAYMENT_ACTIONS)[keyof typeof PAYMENT_ACTIONS];

/**
 * Every role name a user holds, lower-cased.
 *
 * The backend returns a `roles` array (primary role + extra_roles) alongside the
 * single `role` string. Reading only `role` would miss a user whose payment
 * function was granted via extra_roles — they would hold payment_approver and
 * still be shown nothing.
 */
export const rolesOf = (
  role: string | null | undefined,
  roles?: string[] | null,
): string[] => {
  const all = new Set<string>();
  if (role) all.add(String(role).trim().toLowerCase());
  (roles || []).forEach((r) => {
    if (r) all.add(String(r).trim().toLowerCase());
  });
  return [...all];
};

/** Roles that confer an action permission — mirrors payments/permissions.py. */
const ROLE_ACTIONS: Record<string, PaymentAction> = {
  payment_creator: PAYMENT_ACTIONS.PAYMENTS_CREATE,
  payment_approver: PAYMENT_ACTIONS.PAYMENTS_APPROVE,
  deposit_creator: PAYMENT_ACTIONS.DEPOSIT_CREATE,
  deposit_approver: PAYMENT_ACTIONS.DEPOSIT_APPROVE,
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
  const held = rolesOf(role, roles);
  if (held.includes("admin")) return true;
  if (extraPages.includes(action)) return true;
  return held.some((r) => ROLE_ACTIONS[r] === action);
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
  // CREATE screens go to creators ONLY. An approver reviews documents, they do
  // not raise them, so listing payment_approver here showed them a form they
  // could fill in but never submit — the server rejects the create.
  "payments/receive-payment": ["admin", "payment_creator"],
  "payments/bank-deposit": ["admin", "deposit_creator"],

  // Tracking is for the people who RAISE documents — it answers "where has my
  // entry got to". Approvers get the request queues instead. Admins see both.
  "payments/payment-tracking": ["admin", "payment_creator"],
  "payments/deposit-tracking": ["admin", "deposit_creator"],
  // Shared detail screen, reachable from either tracking list.
  "payments/tracking-details": [
    "admin",
    "payment_creator",
    "deposit_creator",
  ],

  // Request queues go to the matching APPROVERS only. Split per document type
  // so a payment approver is not shown deposits they cannot act on.
  "approval/payment-requests": ["admin", "approver", "payment_approver"],
  "approval/deposit-requests": ["admin", "approver", "deposit_approver"],
  // Detail screen is reachable by deep link, so it needs its own entry rather
  // than inheriting from whichever list opened it.
  "approval/approval-details": [
    "admin",
    "approver",
    "payment_approver",
    "deposit_approver",
  ],
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
export const canAccessScreen = (
  screen: string,
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): boolean => {
  // Home (dashboard) and the user's own Profile are always reachable.
  if (screen === "dashboard" || screen === "profile") return true;
  if (screensFromExtraPages(extraPages).has(screen)) return true;
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
export const resolveWorkQueueRoute = (
  role: string | null | undefined,
  extraPages: string[] = [],
  roles?: string[] | null,
): AppRoute & { label: string; icon: string } => {
  const normalizedRole = (role || "").toLowerCase();
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
    {
      screen: "payments/payment-tracking",
      route: "/(main)/payments/payment-tracking",
      label: "Payments",
      icon: "cash-outline",
    },
    {
      screen: "approval/payment-requests",
      route: "/(main)/approval/payment-requests",
      label: "Payments",
      icon: "cash-outline",
    },
    {
      screen: "payments/deposit-tracking",
      route: "/(main)/payments/deposit-tracking",
      label: "Deposits",
      icon: "business-outline",
    },
    {
      screen: "approval/deposit-requests",
      route: "/(main)/approval/deposit-requests",
      label: "Deposits",
      icon: "business-outline",
    },
  ];
  for (const candidate of candidates) {
    if (can(candidate.screen)) return candidate;
  }

  return {
    screen: "dashboard",
    route: "/(main)/dashboard",
    label: "Home",
    icon: "home-outline",
  };
};
