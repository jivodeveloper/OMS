/**
 * What each variety of an order actually earns, per litre shipped.
 *
 * PORTED FROM THE WEB CLIENT (`OMS-Frontend/src/components/orders/
 * orderDetail.ts`, `varietyRealisation`). The rule is the same on both so one
 * approver cannot be shown ₹92/L on a phone and ₹88/L on a screen for the
 * same order.
 *
 * WHY PER LITRE, AND WHY FREE LITRES COUNT. An order's value tells an
 * approver what it is worth; it does not tell them whether the rate is any
 * good, because a bigger order is worth more at any rate. Dividing by volume
 * does. Free litres — scheme giveaways and FOC — are counted in the divisor
 * BUT CONTRIBUTE NOTHING to the value, which is the whole point: they dilute
 * realisation exactly as they dilute what the order earns, and an order
 * carrying heavy giveaways shows the lower rate it really achieves.
 *
 * GROUPED BY `variety_type`, which is the server's own classification
 * (`orders.serializers.item_variety_type`) — SAP's per-SKU type where it has
 * one, its sub-group where it does not. The same field the item badges and
 * the variety tabs already use, so the three cannot disagree.
 *
 * PURE, NO REACT: the arithmetic is the part worth testing.
 */

/** The fields this reads. Anything else on an order line is ignored. */
export interface VarietyLine {
  variety_type?: string | null;
  total?: number | string | null;
  /** The server's own litres for the line, giveaways included, when it sent them. */
  total_ltrs?: number | string | null;
  ltrs?: number | string | null;
  schemes?: unknown;
}

export interface VarietyRealisation {
  label: string;
  /** Basic value, before tax. */
  amount: number;
  /** Every litre that leaves, free litres included. */
  litres: number;
  /** `amount / litres` — the line is dropped entirely when there are none. */
  perLitre: number;
}

/** Premium first, then Commodity, then whatever is left. */
const REALISATION_ORDER = ["Premium", "Commodity", "Other"];

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** PREMIUM -> Premium, OTHERS -> Other, "" -> Other. */
export function varietyLabel(raw: string | null | undefined): string {
  const key = String(raw || "").trim().toUpperCase();
  if (key === "PREMIUM") return "Premium";
  if (key === "COMMODITY") return "Commodity";
  return "Other";
}

/**
 * Litres on one line, giveaways included.
 *
 * THE SERVER'S FIGURE WINS where it sent one: `total_ltrs` already has the
 * schemes in it. Only where it is missing does this add them up itself, which
 * is the same fallback the details screen's "Total Ltrs" uses — and it must
 * stay the same, or the parts would not sum to the whole shown above them.
 */
export function lineLitres(line: VarietyLine): number {
  const stated = toNumber(line.total_ltrs);
  if (stated > 0) return stated;

  const schemes = Array.isArray(line.schemes) ? line.schemes : [];
  const free = schemes.reduce((sum: number, scheme) => {
    const qty = (scheme as { qty?: unknown; quantity?: unknown })?.qty;
    const fallback = (scheme as { quantity?: unknown })?.quantity;
    return sum + toNumber(qty ?? fallback);
  }, 0);

  return toNumber(line.ltrs) + free;
}

/**
 * Realisation per variety, best rate first by variety rank.
 *
 * A variety with no litres is left out rather than shown as ₹0/L: dividing by
 * nothing is not a rate of zero, it is no rate at all, and a zero on an
 * approver's screen reads as a terrible one.
 */
export function varietyRealisation(lines: VarietyLine[]): VarietyRealisation[] {
  const groups = new Map<string, { amount: number; litres: number }>();

  for (const line of lines) {
    const label = varietyLabel(line.variety_type);
    const group = groups.get(label) ?? { amount: 0, litres: 0 };
    group.amount += toNumber(line.total);
    group.litres += lineLitres(line);
    groups.set(label, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.litres > 0)
    .map(([label, group]) => ({
      label,
      amount: group.amount,
      litres: group.litres,
      perLitre: group.amount / group.litres,
    }))
    .sort(
      (a, b) => REALISATION_ORDER.indexOf(a.label) - REALISATION_ORDER.indexOf(b.label),
    );
}
