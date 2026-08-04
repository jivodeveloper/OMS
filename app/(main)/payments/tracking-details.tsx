// Route shell only — see payment-tracking.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import TrackingDetailsScreen from "@/src/features/payments/TrackingDetailsScreen";

/**
 * Detail for one payment or deposit. Reachable by deep link, so it carries its
 * own guard rather than trusting whichever list opened it.
 */
export default function TrackingDetailsRoute() {
  return (
    <ScreenGuard screen="payments/tracking-details">
      <TrackingDetailsScreen />
    </ScreenGuard>
  );
}
