/**
 * "Do not sign me out" — as assertions.
 *
 * Every case here is a way the app could end a session it had no business
 * ending. They are cheap to get wrong and expensive to notice: the user is on
 * the login screen, their work is gone, and the logs show a successful
 * request a second earlier.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  endsSession,
  missingTokenReason,
  refreshFailureReason,
} from "./sessionPolicy.ts";

const keepsSession = (result: unknown) =>
  !endsSession(refreshFailureReason(result as never));

describe("a rejected refresh token ends the session", () => {
  it("401 — expired, blacklisted, or forged", () => {
    assert.equal(refreshFailureReason({ status: 401 }), "invalid");
    assert.equal(endsSession("invalid"), true);
  });

  it("400 — malformed or missing from the body", () => {
    assert.equal(refreshFailureReason({ status: 400 }), "invalid");
  });
});

describe("NOTHING else ends the session", () => {
  it("not being offline", () => {
    // No status at all: the request never reached a server that answered.
    // This is the common one — a lift, a tunnel, a dropped wifi handover.
    assert.ok(keepsSession({ success: false, message: "Network request failed" }));
    assert.ok(keepsSession({}));
    assert.ok(keepsSession(null));
    assert.ok(keepsSession(undefined));
  });

  it("not a timeout", () => {
    assert.ok(keepsSession({ success: false, message: "Request timed out" }));
  });

  it("not a server that is down or restarting", () => {
    // THE LOGOUT STORM THIS PREVENTS: during a deploy every open app refreshes
    // against a 502 at once. Classifying that as a dead token signs out the
    // entire company in the same minute.
    for (const status of [500, 502, 503, 504]) {
      assert.ok(keepsSession({ status }), String(status));
    }
  });

  it("not a rate limit", () => {
    // Retrying later works, so the token is fine.
    assert.ok(keepsSession({ status: 429 }));
  });

  it("not the force-update block", () => {
    // 426 says the APP is too old. The session is untouched, and signing the
    // user out would leave them unable to log back in until they update.
    assert.ok(keepsSession({ status: 426 }));
  });

  it("not a 403", () => {
    // A permission decision about the endpoint, not about the token.
    assert.ok(keepsSession({ status: 403 }));
  });

  it("not a 404 from a misconfigured base URL", () => {
    // Pointing the app at the wrong host must fail loudly, not quietly sign
    // everyone out.
    assert.ok(keepsSession({ status: 404 }));
  });

  it("not any unrecognised status", () => {
    // The default direction is deliberate: keeping a dead session costs one
    // failed request, ending a live one costs the user their work.
    for (const status of [0, 204, 301, 418, 451, 599]) {
      assert.ok(keepsSession({ status }), String(status));
    }
  });
});

describe("a missing refresh token", () => {
  it("ends the session when there genuinely is not one", () => {
    assert.equal(missingTokenReason("absent"), "invalid");
  });

  it("does NOT end the session when the store could not be read", () => {
    // THE BUG THIS PREVENTS. A device store that throws says nothing about
    // whether the session is good — and a transient read failure is exactly
    // the sort of thing that happens once and never reproduces. Treating it
    // as a rejected token signs out a user who was fine.
    assert.equal(missingTokenReason("unreadable"), "network");
    assert.equal(endsSession(missingTokenReason("unreadable")), false);
  });
});
