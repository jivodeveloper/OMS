// Route shell only — see payment-tracking.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import DepositDetailsScreen from "@/src/features/payments/DepositDetailsScreen";

/**
 * Detail for one bank deposit. Reachable by deep link, so it carries its own
 * guard rather than trusting whichever list opened it.
 */
export default function DepositDetailsRoute() {
  return (
    <ScreenGuard screen="payments/deposit-details">
      <DepositDetailsScreen />
    </ScreenGuard>
  );
}
