/**
 * Date and time conversions for values that cross the API boundary.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two conversions in this app are easy to write and wrong in the same way:
 * they take a value that means "this wall clock, here" and hand it over as if
 * it meant "this instant, everywhere" — or the reverse. Both errors are
 * invisible until somebody in a non-UTC timezone reads the result back.
 *
 *   * `toISOString().split("T")[0]` is the common idiom for "just the date".
 *     For a user at UTC+05:30 picking any moment between 00:00 and 05:30 local
 *     it yields YESTERDAY, because it converts to UTC first. `toYMD` reads the
 *     local calendar fields instead and cannot drift.
 *
 *   * A bare `"2026-09-16T14:00"` has no zone, and the server reads a zoneless
 *     timestamp as UTC. "2 o'clock" then becomes 19:30 in Indian time. This is
 *     not hypothetical: it was live on the web BackDate form and every request
 *     read back five and a half hours late. `toIsoInstant` sends the instant a
 *     wall clock denotes, leaving the server nothing to assume.
 */

/**
 * A `Date` as `YYYY-MM-DD` on the LOCAL calendar.
 *
 * Use for date-only fields (`from_date`, `to_date`). Never
 * `toISOString().split("T")[0]` — see the note above.
 */
export function toYMD(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `Date` as an unambiguous instant, for timestamp fields (`time_limit`).
 *
 * The `Date` already IS an instant — this only serialises it. The discipline
 * that matters is upstream: hold a `Date` in form state, never a formatted
 * string, so there is no moment at which a zoneless value exists to be
 * misread.
 */
export function toIsoInstant(date: Date): string {
  return date.toISOString();
}

/** An ISO instant from the API as a `Date`, or null if absent/unparseable. */
export function fromIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `"16 Sep 2026"` — a date, in the reader's own timezone. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = typeof value === "string" ? fromIso(value) : value ?? null;
  if (!date) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** `"16 Sep 2026, 11:45 PM"` — a timestamp, in the reader's own timezone. */
export function formatInstant(value: string | Date | null | undefined): string {
  const date = typeof value === "string" ? fromIso(value) : value ?? null;
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `"16 Sep 2026"` and `"11:45 PM"` separately — for dialogs that show both. */
export function splitInstant(value: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  const date = typeof value === "string" ? fromIso(value) : value ?? null;
  if (!date) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
