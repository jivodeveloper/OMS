// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceDetailsScreen from "@/src/features/advancePayments/screens/AdvanceDetailsScreen";

/**
 * One request. Reached from a list card or a deep link, never from the drawer.
 *
 * Which buttons it offers is the server's `can` block, not this route's guess:
 * the guard only decides whether the screen may open at all.
 */
export default function AdvancePaymentsDetailsRoute() {
  return (
    <ScreenGuard screen="advance-payments/details">
      <AdvanceDetailsScreen />
    </ScreenGuard>
  );
}
