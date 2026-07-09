/**
 * Cross-flow gate for notification deep-links.
 *
 * `useLastNotificationResponse()` keeps returning the notification that LAUNCHED
 * the app for the whole session — including after a login-required flow. That's
 * wrong: a notification tapped while the user was NOT authenticated must not
 * deep-link to the order once they finally log in.
 *
 * When the app starts UNAUTHENTICATED, we record that launch notification's key
 * here (module-level, so it survives the auth screens and the `(main)` layout
 * remount). The `(main)` deep-link handler then skips exactly that one launch
 * notification, while still processing any fresh taps during the session.
 */

// There is only ever ONE relevant launch notification per app process (the one
// that opened the app while unauthenticated), so we track a single key rather
// than a growing collection. This makes unbounded growth structurally
// impossible even if suppress() were called repeatedly.
let pendingSuppressedKey: string | null = null;

/** Mark a launch notification (by its dedupe key) as "do not deep-link". */
export const suppressPendingNotification = (key: string | null | undefined) => {
  if (key) pendingSuppressedKey = key;
};

/**
 * Whether this notification was suppressed by a login-required flow. Single-use:
 * the pending key is CONSUMED on check, so it blocks exactly the one stale
 * launch notification and never accumulates. Fresh keys (that don't match) are
 * left untouched and always allowed through.
 */
export const isNotificationSuppressed = (
  key: string | null | undefined,
): boolean => {
  if (!key || key !== pendingSuppressedKey) return false;
  pendingSuppressedKey = null; // consumed
  return true;
};
