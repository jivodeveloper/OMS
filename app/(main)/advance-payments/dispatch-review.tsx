// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceDispatchReviewScreen from "@/src/features/advancePayments/screens/AdvanceDispatchReviewScreen";

/**
 * Step two of Send Bills & POs: read back what was ticked, say who it goes to.
 *
 * The same permission as the page that opens it — reached from its Next button,
 * never from the drawer.
 */
export default function AdvancePaymentsDispatchReviewRoute() {
  return (
    <ScreenGuard screen="advance-payments/dispatch-review">
      <AdvanceDispatchReviewScreen />
    </ScreenGuard>
  );
}
