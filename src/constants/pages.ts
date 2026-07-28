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
];

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
  "orders/create": ["manager", "billing"],
  "orders/drafts": ["manager", "billing"],
  "orders/foc": ["manager", "billing"],
  "orders/orderlist": ["billing"],
  "reports/daily-report": ["admin", "billing"],
  "payments/receive-payment": ["admin"],
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
): boolean => {
  // Home (dashboard) and the user's own Profile are always reachable.
  if (screen === "dashboard" || screen === "profile") return true;
  const normalizedRole = (role || "").toLowerCase();
  if (screensFromExtraPages(extraPages).has(screen)) return true;
  const roles = SCREEN_ROLES[screen];
  return !!roles && roles.includes(normalizedRole);
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
): AppRoute => {
  const normalizedRole = (role || "").toLowerCase();

  const own = ORDERS_BY_ROLE[normalizedRole];
  if (own && canAccessScreen(own.screen, normalizedRole, extraPages)) return own;

  for (const screen of ORDERS_FALLBACKS) {
    if (canAccessScreen(screen, normalizedRole, extraPages)) {
      return { screen, route: `/${screen}` };
    }
  }

  return { screen: "dashboard", route: "/(main)/dashboard" };
};
