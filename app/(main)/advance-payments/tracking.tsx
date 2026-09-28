// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceListScreen from "@/src/features/advancePayments/screens/AdvanceListScreen";

/**
 * The module's list, on whichever side the user belongs to.
 *
 * NO SCOPE IS FORCED HERE. An approver opens on their desk — work waiting on
 * them outranks the requests they raised — and a requester on their own
 * requests, which is the only side they have. Somebody holding both keys can
 * switch at the top, and Advance Approvals in the drawer pins the desk side.
 */
export default function AdvancePaymentsTrackingRoute() {
  return (
    <ScreenGuard screen="advance-payments/tracking">
      <AdvanceListScreen />
    </ScreenGuard>
  );
}
