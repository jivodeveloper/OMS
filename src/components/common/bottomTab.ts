/**
 * Which footer tab is lit for the screen you are looking at.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BUG THIS FIXES
 * ─────────────────────────────────────────────────────────────────────────
 * The rule was a list of route fragments — orderlist, ordertracking,
 * pending_approval, /payments/, /approval/ — and anything unlisted fell
 * through to "home". So standing on Production Tracking lit HOME: the footer
 * claimed you were on the dashboard while you were reading a list of
 * production orders, and the tab that actually took you there looked inactive.
 *
 * Every module added to the app hits that same hole, because the default is
 * the wrong answer rather than no answer. So the rule is now "which SECTION
 * is this path in", with one entry per section and no fallthrough to home:
 * home is lit only by the dashboard itself.
 *
 * Kept free of React and expo-router so it can be asserted directly — see
 * `bottomTab.test.ts`.
 */

export type TabKey = "home" | "orders" | "create" | "reports" | "profile";

/**
 * Sections the SECOND tab can point at.
 *
 * It is labelled per user — Orders, Payments, Deposits, Verify, Production or
 * BackDate, whichever they hold (`resolveWorkQueueRoute`) — but there is only
 * one of it, so every one of these sections lights the same tab.
 *
 * `approver` and `approval` are here because an approval screen belongs to the
 * work queue it was opened from, not to the dashboard.
 */
const WORK_QUEUE_SECTIONS = [
  "orders",
  "approver",
  "approval",
  "payments",
  "backdate",
  "production",
];

/**
 * The tab to light for a path, or null when no tab owns it.
 *
 * NULL IS A REAL ANSWER. Settings, permissions and the user-admin screens are
 * reached from the drawer and belong to no tab; lighting one would say they
 * are somewhere they are not. The old code's habit of defaulting to "home" is
 * what made this wrong for every section nobody remembered to list.
 */
export function activeTabFor(pathname: string | null | undefined): TabKey | null {
  const p = (pathname || "").toLowerCase();
  if (!p) return null;

  // The dashboard, and only the dashboard.
  if (p.includes("dashboard") && !p.includes("/payments/dashboard")) {
    return "home";
  }

  // Checked BEFORE the sections below: a create form lives inside its own
  // module's section, and the tab that opened it is the "+".
  if (p.includes("create")) return "create";

  if (p.includes("profile")) return "profile";

  // Payments ANALYTICS is the Reports destination for a payments user, so it
  // must beat the generic payments section — otherwise the work-queue tab
  // lights while the user is looking at charts.
  if (p.includes("/payments/dashboard") || p.includes("report")) {
    return "reports";
  }

  if (WORK_QUEUE_SECTIONS.some((section) => p.includes(`${section}/`))) {
    return "orders";
  }

  return null;
}
