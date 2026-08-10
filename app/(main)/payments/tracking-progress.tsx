// Route shell only — see src/features/payments/TrackingProgressScreen.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import TrackingProgressScreen from "@/src/features/payments/TrackingProgressScreen";

/**
 * Approval timeline for one payment or deposit. Reachable by deep link, so it
 * carries its own guard rather than trusting whichever list opened it.
 */
export default function TrackingProgressRoute() {
  return (
    <ScreenGuard screen="payments/tracking-progress">
      <TrackingProgressScreen />
    </ScreenGuard>
  );
}
