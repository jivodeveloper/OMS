// Route shell only — see payment-tracking.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import PaymentTrackingScreen from "@/src/features/payments/PaymentTrackingScreen";

/** Deposit tracking — a creator follows their own deposits through approval. */
export default function DepositTrackingRoute() {
  return (
    <ScreenGuard screen="payments/deposit-tracking">
      <PaymentTrackingScreen kind="DEPOSIT" />
    </ScreenGuard>
  );
}
