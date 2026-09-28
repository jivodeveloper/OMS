import { useCallback } from "react";
import { router } from "expo-router";

import useAndroidBackOverride from "./useAndroidBackOverride";

/**
 * Android's Back leaves a pushed screen the way its header arrow does.
 *
 * WHY A SCREEN HAS TO ASK FOR THIS. Every page under `(main)` is a DRAWER
 * screen, and pushing from one drawer screen to another builds no navigator
 * stack — so the drawer's own back handling has nothing to pop and falls back
 * to its initial route. That is why Back from a detail page landed on the
 * dashboard instead of on the list it was opened from, however deep the user
 * had gone. The header arrow already works around it; the hardware button and
 * the back gesture did not.
 *
 * expo-router keeps the history the navigator does not, and `router.back()`
 * follows it — WITH the params, so going back to a detail page from a progress
 * page returns to that request rather than to an empty screen.
 *
 * @param fallback where to go when there is genuinely nothing behind us: the
 *   screen was opened by a deep link or a notification tap. Left out, Back is
 *   handed on to the system and the app exits, which is right on a home page.
 */
export default function useBackToOrigin(fallback?: string) {
  useAndroidBackOverride(
    useCallback(() => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      if (fallback) {
        // `replace`, not `push`: there is nothing behind this screen, and a
        // push would leave a Back that comes straight back to it.
        router.replace(fallback as never);
        return true;
      }
      return false;
    }, [fallback]),
  );
}
