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
 * `user.extra_pages` is used as an INSTANT fallback so the UI has something
 * correct to render on first paint, before the request returns. It covers the
 * per-user grants and admin, missing only role-derived keys, which the server
 * response then fills in.
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

  const role = user?.role ?? null;
  const extraPages = user?.extra_pages ?? [];
  const roles = user?.roles;

  // Optimistic local answer — correct for admins, roles and per-user grants,
  // available immediately so no screen flashes "no access" while loading.
  const local = {
    canCreatePayment: hasPaymentAction(PAYMENT_ACTIONS.PAYMENTS_CREATE, role, extraPages, roles),
    canApprovePayment: hasPaymentAction(PAYMENT_ACTIONS.PAYMENTS_APPROVE, role, extraPages, roles),
    canCreateDeposit: hasPaymentAction(PAYMENT_ACTIONS.DEPOSIT_CREATE, role, extraPages, roles),
    canApproveDeposit: hasPaymentAction(PAYMENT_ACTIONS.DEPOSIT_APPROVE, role, extraPages, roles),
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
