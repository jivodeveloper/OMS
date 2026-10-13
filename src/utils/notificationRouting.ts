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
  // Generic entity reference sent by the reusable notification framework
  // (see OMS Backend/notifications/services/payloads.py). Present on
  // Payment/Deposit (and future module) notifications, which carry NO order_id.
  // entity_type is the Django model name, e.g. "paymentreceipt" / "bankdeposit".
  entity_type?: string | null;
  entity_id?: number | string | null;
};

/**
 * Canonical in-app routes reused by both the notification list screen and the
 * push deep-link handler. Kept here so routes are defined once, not hardcoded
 * across the notification lifecycle handlers.
 */
export const ORDER_DETAILS_ROUTE = "/orders/orderdetails" as const;
export const NOTIFICATIONS_ROUTE = "/notifications" as const;
// Payment detail: the SAME screen the payment-tracking cards open on "View
// Details" (PaymentTrackingScreen.openDetails → approval-details). It loads
// from documentId (the receipt id) alone — approvalId is optional.
export const PAYMENT_DETAILS_ROUTE = "/(main)/approval/approval-details" as const;
// Deposit detail: the SAME rich screen the deposit-tracking cards open on
// "View Details" (PaymentTrackingScreen.openDetails / PaymentHomeScreen.
// openDetail). Keyed by { id, from }.
export const DEPOSIT_DETAILS_ROUTE = "/(main)/payments/deposit-details" as const;
// BackDate detail: the SAME screen the tracking cards open on "View Details"
// (BackDateTrackingScreen.openDetails). Keyed by { id, from }.
export const BACKDATE_DETAILS_ROUTE =
  "/(main)/backdate/tracking-details" as const;
// Production Order detail: the SAME screen the tracking cards open on
// "View Details" (ProductionTrackingScreen.openDetails). Keyed by { id, from }.
export const PRODUCTION_DETAILS_ROUTE =
  "/(main)/production/tracking-details" as const;
// Credit Limit detail: the SAME screen the list cards open on "View Details"
// (CreditLimitListScreen.openDetails). Keyed by { id }.
export const CREDIT_LIMIT_DETAILS_ROUTE =
  "/(main)/credit-limit/details" as const;
// Payment request (the module the backend still calls advance_payment) detail:
// the SAME screen the list cards open on "View Details"
// (AdvanceListScreen.openDetails). Keyed by { id, from }.
export const ADVANCE_DETAILS_ROUTE =
  "/(main)/advance-payments/details" as const;
// The module's list, which is also where "Assigned to me" lives — the only
// place a recipient can act on a bill or PO that was sent to them.
export const ADVANCE_LIST_ROUTE =
  "/(main)/advance-payments/tracking" as const;

/**
 * Map a backend `entity_type` (Django model name) to the exact mobile detail
 * screen + the params that screen expects — so tapping a notification opens the
 * SAME page as the "View Details" button on the tracking list. Extend this table
 * for future modules; the generic router below needs no other change. Keys are
 * the EXACT model names the backend emits (content_type.model).
 */
const ENTITY_ROUTES: Record<
  string,
  { pathname: string; params: (id: string, from?: string) => Record<string, string> }
> = {
  paymentreceipt: {
    // Matches PaymentTrackingScreen.openDetails for a payment: approval-details
    // keyed by documentId (the receipt id). requestNo/approvalId are optional —
    // the screen fetches the receipt + its approval from documentId alone.
    pathname: PAYMENT_DETAILS_ROUTE,
    params: (id, from) => ({ documentId: id, ...(from ? { from } : {}) }),
  },
  bankdeposit: {
    pathname: DEPOSIT_DETAILS_ROUTE,
    params: (id, from) => ({ id, ...(from ? { from } : {}) }),
  },
  // `backdate` is the backend's content_type.model for BackDate — verified
  // against ContentType.objects.get_for_model(BackDate), not guessed.
  //
  // No `actionable` param: the list passes that when it opens the screen, but
  // a notification cannot know it. The details screen treats its absence as
  // "ask the approval queue" rather than assuming either way, so a tapped push
  // still shows Approve/Reject when the request really is this user's to act
  // on — see BackDateDetailsScreen.
  backdate: {
    pathname: BACKDATE_DETAILS_ROUTE,
    params: (id, from) => ({ id, ...(from ? { from } : {}) }),
  },
  // `productionorder` — one word, no underscore. Verified against
  // ContentType.objects.get_for_model(ProductionOrder), not guessed: a wrong
  // key here fails silently, landing a tapped push in the inbox instead of the
  // order it was about.
  //
  // As with backdate, no `actionable` param: a notification cannot know it, and
  // the details screen asks the approval queue rather than assuming either way.
  productionorder: {
    pathname: PRODUCTION_DETAILS_ROUTE,
    params: (id, from) => ({ id, ...(from ? { from } : {}) }),
  },
  // `creditlimitrequest` — one word, no underscores. Verified against
  // ContentType.objects.get_for_model(CreditLimitRequest), not guessed.
  //
  // ONE SCREEN FOR BOTH SIDES, unlike the web client's two pages: this screen
  // shows Approve and Reject when the request really is this user's to act on
  // and omits them otherwise, so the approver and the requester can be sent to
  // the same place. A multi-party submission's batch notification carries NO
  // entity, and the generic router already falls back to the inbox for that —
  // which is right, because no single request is what it was about.
  creditlimitrequest: {
    pathname: CREDIT_LIMIT_DETAILS_ROUTE,
    params: (id, from) => ({ id, ...(from ? { from } : {}) }),
  },
  // `advancerequest` — the model is `AdvanceRequest`
  // (`advance_payment/models.py`), so `content_type.model` is one word with no
  // underscore. Verified against the model, not guessed: a wrong key here
  // fails silently, landing a tapped push in the inbox instead of the request.
  //
  // ONE SCREEN FOR BOTH SIDES, as with Credit Limit and unlike the web client,
  // which sends approvers and requesters to two different pages. This screen
  // offers Approve and Reject only when the server says the request is this
  // user's to act on, so every one of the four request events — awaiting,
  // completed, rejected, returned — can land on it.
  advancerequest: {
    pathname: ADVANCE_DETAILS_ROUTE,
    params: (id, from) => ({ id, ...(from ? { from } : {}) }),
  },
};

/**
 * Events that name no entity, and the screen that answers them anyway.
 *
 * ADVANCE_PAYMENT_ASSIGNED is sent when bills or POs are handed to somebody to
 * raise a payment request FROM (`advance_payment/services/notify.py` sends it
 * with `entity=None`, because several documents are one notification and no
 * single one of them is what it is about). Dropping such a tap in the inbox
 * would be the one case where the notification tells the user to do something
 * and then does not take them to where it is done: the list's "Assigned to me"
 * view is that place.
 */
const EVENT_ROUTES: Record<
  string,
  { pathname: string; params: (from?: string) => Record<string, string> }
> = {
  ADVANCE_PAYMENT_ASSIGNED: {
    pathname: ADVANCE_LIST_ROUTE,
    params: (from): Record<string, string> => (from ? { from } : {}),
  },
};

/**
 * The coarse module a notification belongs to, read from the ENTITY rather
 * than from the `module` the server sends.
 *
 * WHY NOT THE SERVER'S. `notifications/serializers.py::_ENTITY_MODULE` names
 * only `paymentreceipt` and `bankdeposit`; everything else — BackDate,
 * Production, Credit Limit and payment requests alike — is labelled "other".
 * The inbox filters on this, so taking the server's word for it files four
 * modules under one heading nobody chose. The entity type is already on every
 * framework notification and is exact, so it answers the question instead.
 *
 * Returns "" when the entity is unknown, which the caller reads as "other".
 */
export const moduleForEntity = (
  entityType: string | null | undefined,
): string => {
  switch (String(entityType || "").toLowerCase()) {
    case "paymentreceipt":
      return "payments";
    case "bankdeposit":
      return "deposits";
    case "backdate":
      return "backdate";
    case "productionorder":
      return "production";
    case "creditlimitrequest":
      return "creditLimit";
    case "advancerequest":
      return "advances";
    default:
      return "";
  }
};

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

const toPositiveId = (
  value: OMSNotificationData["order_id"],
): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : null;
};

// Back-compat alias (kept so any existing importer keeps working).
const toOrderId = toPositiveId;

/**
 * Resolve the destination for a tapped notification.
 *
 * Preference order:
 *   1. If the payload carries an order_id -> open that Sales Order directly.
 *      This is the desired WhatsApp-style behaviour and works even for old
 *      payloads (order_id has always been present).
 *   2. If the payload carries a generic (entity_type, entity_id) the framework
 *      emits for Payment/Deposit (and future modules) -> open that entity's
 *      detail screen. Order notifications never reach here because they carry
 *      order_id and short-circuit above, so Order routing is unchanged.
 *   3. Otherwise fall back to the notification list so the tap is never a
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

  // Generic entity deep-link (Payment / Deposit / future modules). Driven by the
  // exact model name the backend sends; unknown types fall through to the inbox.
  const entityType = String(data.entity_type || "").toLowerCase();
  const entityId = toPositiveId(data.entity_id);
  const entityRoute = ENTITY_ROUTES[entityType];
  if (entityRoute && entityId) {
    return {
      pathname: entityRoute.pathname,
      params: entityRoute.params(entityId, originScreen || undefined),
    } as Href;
  }

  // An event that names no entity but still has somewhere to go — see
  // `EVENT_ROUTES`. Checked AFTER the entity, so an event that does carry one
  // still opens that particular record.
  const eventRoute = EVENT_ROUTES[String(data.event_type || "").toUpperCase()];
  if (eventRoute) {
    return {
      pathname: eventRoute.pathname,
      params: eventRoute.params(originScreen || undefined),
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
