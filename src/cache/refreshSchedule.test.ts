/**
 * When a full refresh is due.
 *
 * The rule is one comparison, but it decides how stale the app is allowed to
 * look — and two of its edges are easy to get wrong: a device that has been
 * closed for hours must refresh the moment it opens rather than waiting out an
 * interval that already elapsed, and a clock that has gone backwards must not
 * put the app into a refresh loop.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FULL_REFRESH_EVERY_MS,
  REFRESH_CHECK_MS,
  fullRefreshIsDue,
} from "./refreshSchedule.ts";

const NOW = 1_800_000_000_000; // a fixed instant; the rule is relative
const MINUTE = 60 * 1000;

describe("the interval itself", () => {
  it("is ten minutes, matching the server's SAP cache", () => {
    assert.equal(FULL_REFRESH_EVERY_MS, 10 * MINUTE);
  });

  it("is checked far more often than it fires", () => {
    // The check is a number comparison; firing costs a round of network.
    assert.ok(REFRESH_CHECK_MS < FULL_REFRESH_EVERY_MS);
    assert.equal(REFRESH_CHECK_MS, MINUTE);
  });
});

describe("fullRefreshIsDue", () => {
  it("is not due immediately after a refresh", () => {
    assert.equal(fullRefreshIsDue(NOW, NOW), false);
  });

  it("is not due partway through the interval", () => {
    assert.equal(fullRefreshIsDue(NOW - 9 * MINUTE, NOW), false);
  });

  it("is due exactly on the interval", () => {
    assert.equal(fullRefreshIsDue(NOW - 10 * MINUTE, NOW), true);
  });

  it("is due once past it", () => {
    assert.equal(fullRefreshIsDue(NOW - 11 * MINUTE, NOW), true);
  });

  it("is due after the app has been closed for hours", () => {
    // THE COLD-START CASE. The timestamp is read off the disk, so the gap
    // counts the time the app was not running — the refresh happens on open
    // rather than ten minutes later.
    assert.equal(fullRefreshIsDue(NOW - 5 * 60 * MINUTE, NOW), true);
  });

  it("reads as due when it has never run on this device", () => {
    // The caller decides what to do about it: AuthContext starts the clock
    // instead of wiping, because there is nothing stale to discard yet.
    assert.equal(fullRefreshIsDue(0, NOW), true);
  });

  it("is NOT due when the clock has gone backwards", () => {
    // A corrected device clock, or a timestamp written under a different
    // timezone, leaves `lastRunAt` in the future. Treating that as due would
    // wipe the cache on every check until the clock caught up; waiting for the
    // next honest tick costs one stale interval at most.
    assert.equal(fullRefreshIsDue(NOW + 60 * MINUTE, NOW), false);
  });

  it("defaults to the current time when none is given", () => {
    assert.equal(fullRefreshIsDue(Date.now()), false);
    assert.equal(fullRefreshIsDue(Date.now() - 2 * FULL_REFRESH_EVERY_MS), true);
  });
});
