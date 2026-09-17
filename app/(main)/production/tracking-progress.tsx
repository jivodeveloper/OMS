// Route shell only — see tracking.tsx.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import ProductionProgressScreen from "@/src/features/production/screens/ProductionProgressScreen";

/** How far one order has got, and who it is waiting on. */
export default function ProductionProgressRoute() {
  return (
    <ScreenGuard screen="production/tracking-progress">
      <ProductionProgressScreen />
    </ScreenGuard>
  );
}
