// Route shell only — the screen lives in src/features/backdate/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import BackDateCreateScreen from "@/src/features/backdate/screens/BackDateCreateScreen";

/** Raise a request for temporary back-posting rights in SAP. */
export default function BackDateCreateRoute() {
  return (
    <ScreenGuard screen="backdate/create">
      <BackDateCreateScreen />
    </ScreenGuard>
  );
}
