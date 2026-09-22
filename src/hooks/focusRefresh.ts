/**
 * When a screen coming back into view should re-read its data.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROBLEM
 * ─────────────────────────────────────────────────────────────────────────
 * A screen that fetches in `useEffect` fetches ONCE. Navigating away and back
 * does not unmount it, so it keeps whatever it read the first time. That is
 * why an entry approved on the details screen still read "Pending" on the
 * tracking list behind it, and why a just-edited request showed its old
 * values: nothing was wrong with the data, nobody asked for it again.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE FIRST FOCUS IS SKIPPED
 * ─────────────────────────────────────────────────────────────────────────
 * A screen is focused as it mounts, at the same moment its own load effect
 * runs. Reloading on that focus fires two identical requests for every screen
 * open in the app — doubling the traffic to prove a point about freshness.
 * The first focus is therefore consumed, and every focus after it — which is
 * exactly the "came back from somewhere" case — reloads.
 *
 * Kept here as a plain object, free of React, so the rule can be asserted
 * rather than inferred from a `useRef` in a component. `useRefreshOnFocus`
 * owns the React side; this owns only the question "reload now?".
 */

export interface FocusTracker {
  /**
   * Call on every focus. False the first time (the mount already loaded),
   * true every time after.
   */
  shouldReload: () => boolean;
  /**
   * Forget that the screen was ever focused, so the NEXT focus counts as a
   * mount again.
   *
   * For a screen whose identity changes underneath it — a details page opened
   * for a different id — where the next load is a first load, not a refresh.
   */
  reset: () => void;
}

export function createFocusTracker(): FocusTracker {
  let focusedBefore = false;
  return {
    shouldReload: () => {
      if (!focusedBefore) {
        focusedBefore = true;
        return false;
      }
      return true;
    },
    reset: () => {
      focusedBefore = false;
    },
  };
}
