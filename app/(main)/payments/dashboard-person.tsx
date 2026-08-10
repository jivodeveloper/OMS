// Route shell only — see dashboard.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import PersonDetailScreen from "@/src/features/payments/dashboard/PersonDetailScreen";

/**
 * One participant's collection history, opened from the dashboard list.
 *
 * Same `Payments_Dashboard` grant as the dashboard itself: this is the same
 * company-wide data, narrowed to one person.
 */
export default function PaymentsDashboardPersonRoute() {
  return (
    <ScreenGuard screen="payments/dashboard-person">
      <PersonDetailScreen />
    </ScreenGuard>
  );
}
