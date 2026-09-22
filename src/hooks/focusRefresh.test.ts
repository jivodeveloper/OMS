/**
 * The focus rule, asserted.
 *
 * Two failures are being guarded against at once, and they pull in opposite
 * directions: reload too eagerly and every screen fetches twice on open;
 * reload too little and an approved entry still reads "Pending".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFocusTracker } from "./focusRefresh.ts";

describe("createFocusTracker", () => {
  it("does NOT reload on the first focus", () => {
    // The mount's own load effect is running at that same moment; reloading
    // here means two identical requests for every screen in the app.
    assert.equal(createFocusTracker().shouldReload(), false);
  });

  it("reloads on every focus after the first", () => {
    // Coming back from a details page where something was approved. This is
    // the whole point: the list behind must not keep the pre-action data.
    const tracker = createFocusTracker();
    tracker.shouldReload();
    assert.equal(tracker.shouldReload(), true);
    assert.equal(tracker.shouldReload(), true);
    assert.equal(tracker.shouldReload(), true);
  });

  it("gives each screen its own count", () => {
    // Two trackers must not share state — a module-level flag would make the
    // second screen to mount skip nothing and the first skip twice.
    const a = createFocusTracker();
    const b = createFocusTracker();
    a.shouldReload();
    a.shouldReload();
    assert.equal(b.shouldReload(), false);
  });

  it("treats the focus after a reset as a mount again", () => {
    // A details screen reopened for a DIFFERENT id: its next load is a first
    // load of new data, not a refresh of what is on screen.
    const tracker = createFocusTracker();
    tracker.shouldReload();
    assert.equal(tracker.shouldReload(), true);
    tracker.reset();
    assert.equal(tracker.shouldReload(), false);
    assert.equal(tracker.shouldReload(), true);
  });

  it("is safe to reset before it has ever been focused", () => {
    const tracker = createFocusTracker();
    tracker.reset();
    assert.equal(tracker.shouldReload(), false);
  });
});
