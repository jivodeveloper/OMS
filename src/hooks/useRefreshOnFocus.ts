import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

import { createFocusTracker } from "./focusRefresh";

/**
 * Re-read this screen's data whenever the user comes back to it.
 *
 * Every list, details and progress screen in the app should use this. A
 * screen that fetches once in `useEffect` keeps that first answer forever, so
 * approving on a details page left the list behind it reading "Pending" and
 * an edited request showed its old values until the app was restarted.
 *
 * The first focus is skipped — see `focusRefresh.ts` for why — so this costs
 * nothing on open and one request per return.
 *
 * `reload` should be the QUIET form of the screen's loader wherever the
 * screen has one: the data is already on screen, and replacing it with a
 * full-page spinner on every return makes navigating back feel broken. A
 * failure inside it is swallowed here rather than left as an unhandled
 * rejection; the loader itself owns showing the error.
 *
 * @param reload  what to call. May be async.
 * @param enabled pass false while the screen has nothing to load yet (no id,
 *                no permission decided); focus is still counted, so the first
 *                real focus after it becomes enabled does not double-fetch.
 */
export function useRefreshOnFocus(
  reload: () => void | Promise<void>,
  enabled: boolean = true,
) {
  const tracker = useRef(createFocusTracker());
  // Read through a ref so a `reload` rebuilt on every render — the common
  // case, since most are `useCallback`s over changing filters — does not tear
  // down and re-run the focus effect.
  const latest = useRef(reload);
  latest.current = reload;

  useFocusEffect(
    useCallback(() => {
      if (!tracker.current.shouldReload()) return;
      if (!enabled) return;
      void Promise.resolve(latest.current()).catch(() => undefined);
    }, [enabled]),
  );
}

export default useRefreshOnFocus;
