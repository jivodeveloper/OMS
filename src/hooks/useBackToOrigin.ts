import { useCallback } from "react";
import { router, usePathname, useLocalSearchParams } from "expo-router";

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
 * WHAT DECIDES WHERE BACK GOES, in order:
 *
 * 1. The `from` param the push itself carried. This is the only answer that
 *    cannot be wrong: the page that opened this one named itself, so Back
 *    returns there whatever the navigator thinks its history is. It is the
 *    same param the header arrow has always read (`app/(main)/_layout.tsx`),
 *    which is what keeps the two buttons agreeing — a list that sets it moves
 *    both, a list that forgets it moves neither.
 * 2. expo-router's history, which knows what the drawer does not.
 * 3. `fallback` — the screen was opened by a deep link or a notification tap
 *    and there is genuinely nothing behind it.
 *
 * @param fallback where to go when nothing else answers. Left out, Back is
 *   handed on to the system and the app exits, which is right on a home page.
 */
export default function useBackToOrigin(fallback?: string) {
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const raw = Array.isArray(params.from) ? params.from[0] : params.from;
  // Route NAME ("advance-payments/tracking") is the convention every module
  // already passes; a full pathname is accepted so neither form is a trap.
  const from = raw ? (raw.startsWith("/") ? raw : `/(main)/${raw}`) : "";

  useAndroidBackOverride(
    useCallback(() => {
      if (from) {
        // `replace`, not `push`: this screen is being left, and a push would
        // leave a Back on the list that comes straight back into it.
        router.replace(from as never);
        return true;
      }
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      if (fallback) {
        router.replace(fallback as never);
        return true;
      }
      return false;
    }, [from, fallback]),
  );
}

/**
 * This screen's route name, to hand to the next one as `from`.
 *
 * `usePathname()` gives "/advance-payments/tracking" — the route name with a
 * leading slash and the `(main)` group already stripped, which is exactly the
 * form the header arrow and the hook above expect once the slash is gone.
 * Taking it from the router rather than writing it out is what makes one list
 * component serve two routes (Tracking and Approval) and send Back to the one
 * the user actually came from.
 */
export function useOriginName(): string {
  return usePathname().replace(/^\/+/, "");
}
