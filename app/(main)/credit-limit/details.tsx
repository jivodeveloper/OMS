// Route shell only — the screen lives in src/features/creditLimit/.
import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import CreditLimitDetailsScreen from "@/src/features/creditLimit/screens/CreditLimitDetailsScreen";

/**
 * One request. Reached from a list card or a deep link, never the drawer.
 *
 * Whether it offers a decision is the SERVER's answer — the stage's effective
 * user — not this route's: the guard only decides whether it may open at all.
 */
export default function CreditLimitDetailsRoute() {
  return (
    <ScreenGuard screen="credit-limit/details">
      <CreditLimitDetailsScreen />
    </ScreenGuard>
  );
}
