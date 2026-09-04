import React from "react";

import ScreenGuard from "@/src/components/common/ScreenGuard";
import PaymentTrackingScreen from "@/src/features/payments/PaymentTrackingScreen";

/**
 * The verification queue.
 *
 * Deliberately the SAME component as Payment Tracking, in verification mode:
 * the card, the search, the count bar and the empty state are identical, and
 * only the filter differs. A separate screen would have been a copy free to
 * drift, which is exactly how the two came to look different before.
 *
 * ScreenGuard resolves `payments/verification` through SCREEN_KEYS, so the
 * screen is closed to anyone without `Payments_Verify` however they arrive —
 * a deep link, a restored navigation state, or a permission revoked while
 * they sat on the page. Hiding the drawer item is not a control.
 */
export default function PaymentVerificationRoute() {
  return (
    <ScreenGuard screen="payments/verification">
      <PaymentTrackingScreen kind="PAYMENT" verification />
    </ScreenGuard>
  );
}
