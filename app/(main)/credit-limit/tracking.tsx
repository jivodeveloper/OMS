// Route shell only — the screen lives in src/features/creditLimit/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import CreditLimitListScreen from "@/src/features/creditLimit/screens/CreditLimitListScreen";

/**
 * The module's list, on whichever side the user belongs to.
 *
 * NO SCOPE IS FORCED HERE: an approver opens on their desk, a requester on
 * their own requests, and somebody holding both keys switches at the top.
 */
export default function CreditLimitTrackingRoute() {
  return (
    <ScreenGuard screen="credit-limit/tracking">
      <CreditLimitListScreen />
    </ScreenGuard>
  );
}
