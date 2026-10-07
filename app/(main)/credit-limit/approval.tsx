// Route shell only — the screen lives in src/features/creditLimit/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import CreditLimitListScreen from "@/src/features/creditLimit/screens/CreditLimitListScreen";

/**
 * The approval desk, pinned to that side.
 *
 * The same list as tracking, opened on the desk — for a deep link or a push
 * that means "this is waiting on you", which must not land on My Requests.
 */
export default function CreditLimitApprovalRoute() {
  return (
    <ScreenGuard screen="credit-limit/approval">
      <CreditLimitListScreen scope="desk" />
    </ScreenGuard>
  );
}
