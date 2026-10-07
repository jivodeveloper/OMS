// Route shell only — the screen lives in src/features/creditLimit/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import CreditLimitProgressScreen from "@/src/features/creditLimit/screens/CreditLimitProgressScreen";

/** Where the request has got to, and who has it now. */
export default function CreditLimitProgressRoute() {
  return (
    <ScreenGuard screen="credit-limit/progress">
      <CreditLimitProgressScreen />
    </ScreenGuard>
  );
}
