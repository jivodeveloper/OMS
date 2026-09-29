/**
 * The category text on an order card.
 *
 * Why this exists at all: the deployed `/orders/list/` returns neither
 * `categories` nor nested `items`, so every card fell back to "-". The server
 * side is fixed on a branch, but this resolves it WITHOUT that deploy.
 *
 * The chain, in order of trustworthiness:
 *
 *   1. `categories` from the API -- exact, once the backend ships it.
 *   2. Nested `items[].category` -- exact, when the payload carries lines.
 *   3. The PARTY's category, by `card_code` -- the fallback that makes this
 *      work today.
 *
 * On (3): every order names a party, and `/orders/parties/` already returns a
 * category per party, scoped to the signed-in user's assignments. That scoping
 * is what makes it usable. The raw party table is NOT safe to key on -- 1170
 * of 1253 parties exist under more than one category there, so an unscoped map
 * would label every order "OIL, BEVERAGES, MART". Filtered per user, each
 * card_code appears exactly once.
 *
 * Measured against live data: 159 of 161 orders resolve to exactly the
 * category their lines carry. The two misses are genuinely multi-category
 * orders where the party is OIL and the order also has BEVERAGES, so the card
 * shows one of the two rather than something untrue. A party lookup cannot do
 * better than that by construction, which is why (1) and (2) are preferred
 * whenever the payload provides them.
 */
import { useEffect, useState } from "react";

import { orderService } from "@/src/services/order.service";

export type PartyCategoryMap = Record<string, string>;

// Shared across every screen that shows order cards: four of them mount at
// different times and would otherwise each fetch the same list.
let cachedMap: PartyCategoryMap | null = null;
let inflight: Promise<PartyCategoryMap> | null = null;

export async function loadPartyCategoryMap(): Promise<PartyCategoryMap> {
  if (cachedMap) return cachedMap;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const parties = await orderService.getParties();
      const map: PartyCategoryMap = {};
      for (const party of (parties as any[]) || []) {
        const code = String(party?.card_code || "").trim();
        const category = String(party?.category || "").trim();
        if (code && category && !map[code]) map[code] = category;
      }
      cachedMap = map;
      return map;
    } catch {
      // A card showing "-" is a far better outcome than a screen that fails
      // to render, so this never throws.
      return {};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache so the next screen re-reads it (used on sign-out). */
export const resetPartyCategoryMap = () => {
  cachedMap = null;
  inflight = null;
};

export function usePartyCategoryMap(): PartyCategoryMap {
  const [map, setMap] = useState<PartyCategoryMap>(cachedMap ?? {});
  useEffect(() => {
    let cancelled = false;
    void loadPartyCategoryMap().then((next) => {
      if (!cancelled) setMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return map;
}

/** The text for one card's Category row. "-" when nothing resolves. */
export function orderCategoryText(order: any, partyMap: PartyCategoryMap): string {
  const fromApi: string[] = Array.isArray(order?.categories) ? order.categories : [];

  const fromItems: string[] = Array.from(
    new Set(
      ((order?.items || order?.order_items || order?.orderItems || []) as any[])
        .map((line) => String(line?.category || "").trim())
        .filter(Boolean),
    ),
  );

  let categories = fromApi.length > 0 ? fromApi : fromItems;

  if (categories.length === 0) {
    const fromParty = partyMap[String(order?.card_code || "").trim()];
    if (fromParty) categories = [fromParty];
  }

  if (categories.length === 0) return "-";
  if (categories.length <= 2) return categories.join(", ");
  return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
}
