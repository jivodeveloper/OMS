/**
 * Formatting shared by the mobile dashboard screens.
 *
 * Kept identical in behaviour to the web's `dashboardFormat.ts` — the same
 * figure must read the same on a phone and on a laptop, or the two look like
 * they disagree.
 */

/** Indian-format currency, to paise, matching what the server sends. */
export function money(value: number): string {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Compact currency for tight spaces — "₹12.5L", "₹3.2Cr".
 *
 * Indian units (thousand / lakh / crore), not the K-M-B that `Intl` produces
 * for en-IN: a report read in an Indian office says "lakh", and a figure
 * labelled "1.2M" makes the reader do a conversion the app should have done.
 */
export function compactMoney(value: number): string {
  const n = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "-" : "";
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)}Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `${sign}₹${n.toFixed(0)}`;
}

/** Slice colours, in the same order as the web so one figure keeps one colour
 *  across both clients. */
export const SLICE_COLORS = [
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
];

/** "05 Aug 2026" */
export function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

export function initials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
