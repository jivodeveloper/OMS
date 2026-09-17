// Route shell only — the screen lives in src/features/backdate/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import BackDateDetailsScreen from "@/src/features/backdate/screens/BackDateDetailsScreen";

/**
 * What one request asked for — and, for the approver holding it, the Approve
 * and Reject actions. Reachable by deep link and from a push notification, so
 * it carries its own guard rather than trusting whichever list opened it.
 */
export default function BackDateDetailsRoute() {
  return (
    <ScreenGuard screen="backdate/tracking-details">
      <BackDateDetailsScreen />
    </ScreenGuard>
  );
}
