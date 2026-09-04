// The central permission model. Authority is a KEY, held or not held; a role is
// only identity. This mirrors the backend exactly — see OMS-Backend
// `core/permissions.py`, `core/permission_registry.py` and PERMISSIONS.md.
//
// The server computes the answer and sends it. `effective_keys(user)` on the
// backend is
//
//     union(active roles' bundles, User.extra_pages) ∩ registry
//
// and it arrives on the login and profile payloads as `permissions: string[]`.
// The client's job is to READ that list, never to re-derive it: a client-side
// role -> permission map would be a second source of authority that silently
// disagrees with the boxes an admin actually ticked.
//
// Keys are OPAQUE identifiers. Nothing here splits, parses or pattern-matches
// them back into module/action — the backend registry makes the same point at
// length, having watched another project mangle every custom name by splitting
// on underscores. Grouping is explicit or it does not happen.

import type { User } from "@/src/services/auth.service";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/**
 * Permission keys this app checks, spelled exactly as the backend registry
 * spells them (`core/permission_registry.py`). A constant rather than a bare
 * string at each call site so a typo is a compile error instead of a silent
 * denial — a mistyped key is simply a key nobody holds, which fails closed and
 * looks identical to a revoked grant.
 *
 * Only the payments keys are listed: they are the ones this app gates on today.
 * The registry holds more (orders.*, tracker.*, the admin page keys); they are
 * added here as the screens that need them are migrated, not speculatively.
 */
export const PERMISSION_KEYS = {
  PAYMENTS_CREATE: "Payments_Create",
  // The handover gate between creation and approval. Independent of Create and
  // Approve: holding either confers nothing here, and the backend separately
  // forbids verifying a receipt you raised yourself.
  PAYMENTS_VERIFY: "Payments_Verify",
  PAYMENTS_APPROVE: "Payments_Approve",
  DEPOSIT_CREATE: "Deposit_Create",
  DEPOSIT_APPROVE: "Deposit_Approve",
  PAYMENTS_DASHBOARD: "Payments_Dashboard",
} as const;

/**
 * A key this app knows about. Deliberately widened to `string` at the `can()`
 * boundary: the server may send keys from modules the app has not migrated yet
 * (or that it has no screen for at all), and those must stay comparable rather
 * than becoming a type error.
 */
export type PermissionKey =
  (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

// ---------------------------------------------------------------------------
// Role identity
// ---------------------------------------------------------------------------

export const ADMIN_ROLE = "admin";

/**
 * Every role name a user holds, lower-cased — the primary `role` plus
 * `extra_roles` (flattened by the server into `roles`).
 *
 * Reading `role` alone misses a user whose function was granted through
 * `extra_roles`: they hold the role and would be shown nothing. The backend
 * makes the same demand of itself in `core/permissions.py:role_names`.
 *
 * Roles are identity ONLY. Nothing in this module maps a role to a permission.
 */
export const rolesOf = (
  role?: string | null,
  roles?: string[] | null,
): string[] => {
  const all = new Set<string>();
  const add = (value: string) => {
    const name = String(value).trim().toLowerCase();
    if (name) all.add(name);
  };
  if (role) add(role);
  (roles || []).forEach((r) => {
    if (r) add(r);
  });
  return [...all];
};

/**
 * The one definition of administrator, matching `core.permissions.is_admin`:
 * the `admin` role held as primary OR via extra_roles, `is_superuser`, or
 * `is_staff`.
 *
 * This is NOT a client-side shortcut. The server pre-expands an admin to every
 * registered key (`effective_keys`, and `payments.granted_keys` likewise), so
 * an admin's `permissions` array already contains everything — the check below
 * agrees with the server rather than second-guessing it.
 *
 * It is kept locally for one case the array cannot cover: on a database where
 * the RolePermissions migrations have not run, `effective_keys` degrades and
 * `permissions` can arrive empty, while an admin's `extra_pages` is typically
 * empty too. Without this, migrating would lock every administrator out of
 * every screen on exactly the deployments least able to fix it.
 */
export const isAdmin = (user?: User | null): boolean => {
  if (!user) return false;
  if (user.is_superuser || user.is_staff) return true;
  return rolesOf(user.role, user.roles).includes(ADMIN_ROLE);
};

// ---------------------------------------------------------------------------
// The key set
// ---------------------------------------------------------------------------

/**
 * The keys to evaluate a check against.
 *
 * Normal path: the server's own `permissions`, which already accounts for role
 * bundles, per-user grants and admin.
 *
 * Degraded path — `permissions` absent or empty — falls back to `extra_pages`.
 * Three situations produce it, and the fallback is correct for all three:
 *
 *   1. The backend predates the `permissions` field.
 *   2. The RolePermissions migrations have not run, so `effective_keys`
 *      collapses to `extra_pages ∩ registry` and may return nothing.
 *   3. A `User` object cached by an older build of this app is restored from
 *      AsyncStorage; it has no `permissions` until the next profile refresh.
 *
 * The fallback is sound because the legacy flat keys (`Payments_Create`,
 * `App_User`, ...) are registered VERBATIM in the backend registry. It is the
 * same namespace, so this yields a subset of the truth — never a wrong answer.
 *
 * What it cannot recover is admin, which `can()` handles before reaching here.
 */
export const permissionKeysOf = (user?: User | null): string[] => {
  if (!user) return [];
  const granted = user.permissions;
  if (Array.isArray(granted) && granted.length > 0) return granted;
  return user.extra_pages ?? [];
};

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

/**
 * Whether `user` holds `key`.
 *
 * Fails CLOSED with no user: between app launch and the profile arriving there
 * is no evidence of a grant, and rendering privileged UI on an assumption is
 * the one mistake with no safe recovery.
 *
 * This is a UI affordance, never a security boundary — every rule here is
 * enforced again server-side. It exists so a user is not shown a button the API
 * would refuse, not to protect the data behind it.
 */
export const can = (user: User | null | undefined, key: string): boolean => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return permissionKeysOf(user).includes(key);
};

/** Whether `user` holds ANY of `keys`. Empty list = false (nothing to hold). */
export const canAny = (
  user: User | null | undefined,
  keys: readonly string[],
): boolean => keys.some((key) => can(user, key));

/** Whether `user` holds EVERY one of `keys`. Empty list = true (vacuous). */
export const canAll = (
  user: User | null | undefined,
  keys: readonly string[],
): boolean => keys.every((key) => can(user, key));
