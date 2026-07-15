import { clearCache, setCacheScope } from "./cacheStore";
import { invalidateQueries } from "./queryClient";

export { setCachePersistence, type CachePersistence } from "./persistence";
export { clearCache, setCacheScope } from "./cacheStore";
export { invalidateQueries, peekQuery, subscribeToQuery } from "./queryClient";

/**
 * Public cache API.
 *
 * Screens keep their existing fetch code — caching happens transparently inside
 * `api.get`. What a screen DOES need is a way to say "the user explicitly asked
 * for fresh data" (pull-to-refresh) or "this data just changed". Both are prefix
 * invalidations: drop the entries, and the very next fetch goes to the network.
 */

/** Cache key prefixes, grouped by data family. */
export const CacheKeys = {
  orderList: "/orders/list/",
  ordersByUser: "/orders/ordersbyuser/",
  orderDetail: "/orders/orderdetailsbyid/",
  notifications: "/orders/notifications/",
  quotationOverview: "/orders/quotation-overview/",
  quotationStatus: "/orders/quotation-status/",
  parties: "/orders/parties/",
  partyProducts: "/orders/party-products/",
  schemes: "/orders/schemes/",
  templates: "/orders/templates/",
  users: "/auth/users/",
  profile: "/auth/profile/",
} as const;

/** Everything that changes as orders move through the workflow. */
export const ORDER_DATA_PREFIXES: string[] = [
  CacheKeys.orderList,
  CacheKeys.ordersByUser,
  CacheKeys.orderDetail,
  CacheKeys.quotationOverview,
  CacheKeys.quotationStatus,
  "/orders/", // per-order detail/logs live under /orders/<id>/...
];

/**
 * Drop cached order data so the next fetch hits the network. Use for
 * pull-to-refresh on any order/approval list.
 */
export const refreshOrderData = () => invalidateQueries(ORDER_DATA_PREFIXES);

export const refreshNotifications = () =>
  invalidateQueries([CacheKeys.notifications]);

/** Volatile data refreshed when the app returns to the foreground. */
export const refreshLiveData = () =>
  invalidateQueries([...ORDER_DATA_PREFIXES, CacheKeys.notifications]);

/** Force the next party-products read to re-fetch (newly assigned items). */
export const refreshPartyProducts = () =>
  invalidateQueries([CacheKeys.partyProducts]);

/** Called on sign-in so one user can never read another's cached data. */
export const bindCacheToUser = (userId: string | number | null | undefined) =>
  setCacheScope(userId);

/** Called on sign-out — removes every cached payload from memory and disk. */
export const resetCache = () => clearCache();
