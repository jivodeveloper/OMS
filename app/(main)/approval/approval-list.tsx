// Route shell only. The feature lives in src/features/approval so its
// components/hooks/data aren't picked up by Expo Router as navigable routes —
// every .tsx under app/ becomes a URL.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ApprovalListScreen from "@/src/features/approval/screens/ApprovalListScreen";

export default function ApprovalListRoute() {
  return (
    <ScreenGuard screen="approval/approval-list">
      <ApprovalListScreen />
    </ScreenGuard>
  );
}
