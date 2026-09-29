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
 *   4. The order's own lines, from its detail payload -- for orders whose
 *      party is not among the signed-in user's assignments (an approver
 *      reviewing someone else's party), where (3) has nothing to offer.
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
import { useCallback, useEffect, useState } from "react";

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

// Categories read from an order's detail lines, by order id. Only successful
// reads are cached, so a failed fetch is retried next time the list loads.
const lineCategoriesByOrderId: Record<number, string[]> = {};
const lineInflight = new Map<number, Promise<string[]>>();
// Approval lists can be long; don't fire one detail request per card at once.
const DETAIL_FETCH_CONCURRENCY = 4;

async function loadLineCategories(orderId: number): Promise<string[]> {
  if (lineCategoriesByOrderId[orderId]) return lineCategoriesByOrderId[orderId];
  const pending = lineInflight.get(orderId);
  if (pending) return pending;
  const request = (async () => {
    try {
      const res = await orderService.getorderdetailsbyid(orderId);
      const categories = uniqueLineCategories(res?.data || res);
      lineCategoriesByOrderId[orderId] = categories;
      return categories;
    } catch {
      return [];
    } finally {
      lineInflight.delete(orderId);
    }
  })();
  lineInflight.set(orderId, request);
  return request;
}

/** Drop the cache so the next screen re-reads it (used on sign-out). */
export const resetPartyCategoryMap = () => {
  cachedMap = null;
  inflight = null;
  for (const id of Object.keys(lineCategoriesByOrderId)) {
    delete lineCategoriesByOrderId[Number(id)];
  }
  lineInflight.clear();
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

function uniqueLineCategories(order: any): string[] {
  return Array.from(
    new Set(
      ((order?.items || order?.order_items || order?.orderItems || []) as any[])
        .map((line) => String(line?.category || "").trim())
        .filter(Boolean),
    ),
  );
}

/** Steps 1-3 of the chain above; empty when none of them resolves. */
function resolveCategories(order: any, partyMap: PartyCategoryMap): string[] {
  const fromApi: string[] = Array.isArray(order?.categories) ? order.categories : [];
  if (fromApi.length > 0) return fromApi;

  const fromItems = uniqueLineCategories(order);
  if (fromItems.length > 0) return fromItems;

  const fromParty = partyMap[String(order?.card_code || "").trim()];
  return fromParty ? [fromParty] : [];
}

function formatCategories(categories: string[]): string {
  if (categories.length === 0) return "-";
  if (categories.length <= 2) return categories.join(", ");
  return `${categories.slice(0, 2).join(", ")} +${categories.length - 2}`;
}

/** The text for one card's Category row. "-" when nothing resolves. */
export function orderCategoryText(order: any, partyMap: PartyCategoryMap): string {
  return formatCategories(resolveCategories(order, partyMap));
}

/**
 * The Category text for a screen's order cards, including step 4: orders the
 * list and party map can't place get their detail fetched once, in the
 * background, and the card updates when it arrives.
 */
export function useOrderCategoryText(orders: any[]): (order: any) => string {
  const partyMap = usePartyCategoryMap();
  const [lineCategories, setLineCategories] = useState<Record<number, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Wait for the real party map first; judged against the initial empty
      // one, every card would look unresolved and trigger a detail fetch.
      const map = await loadPartyCategoryMap();
      const unresolved = orders.filter(
        (order) => order?.id != null && resolveCategories(order, map).length === 0,
      );
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < unresolved.length) {
          const orderId = Number(unresolved[next++].id);
          const categories = await loadLineCategories(orderId);
          if (!cancelled && categories.length > 0) {
            setLineCategories((prev) => ({ ...prev, [orderId]: categories }));
          }
        }
      };
      await Promise.all(Array.from({ length: DETAIL_FETCH_CONCURRENCY }, worker));
    })();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  return useCallback(
    (order: any) => {
      const categories = resolveCategories(order, partyMap);
      if (categories.length > 0) return formatCategories(categories);
      const orderId = Number(order?.id);
      return formatCategories(
        lineCategories[orderId] ?? lineCategoriesByOrderId[orderId] ?? [],
      );
    },
    [partyMap, lineCategories],
  );
}
