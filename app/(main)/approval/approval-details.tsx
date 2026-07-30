// Route shell only. The feature lives in src/features/approval so its
// components/hooks/data aren't picked up by Expo Router as navigable routes.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ApprovalDetailsScreen from "@/src/features/approval/screens/ApprovalDetailsScreen";

export default function ApprovalDetailsRoute() {
  return (
    <ScreenGuard screen="approval/approval-details">
      <ApprovalDetailsScreen />
    </ScreenGuard>
  );
}
