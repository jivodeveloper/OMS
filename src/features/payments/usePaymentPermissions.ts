import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { usePathname } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { PAYMENT_ACTIONS, hasPaymentAction } from "@/src/constants/pages";
import paymentsService, {
  type PaymentPermissions,
} from "@/src/services/payments.service";

/**
 * What the signed-in user may do in the payments module.
 *
 * Permissions change while the app is running — an admin can grant or revoke
 * one at any moment — so this must never be resolved once and cached for the
 * session. Two things keep it live:
 *
 *   1. The SERVER is asked (`/payments/my-permissions/`). It is the only place
 *      that knows the full rule (admin implies everything; roles confer keys;
 *      per-user grants add more). Re-deriving that on the client would drift.
 *   2. It re-fetches on navigation and on app foreground — the same triggers
 *      the drawer already uses for page grants.
 *
 * The local answer (via `hasPaymentAction` -> `can()`) is used as an INSTANT
 * fallback so the UI has something correct to render on first paint, before the
 * request returns.
 *
 * WHY THIS HOOK SURVIVES THE PERMISSION MIGRATION
 * -----------------------------------------------
 * `user.permissions` now carries the same four keys, so a naive reading is that
 * this hook is redundant. It is kept because it answers a slightly different
 * question, on a different clock:
 *
 *   * `/payments/my-permissions/` is fetched with `cache: 'no-store'` on every
 *     navigation. The profile — the source of `user.permissions` — refreshes on
 *     the same triggers, but a payments permission revoked mid-session is the
 *     case this module was written to catch promptly, and money screens are
 *     where that matters most.
 *   * It returns the server's own `can` object, i.e. the answer the API will
 *     actually apply to the next request. Local evaluation is a prediction of
 *     that; this is the thing itself.
 *
 * The two are no longer independent implementations: the local half now routes
 * through the central `can()`, so a disagreement between them means the profile
 * and the payments endpoint disagree on the server — worth surfacing, not
 * worth hiding. If that never happens in practice, this hook can later collapse
 * to `can(user, key)` with no call-site change.
 */
export interface PaymentPermissionState {
  canCreatePayment: boolean;
  canApprovePayment: boolean;
  canCreateDeposit: boolean;
  canApproveDeposit: boolean;
  /** True while the first server answer is still outstanding. */
  loading: boolean;
  refresh: () => void;
}

export function usePaymentPermissions(): PaymentPermissionState {
  const { user } = useAuth();
  const pathname = usePathname();

  // Optimistic local answer, now resolved through the central permission model:
  // `hasPaymentAction` reads the server-issued `permissions` when present and
  // falls back to `extra_pages` only on the degraded path. It previously read
  // `extra_pages` alone, so a key granted through a ROLE BUNDLE on the backend
  // matrix was invisible until the network answer arrived — this closes that
  // gap, and the two sources now agree by construction.
  const local = {
    canCreatePayment: hasPaymentAction(PAYMENT_ACTIONS.PAYMENTS_CREATE, user),
    canApprovePayment: hasPaymentAction(PAYMENT_ACTIONS.PAYMENTS_APPROVE, user),
    canCreateDeposit: hasPaymentAction(PAYMENT_ACTIONS.DEPOSIT_CREATE, user),
    canApproveDeposit: hasPaymentAction(PAYMENT_ACTIONS.DEPOSIT_APPROVE, user),
  };

  const [server, setServer] = useState<PaymentPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setServer(null);
      setLoading(false);
      return;
    }
    const result = await paymentsService.getMyPermissions();
    if (!alive.current) return;
    setServer(result);
    setLoading(false);
  }, [user]);

  // Re-check on every navigation, mirroring how the drawer refreshes page
  // grants. A permission revoked seconds ago takes effect on the next screen.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  // ...and when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  // The server's answer wins once it arrives; until then the local one shows.
  // Falling back to `local` (not `false`) on a failed request means a network
  // blip never wrongly hides a button the user genuinely has.
  const can = server?.can;

  return {
    canCreatePayment: can ? can.Payments_Create : local.canCreatePayment,
    canApprovePayment: can ? can.Payments_Approve : local.canApprovePayment,
    canCreateDeposit: can ? can.Deposit_Create : local.canCreateDeposit,
    canApproveDeposit: can ? can.Deposit_Approve : local.canApproveDeposit,
    loading,
    refresh: load,
  };
}

export default usePaymentPermissions;
