// Route shell only — the screen lives in src/features/creditLimit/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import CreditLimitCreateScreen from "@/src/features/creditLimit/screens/CreditLimitCreateScreen";

/** Ask for a customer's SAP credit limit to be changed. */
export default function CreditLimitCreateRoute() {
  return (
    <ScreenGuard screen="credit-limit/create">
      <CreditLimitCreateScreen />
    </ScreenGuard>
  );
}
