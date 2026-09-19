/**
 * When the app should throw its cached data away and read it again.
 *
 * Cached payloads are served stale-while-revalidate, so a long-lived session
 * can keep showing a party list, scheme or permission set that changed hours
 * ago. This decides when that stops.
 *
 * TEN MINUTES IS NOT ARBITRARY. It matches the server's own SAP cache
 * (`payments/bank_master.py: TTL = 600`), which is the slowest step between a
 * change made in SAP and a user seeing it. A shorter interval would only
 * re-read the same server-side cache; a longer one would hide data the server
 * had already refreshed.
 *
 * Kept in its own module, free of React and React Native, so the rule can be
 * asserted directly — see `refreshSchedule.test.ts`. `AuthContext` owns the
 * timer, the foreground listener and the actual reload; this owns only the
 * question "is one due?".
 */

/** How old cached data may get before it is thrown away. */
export const FULL_REFRESH_EVERY_MS = 10 * 60 * 1000;

/**
 * How often the app ASKS whether a refresh is due — not how often one happens.
 *
 * Comparing two numbers once a minute costs nothing, and it keeps the
 * catch-up after a long sleep within a minute of being due.
 */
export const REFRESH_CHECK_MS = 60 * 1000;

/** Where the last run is remembered, so it survives the app being closed. */
export const LAST_FULL_REFRESH_KEY = "oms.lastFullRefreshAt";

/**
 * True when the last full refresh is older than the interval.
 *
 * `lastRunAt` of 0 means "never run on this device", which reads as due —
 * the caller decides whether to act on that. `AuthContext` deliberately does
 * not: on a first run there is nothing stale to discard yet, and a wipe would
 * only make the first screen after login slower.
 *
 * A clock that has gone BACKWARDS (a device whose time was corrected, or a
 * timestamp written in a different timezone) gives a negative age and reads as
 * not due. That is the safe direction: the next honest tick refreshes, whereas
 * treating it as due would wipe the cache on every check until the clock
 * caught up.
 */
export const fullRefreshIsDue = (
  lastRunAt: number,
  now: number = Date.now(),
): boolean => now - lastRunAt >= FULL_REFRESH_EVERY_MS;
