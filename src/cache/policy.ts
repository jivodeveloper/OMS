/**
 * Cache policy for the API layer.
 *
 * Deliberately an ALLOWLIST: an endpoint is only cached when it matches a rule
 * here. Anything unlisted keeps the exact pre-cache behaviour (straight to the
 * network), so adding this layer cannot silently change how an existing screen
 * behaves. TTLs are tuned per data family — master data is stable and can be
 * held for minutes, order state is volatile and is held for seconds.
 *
 * Note every cached entry is served stale-while-revalidate: a stale hit is
 * returned immediately AND refreshed in the background, so the TTL controls how
 * often we re-hit the network, never whether the user waits.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

type CacheRule = { pattern: RegExp; ttlMs: number };

const CACHEABLE_GET_RULES: CacheRule[] = [
  // ── Master / reference data: changes rarely ─────────────────────────────
  { pattern: /^\/auth\/companies\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/auth\/mainGroup\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/auth\/states\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/auth\/roles\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/orders\/branch\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/orders\/dispatches\//, ttlMs: 10 * MINUTE },
  { pattern: /^\/orders\/parties\//, ttlMs: 5 * MINUTE },
  { pattern: /^\/sap\/parties\//, ttlMs: 5 * MINUTE },
  { pattern: /^\/orders\/schemes\//, ttlMs: 5 * MINUTE },
  { pattern: /^\/orders\/scheme-products\//, ttlMs: 5 * MINUTE },
  { pattern: /^\/orders\/flow-config\//, ttlMs: 5 * MINUTE },
  { pattern: /^\/orders\/party-flow-config\//, ttlMs: 5 * MINUTE },

  // ── Party assignments: admin can change these mid-session ───────────────
  // Short TTL so newly-assigned items surface quickly; the Create screen's
  // Refresh button additionally forces a bypass.
  { pattern: /^\/orders\/party-products\//, ttlMs: 60 * SECOND },

  // ── User / session ──────────────────────────────────────────────────────
  { pattern: /^\/auth\/profile\//, ttlMs: 2 * MINUTE },
  { pattern: /^\/auth\/users\/list\//, ttlMs: 2 * MINUTE },
  { pattern: /^\/auth\/users\/\d+\/$/, ttlMs: 2 * MINUTE },
  { pattern: /^\/auth\/users\/\d+\/page-permissions\//, ttlMs: 2 * MINUTE },

  // ── Templates ───────────────────────────────────────────────────────────
  { pattern: /^\/orders\/templates\//, ttlMs: 2 * MINUTE },

  // ── Volatile order state ────────────────────────────────────────────────
  { pattern: /^\/orders\/list\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/ordersbyuser\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/orderdetailsbyid\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/\d+\/orderdetails\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/\d+\/orderlogs\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/notifications\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/quotation-overview\//, ttlMs: 30 * SECOND },
  { pattern: /^\/orders\/quotation-status\//, ttlMs: 30 * SECOND },
  { pattern: /^\/sap\/quotation-log\//, ttlMs: 60 * SECOND },
];

/** TTL for a cacheable GET, or null when the endpoint must never be cached. */
export const getGetCacheTtl = (endpoint: string): number | null => {
  for (const rule of CACHEABLE_GET_RULES) {
    if (rule.pattern.test(endpoint)) return rule.ttlMs;
  }
  return null;
};

// Families that any order-state mutation makes stale.
const ORDER_STATE_PREFIXES = [
  "/orders/list/",
  "/orders/ordersbyuser/",
  "/orders/notifications/",
  "/orders/quotation-overview/",
  "/orders/quotation-status/",
];

/**
 * Which cache prefixes a mutation invalidates. Returning prefixes (rather than
 * exact keys) lets one rule drop every filtered variant of a list — e.g. all of
 * `/orders/list/?billing=true`, `?approval_pending=true`, `?status=…`.
 */
export const getInvalidationPrefixes = (
  method: string,
  endpoint: string,
): string[] => {
  const upper = method.toUpperCase();
  if (upper === "GET") return [];

  const prefixes = new Set<string>();

  // Anything that acts on a specific order also invalidates that order's own
  // detail + timeline, so an approval/rejection shows up immediately.
  const orderId = endpoint.match(/^\/orders\/(\d+)\//)?.[1];
  if (orderId) {
    prefixes.add(`/orders/orderdetailsbyid/${orderId}`);
    prefixes.add(`/orders/${orderId}/orderdetails/`);
    prefixes.add(`/orders/${orderId}/orderlogs/`);
    prefixes.add(`/sap/quotation-log/${orderId}`);
  }

  // Create / status change / approve / reject / cancel / delete-draft.
  if (
    /^\/orders\/create\//.test(endpoint) ||
    /^\/orders\/\d+\/(update-status|approve|reject|cancel-quotation|delete-draft)\//.test(
      endpoint,
    ) ||
    /^\/sap\/approve-sales-order\//.test(endpoint)
  ) {
    ORDER_STATE_PREFIXES.forEach((p) => prefixes.add(p));
    prefixes.add("/orders/templates/");
  }

  // Notification read/dismiss.
  if (/^\/orders\/notifications\//.test(endpoint)) {
    prefixes.add("/orders/notifications/");
  }

  // Scheme authoring.
  if (/^\/orders\/create[-_]scheme/.test(endpoint)) {
    prefixes.add("/orders/schemes/");
    prefixes.add("/orders/scheme-products/");
  }

  // Order-flow configuration.
  if (/^\/orders\/(party-)?flow-config\//.test(endpoint)) {
    prefixes.add("/orders/flow-config/");
    prefixes.add("/orders/party-flow-config/");
  }

  // User administration.
  if (/^\/auth\/users\//.test(endpoint)) {
    prefixes.add("/auth/users/");
    prefixes.add("/auth/profile/");
  }

  return [...prefixes];
};
