// Route shell only — the screen lives in src/features/production/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ProductionTrackingScreen from "@/src/features/production/screens/ProductionTrackingScreen";

/**
 * One list for both sides of Production Orders.
 *
 * Nobody in OMS raises these — SAP is the point of origin — so a viewer sees
 * what the sync has found, and an approver additionally sees what is awaiting
 * their decision, flagged on the card. The screen decides from the permission
 * keys, so there is no mode to pick.
 */
export default function ProductionTrackingRoute() {
  return (
    <ScreenGuard screen="production/tracking">
      <ProductionTrackingScreen />
    </ScreenGuard>
  );
}
