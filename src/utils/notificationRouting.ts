import type { Href } from "expo-router";

/**
 * Structured data attached to an Expo push notification by the Django backend
 * (see OMS Backend/orders/notifications.py -> _build_push_data).
 *
 * Every field is optional: older backends only send order_id/notification_id/
 * screen, and the app must keep working with just those.
 */
export type OMSNotificationData = {
  order_id?: number | string | null;
  notification_id?: number | string | null;
  screen?: string | null;
  // Additive structured fields (Phase 2). Safe to be missing on old payloads.
  notification_type?: string | null;
  event_type?: string | null;
  title?: string | null;
  message?: string | null;
  timestamp?: string | null;
};

/**
 * Canonical in-app routes reused by both the notification list screen and the
 * push deep-link handler. Kept here so routes are defined once, not hardcoded
 * across the notification lifecycle handlers.
 */
export const ORDER_DETAILS_ROUTE = "/orders/orderdetails" as const;
export const NOTIFICATIONS_ROUTE = "/notifications" as const;

/**
 * Maps a user's role to the list screen they "belong to", so that pressing Back
 * from a notification-opened order returns to that list instead of Home. These
 * are the exact drawer screen names the app's lists already pass as the `from`
 * param (see orderlist.tsx, pending_approval.tsx, auditorapproval.tsx,
 * ordertracking.tsx) and that the Back handlers navigate to.
 */
export const ORIGIN_SCREEN_BY_ROLE: Record<string, string> = {
  approver: "approver/pending_approval",
  "rate approver": "approver/pending_approval",
  auditor: "orders/auditorapproval",
  billing: "orders/orderlist",
  manager: "orders/ordertracking",
};

/**
 * Resolve the list screen a role should return to. Returns null for unknown
 * roles (e.g. admin) so callers fall back to default Home behaviour.
 */
export const originScreenForRole = (
  role: string | null | undefined,
): string | null => {
  if (!role) return null;
  const normalized = String(role).toLowerCase().replace(/[_-]+/g, " ").trim();
  return ORIGIN_SCREEN_BY_ROLE[normalized] ?? null;
};

const toOrderId = (value: OMSNotificationData["order_id"]): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : null;
};

/**
 * Resolve the destination for a tapped notification.
 *
 * Preference order:
 *   1. If the payload carries an order_id -> open that Sales Order directly.
 *      This is the desired WhatsApp-style behaviour and works even for old
 *      payloads (order_id has always been present).
 *   2. Otherwise fall back to the notification list so the tap is never a
 *      no-op.
 *
 * Returns `null` only when there is genuinely nothing actionable, so callers
 * can decide whether to navigate at all.
 */
export const resolveNotificationRoute = (
  data: OMSNotificationData | null | undefined,
  originScreen?: string | null,
): Href | null => {
  if (!data) return null;

  const orderId = toOrderId(data.order_id);
  if (orderId) {
    // `from` drives the Back button in orderdetails (useAndroidBackOverride)
    // and the drawer header. When we know the user's list screen, set it so
    // Back returns there; otherwise omit it and let Back fall back to Home.
    const params: Record<string, string> = { orderId };
    if (originScreen) {
      params.from = originScreen;
    }
    return {
      pathname: ORDER_DETAILS_ROUTE,
      params,
    } as Href;
  }

  // No order context — send the user to their notification inbox rather than
  // dropping the tap.
  const screen = String(data.screen || "").toLowerCase();
  if (screen === "notifications" || screen === "") {
    return NOTIFICATIONS_ROUTE as Href;
  }

  return NOTIFICATIONS_ROUTE as Href;
};

/**
 * Stable identifier for a delivered notification, used to de-duplicate taps so
 * the same notification never triggers navigation twice (e.g. cold-start hook
 * firing alongside the response listener).
 */
export const getNotificationDedupeKey = (
  identifier: string | null | undefined,
  data: OMSNotificationData | null | undefined,
): string => {
  if (identifier) return `id:${identifier}`;
  const notificationId = data?.notification_id;
  if (notificationId !== null && notificationId !== undefined) {
    return `nid:${notificationId}`;
  }
  const orderId = data?.order_id;
  return orderId ? `oid:${orderId}` : `ts:${data?.timestamp || "unknown"}`;
};
