// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceProgressScreen from "@/src/features/advancePayments/screens/AdvanceProgressScreen";

/**
 * The approval timeline for one request. Reached from a list card or a deep
 * link, so it carries its own guard rather than trusting whichever list opened
 * it.
 */
export default function AdvancePaymentsProgressRoute() {
  return (
    <ScreenGuard screen="advance-payments/tracking-progress">
      <AdvanceProgressScreen />
    </ScreenGuard>
  );
}
