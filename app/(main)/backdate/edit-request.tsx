// Route shell only — the screen lives in src/features/backdate/.
import React from "react";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import BackDateEditScreen from "@/src/features/backdate/screens/BackDateEditScreen";

/**
 * Correct a request that has not been decided yet.
 *
 * Open to the requester and to the approver currently holding it — the latter
 * is how a request SAP refused gets fixed and approved again. The screen is
 * gated on either key; whether THIS request may be edited is the server's
 * `can_edit`, checked when it loads.
 */
export default function BackDateEditRoute() {
  return (
    <ScreenGuard screen="backdate/edit-request">
      <BackDateEditScreen />
    </ScreenGuard>
  );
}
