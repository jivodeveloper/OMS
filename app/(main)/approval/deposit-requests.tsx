// Route shell only — see payment-requests.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ApprovalListScreen from "@/src/features/approval/screens/ApprovalListScreen";

/** Bank deposit approval queue. Scoped to DEPOSIT by the guard and the query. */
export default function DepositRequestsRoute() {
  return (
    <ScreenGuard screen="approval/deposit-requests">
      <ApprovalListScreen documentType="DEPOSIT" />
    </ScreenGuard>
  );
}
