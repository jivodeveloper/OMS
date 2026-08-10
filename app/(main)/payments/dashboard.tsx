// Route shell only — the screen lives in src/features/payments/dashboard so its
// helpers aren't picked up by Expo Router as navigable routes.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import PaymentsDashboardScreen from "@/src/features/payments/dashboard/PaymentsDashboardScreen";

/**
 * Payments Dashboard — analytics only.
 *
 * Gated on the `Payments_Dashboard` grant, which is separate from the four
 * payment ACTION permissions: recording or approving payments does not imply
 * seeing company-wide collection totals. The guard here hides the screen; the
 * server enforces the same key on every analytics endpoint.
 */
export default function PaymentsDashboardRoute() {
  return (
    <ScreenGuard screen="payments/dashboard">
      <PaymentsDashboardScreen />
    </ScreenGuard>
  );
}
