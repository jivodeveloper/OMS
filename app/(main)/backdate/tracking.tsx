// Route shell only — the screen lives in src/features/backdate/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import BackDateTrackingScreen from "@/src/features/backdate/screens/BackDateTrackingScreen";

/**
 * One list for both sides of BackDate.
 *
 * A requester sees the requests they raised; an approver sees only what is
 * awaiting their decision. Somebody holding both keys sees both, merged. The
 * screen decides from the permission keys, so there is no mode to pick.
 */
export default function BackDateTrackingRoute() {
  return (
    <ScreenGuard screen="backdate/tracking">
      <BackDateTrackingScreen />
    </ScreenGuard>
  );
}
