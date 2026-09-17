// Route shell only — see tracking.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ProductionDetailsScreen from "@/src/features/production/screens/ProductionDetailsScreen";

/**
 * One production order, and the decision when it is the viewer's to make.
 *
 * Reachable by deep link — a push notification lands here — so it carries its
 * own guard rather than trusting whichever list opened it.
 */
export default function ProductionDetailsRoute() {
  return (
    <ScreenGuard screen="production/tracking-details">
      <ProductionDetailsScreen />
    </ScreenGuard>
  );
}
