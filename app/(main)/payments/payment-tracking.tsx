// Route shell only — the screen lives in src/features/payments so its helpers
// aren't picked up by Expo Router as navigable routes.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import PaymentTrackingScreen from "@/src/features/payments/PaymentTrackingScreen";

/**
 * Payment tracking — one screen, two audiences.
 *
 *   creator  -> their own receipts ("where has my entry got to")
 *   approver -> everything they can act on (this replaced Payment Requests)
 *
 * `mine` is deliberately NOT passed: the screen derives the scope from the
 * caller's action permissions. Passing it here would pin every user to their
 * own entries and leave an approver with an empty queue.
 */
export default function PaymentTrackingRoute() {
  return (
    <ScreenGuard screen="payments/payment-tracking">
      <PaymentTrackingScreen kind="PAYMENT" />
    </ScreenGuard>
  );
}
