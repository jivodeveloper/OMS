/**
 * Handing a home-page card's filter to a tracking screen.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE CARD SENDS A STATUS SET AND NOT JUST A WORD
 * ─────────────────────────────────────────────────────────────────────────
 * A card says "Rejected 5". Tapping it must show those five rows — not four,
 * not nine. The two screens only agree if they are asking the SAME question,
 * and they were not: the home page's "Rejected" counts an approver's refusal
 * AND the two SAP failure states AND a posting reversed in SAP, while the
 * tracking list's "Rejected" option queries `status=REJECTED` alone and keeps
 * the SAP outcomes under a separate "Failed". Same word, different sets, and
 * a count that could never match the list under it.
 *
 * Translating one taxonomy into the other is how that drift survives. So the
 * card sends the statuses it actually counted, and the tracking screen filters
 * on exactly those. Agreement is then structural: there is one definition of
 * "Rejected" and the home page owns it.
 *
 * Modules whose buckets ARE their filter options (BackDate, Production — one
 * status each) send the label instead, because their option list already
 * means the same thing and resolving a label keeps the dropdown showing a
 * name the user recognises.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND THE PERIOD TRAVELS TOO
 * ─────────────────────────────────────────────────────────────────────────
 * The card counts the month the picker is on. Sending the status alone left
 * the tracking screen showing every month, so "Pending 2" opened a list of
 * eleven — the status matched and the count still looked wrong.
 *
 * Pure, so all of this can be asserted. See `cardFilter.test.ts`.
 */

/**
 * The synthetic filter option's value, for a status set that no option in the
 * tracking screen's own list describes.
 */
export const HOME_FILTER_VALUE = "__from_home";

/** A period as one string: `2026-09` for a month, `2026` for a whole year. */
export function monthParam(year: number, month: number): string {
  // month 0 means "the whole year" — the picker's own convention.
  if (!month) return String(year);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Calendar bounds of a period param, as local `YYYY-MM-DD`. */
export function windowForPeriod(
  raw: string | undefined | null,
): { from: string; to: string } | null {
  if (!raw) return null;
  const year = /^(\d{4})$/.exec(raw);
  if (year) return { from: `${raw}-01-01`, to: `${raw}-12-31` };
  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!month) return null;
  const [, y, m] = month;
  // Day 0 of the NEXT month is the last day of this one — no month-length
  // table, and February is right in a leap year.
  const last = new Date(Number(y), Number(m), 0).getDate();
  return { from: `${raw}-01`, to: `${raw}-${String(last).padStart(2, "0")}` };
}

/**
 * The period param as the shared date control's own value.
 *
 * Returned untyped-ish on purpose: `DateFilterValue` lives in a component
 * module that pulls in React Native, and this file is deliberately free of it.
 */
export function dateFilterForPeriod(
  raw: string | undefined | null,
): { mode: "month" | "year"; value: string } | null {
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return { mode: "year", value: raw };
  if (/^\d{4}-\d{2}$/.test(raw)) return { mode: "month", value: raw };
  return null;
}

/** A status set as one param value, or undefined for "everything". */
export function statusesParam(statuses: string[]): string | undefined {
  const clean = statuses.filter(Boolean);
  return clean.length ? clean.join(",") : undefined;
}

/** A status set param back into a list. Tolerates spaces and empty entries. */
export function parseStatuses(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Every status that falls in a given bucket, from the status→bucket map the
 * home page already uses to count them.
 *
 * INVERTED RATHER THAN LISTED AGAIN. A second hand-written list of "which
 * statuses are rejected" is the drift this whole file exists to prevent: it
 * would be correct the day it was written and wrong the first time a status
 * was added.
 */
export function statusesForBucket<B extends string>(
  bucketOf: Record<string, B>,
  bucket: B,
): string[] {
  return Object.keys(bucketOf).filter((status) => bucketOf[status] === bucket);
}

/**
 * Resolve a card's label against a tracking screen's own option list.
 *
 * The labels are shared across roles while the VALUES are not — an approver's
 * Pending is "awaiting me", a creator's is a document status — so the caller
 * passes a label and the list resolves it.
 *
 * `aliases` covers a list that names the same idea differently: a payments
 * creator has no "Approved" because they have no rung to have approved at;
 * their equivalent is "Completed". Falling back keeps the card meaningful for
 * both roles instead of silently doing nothing for one of them.
 */
export function optionForLabel<T extends { label: string }>(
  label: string | undefined | null,
  options: T[],
  aliases: Record<string, string[]> = { approved: ["approved", "completed"] },
): T | undefined {
  if (!label) return undefined;
  const wanted = label.toLowerCase();
  const candidates = aliases[wanted] ?? [wanted];
  for (const name of candidates) {
    const match = options.find((o) => o.label.toLowerCase() === name);
    if (match) return match;
  }
  return undefined;
}
