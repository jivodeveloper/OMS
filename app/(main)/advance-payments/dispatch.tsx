// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceDispatchScreen from "@/src/features/advancePayments/screens/AdvanceDispatchScreen";

/**
 * Send Bills & POs: SAP's open documents, handed to whoever raises the request.
 *
 * Its own permission (`Advance_Payment_Dispatch`): sending work to someone is
 * not the same job as raising a request or approving one, and the server issues
 * the key separately.
 */
export default function AdvancePaymentsDispatchRoute() {
  return (
    <ScreenGuard screen="advance-payments/dispatch">
      <AdvanceDispatchScreen />
    </ScreenGuard>
  );
}
