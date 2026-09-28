// Route shell only — the screen lives in src/features/advancePayments/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import AdvanceCreateScreen from "@/src/features/advancePayments/screens/AdvanceCreateScreen";

export default function AdvancePaymentsCreateRoute() {
  return (
    <ScreenGuard screen="advance-payments/create">
      <AdvanceCreateScreen />
    </ScreenGuard>
  );
}
