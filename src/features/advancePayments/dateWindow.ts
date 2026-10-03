import type { DateFilterValue } from "@/src/components/common/InlineOrderDateFilter";

/**
 * What the shared date control means, as dates to compare against.
 *
 * The same arithmetic the request lists do (`useAdvanceRequests`), kept here
 * because the dispatch pages and the assigned list need it too — three screens
 * carrying the same month-end sum is three chances to get it wrong.
 */

/**
 * The day an ISO timestamp falls on, in the DEVICE's timezone, as
 * `YYYY-MM-DD`.
 *
 * Not `toISOString().slice(0, 10)`: that is UTC's day, and a filter for
 * "today" has to mean the user's today, not a date five and a half hours
 * behind it.
 */
export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** The day, month or year a filter covers, as inclusive local bounds. */
export function dateWindow(value: DateFilterValue): { from: string; to: string } | null {
  if (!value?.value) return null;
  if (value.mode === "date") return { from: value.value, to: value.value };
  if (value.mode === "month") {
    const [year, month] = value.value.split("-").map(Number);
    // Day 0 of the NEXT month is the last day of this one — no month-length
    // table, and February answers for itself in a leap year.
    const last = new Date(year, month, 0).getDate();
    return {
      from: `${value.value}-01`,
      to: `${value.value}-${String(last).padStart(2, "0")}`,
    };
  }
  return { from: `${value.value}-01-01`, to: `${value.value}-12-31` };
}
