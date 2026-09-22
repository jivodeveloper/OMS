/**
 * The only rule in the app that can sign a user out.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN FILE
 * ─────────────────────────────────────────────────────────────────────────
 * There is exactly ONE automatic logout path: a token refresh that the server
 * REJECTED. Everything else — a dropped connection, a timeout, a restarting
 * server, a 500, an unreadable device store — must keep the session, because
 * none of those say anything about whether the user's token is still good.
 *
 * Getting that wrong is invisible in testing and infuriating in use: the app
 * signs people out mid-task whenever the network hiccups, and it looks like a
 * random bug. So the rule lives here, free of React Native and `fetch`, and
 * is asserted directly — see `sessionPolicy.test.ts`.
 *
 * The default direction is DELIBERATE. Anything unrecognised keeps the
 * session. The cost of keeping a dead session is one failed request and a
 * retry; the cost of ending a live one is the user losing what they were
 * doing.
 */

/**
 * Why a refresh attempt failed.
 *
 * `invalid` — the server rejected the refresh token. The session is over.
 * `network` — anything else. The tokens are kept and the request just fails.
 */
export type RefreshFailure = "invalid" | "network";

/** The shape the API layer produces for a response; `status` is absent for
 *  network-level failures (offline, DNS, timeout, aborted). */
export interface RefreshResponseLike {
  status?: number;
}

/**
 * HTTP statuses from `/auth/refresh/` that mean the token itself was refused.
 *
 * 401 is the documented answer from SimpleJWT for an expired, blacklisted or
 * forged refresh token. 400 is what it returns when the token is malformed or
 * missing from the body. Both mean a new one will never be issued for it.
 *
 * Deliberately NOT here:
 *   403 — a permission decision about the endpoint, not about the token.
 *   426 — the force-update block; the session is fine, the app is old.
 *   429 — rate limiting. Retrying later works.
 *   5xx — the server is broken or restarting, which is the single most common
 *         cause of a logout storm: every open app refreshing at once during a
 *         deploy would be signed out together.
 */
const TOKEN_REFUSED_STATUSES = new Set([400, 401]);

/**
 * Classify a failed `/auth/refresh/` response.
 *
 * Only call this once a refresh is known to have produced no access token.
 */
export function refreshFailureReason(
  result: RefreshResponseLike | null | undefined,
): RefreshFailure {
  const status = result?.status;
  if (typeof status !== "number") {
    // No status at all — the request never reached a server that answered.
    return "network";
  }
  return TOKEN_REFUSED_STATUSES.has(status) ? "invalid" : "network";
}

/** True when this failure should end the session and route to login. */
export function endsSession(reason: RefreshFailure): boolean {
  return reason === "invalid";
}

/**
 * What a missing refresh token means, given HOW it came to be missing.
 *
 * THE DISTINCTION THAT MATTERS. `null` from the device store means there is
 * genuinely no session to refresh — the user is signed out and should be sent
 * to login. A store that THREW means the device could not be read, which says
 * nothing about the session; treating that as a rejected token signs out a
 * user whose session is perfectly good, and a transient storage error is
 * exactly the sort of thing that happens once and never reproduces.
 */
export function missingTokenReason(cause: "absent" | "unreadable"): RefreshFailure {
  return cause === "absent" ? "invalid" : "network";
}
