// Route shell only. The feature lives in src/features/approval so its
// components/hooks/data aren't picked up by Expo Router as navigable routes —
// every .tsx under app/ becomes a URL.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ApprovalListScreen from "@/src/features/approval/screens/ApprovalListScreen";

/**
 * Payment approval queue.
 *
 * Split from deposits so a payment approver is shown only what they can act
 * on — the guard and the query both scope to PAYMENT.
 */
export default function PaymentRequestsRoute() {
  return (
    <ScreenGuard screen="approval/payment-requests">
      <ApprovalListScreen documentType="PAYMENT" />
    </ScreenGuard>
  );
}
