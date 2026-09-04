/**
 * Date windows for the verification queue.
 *
 * WHY THE WINDOW LIVES ON THE CLIENT
 * The backend's /payments/receipts/ is shared with the tracking screens and
 * has never defaulted its dates — `date_from`/`date_to` are opt-in. A
 * server-side default would silently truncate every existing caller, so the
 * queue's window is a property of THIS screen and is sent as an ordinary
 * filter.
 *
 * TIMEZONE
 * The API compares against `payment_date`, a plain calendar DATE with no
 * timezone, so every boundary is computed from the device's LOCAL calendar day
 * — the operator's "today". `toISOString()` would shift the window by a day
 * for anyone east or west of UTC at the wrong hour, which in India (UTC+5:30)
 * means every evening.
 */

/** An inclusive `YYYY-MM-DD` range, exactly as the API expects it. */
export interface DateWindow {
  from: string;
  to: string;
}

/** Local calendar day as YYYY-MM-DD — never a UTC instant. */
export const toApiDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** How many days back the queue opens on: today plus the day before. */
export const VERIFICATION_WINDOW_DAYS = 2;

/** The preset periods the queue's date dropdown offers. */
export type VerificationRangeKind =
  | "default"
  | "last7"
  | "month"
  | "date"
  | "all";

export interface VerificationRange {
  kind: VerificationRangeKind;
  /** `YYYY-MM-DD` for a specific date, `YYYY-MM` for a month. */
  value?: string;
}

/** `n` days back from `now`, inclusive of today, as a window. */
const daysBack = (now: Date, days: number): DateWindow => {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  // `setDate` past the start of a month rolls the month (and year) correctly,
  // so no month-length arithmetic is needed.
  from.setDate(from.getDate() - (days - 1));
  return { from: toApiDate(from), to: toApiDate(to) };
};

/** The default: today and the day before it. */
export const defaultVerificationWindow = (now: Date = new Date()): DateWindow =>
  daysBack(now, VERIFICATION_WINDOW_DAYS);

/**
 * The window a chosen range resolves to, or null for "all time" — which sends
 * no date filter at all rather than an arbitrarily wide one.
 */
export const windowFor = (
  range: VerificationRange,
  now: Date = new Date(),
): DateWindow | null => {
  switch (range.kind) {
    case "default":
      return daysBack(now, VERIFICATION_WINDOW_DAYS);
    case "last7":
      return daysBack(now, 7);
    case "month": {
      // `YYYY-MM`. Day 0 of the NEXT month is the last day of this one.
      if (!range.value) return null;
      const [y, m] = range.value.split("-").map(Number);
      if (!y || !m) return null;
      const last = new Date(y, m, 0).getDate();
      return {
        from: `${range.value}-01`,
        to: `${range.value}-${String(last).padStart(2, "0")}`,
      };
    }
    case "date":
      return range.value ? { from: range.value, to: range.value } : null;
    case "all":
    default:
      return null;
  }
};

/** Shared with the month grid, so a label and the cell that set it match. */
export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Short label for the dropdown trigger and the count bar. */
export const labelFor = (range: VerificationRange): string => {
  switch (range.kind) {
    case "default":
      return "Last 2 days";
    case "last7":
      return "Last 7 days";
    case "month": {
      if (!range.value) return "Month";
      const [y, m] = range.value.split("-").map(Number);
      // Fixed names rather than `toLocaleDateString`: the runtime's ICU data
      // renders September as "Sept", which would disagree with the "Sep" on
      // the month-grid cell the user just tapped.
      return `${MONTH_ABBR[(m || 1) - 1]} ${y}`;
    }
    case "date": {
      if (!range.value) return "Date";
      // Same fixed names as above — "01 Sep 2026", never "01 Sept 2026".
      const [y, m, d] = range.value.split("-").map(Number);
      return `${String(d).padStart(2, "0")} ${MONTH_ABBR[(m || 1) - 1]} ${y}`;
    }
    case "all":
    default:
      return "All time";
  }
};
