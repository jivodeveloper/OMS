/**
 * How long collected money waited for its handover check.
 *
 * Its own module rather than living beside a component: the General
 * Information card imports it, and reaching into a `.tsx` file for a pure
 * function drags React Native into anything that wants to test it.
 */

/**
 * Whole days from collection to verification, or null when unknowable.
 *
 * `collectedAt` is a bare `YYYY-MM-DD` (a calendar day, no clock) and
 * `verifiedAt` is an instant, so BOTH are reduced to a local calendar day
 * before subtracting — comparing them directly would let the clock decide the
 * answer. A payment collected and verified on the same local day is 0.
 */
export const handoverDays = (
  collectedAt: string | null,
  verifiedAt: string | null,
): number | null => {
  if (!collectedAt || !verifiedAt) return null;
  const from = new Date(`${collectedAt}T00:00:00`);
  const to = new Date(verifiedAt);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const days = Math.round((toDay.getTime() - fromDay.getTime()) / 86400000);
  // A collection date entered in the future would otherwise read as negative.
  return Math.max(days, 0);
};
