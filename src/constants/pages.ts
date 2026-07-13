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
