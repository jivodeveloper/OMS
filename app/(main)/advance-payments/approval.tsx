// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceListScreen from "@/src/features/advancePayments/screens/AdvanceListScreen";

/**
 * The approval desk: the requests that are this user's to decide.
 *
 * THE SAME LIST AS TRACKING, on the other scope. Somebody who both raises and
 * approves needs them apart — "what became of what I asked for" and "what is
 * waiting on me" are different questions, and one merged list answers neither
 * cleanly. A user with only one of the two keys sees only that page, so the
 * split costs them nothing.
 */
export default function AdvancePaymentsApprovalRoute() {
  return (
    <ScreenGuard screen="advance-payments/approval">
      <AdvanceListScreen scope="desk" />
    </ScreenGuard>
  );
}
