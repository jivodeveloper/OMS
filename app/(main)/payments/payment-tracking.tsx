// Route shell only — the screen lives in src/features/payments so its helpers
// aren't picked up by Expo Router as navigable routes.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import PaymentTrackingScreen from "@/src/features/payments/PaymentTrackingScreen";

/**
 * Payment tracking — a creator follows their own receipts through approval.
 * Scoped to the caller's own entries (`mine`), which is the point: this answers
 * "where has my entry got to", not "what is everyone doing".
 */
export default function PaymentTrackingRoute() {
  return (
    <ScreenGuard screen="payments/payment-tracking">
      <PaymentTrackingScreen kind="PAYMENT" mine />
    </ScreenGuard>
  );
}
