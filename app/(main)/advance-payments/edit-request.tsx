// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceEditScreen from "@/src/features/advancePayments/screens/AdvanceEditScreen";

/**
 * Editing is opened by whoever the server says may edit — the creator, and an
 * approver correcting a request in place. `can.edit` decides per request; this
 * only opens the screen.
 */
export default function AdvancePaymentsEditRoute() {
  return (
    <ScreenGuard screen="advance-payments/edit-request">
      <AdvanceEditScreen />
    </ScreenGuard>
  );
}
