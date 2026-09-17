// Route shell only — the screen lives in src/features/backdate/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import BackDateProgressScreen from "@/src/features/backdate/screens/BackDateProgressScreen";

/** How far one request has got: the stage rail and every remark against it. */
export default function BackDateProgressRoute() {
  return (
    <ScreenGuard screen="backdate/tracking-progress">
      <BackDateProgressScreen />
    </ScreenGuard>
  );
}
