/**
 * Combo expansion for the create-order screen.
 *
 * A "combo" is a party product whose name contains a '+' and which the admin
 * has mapped to a free half — the backend publishes that mapping on
 * `/orders/party-products/<card_code>/` as `is_combo` + `free_item_code` +
 * `free_qty_per_unit` + `free_item`. The SERVER DOES NOT EXPAND IT: it only
 * stores whatever rows it is sent, so the client must post the combo as TWO
 * flat rows in `items[]`:
 *
 *     parent  item_code = C   qty = Q      priced   is_auto_free = false
 *     child   item_code = F   qty = Q * k  zero     is_auto_free = true
 *                                                   combo_source_code = C
 *
 * Mirrors the web (`useSalesOrderForm.getComboCompanion` / `getDerivedLines`).
 *
 * THE CHILD IS DERIVED, NEVER STORED. Every helper here is a pure function of
 * the current items plus the party-product list, recomputed on each render.
 * Storing the child would let it go stale the moment the parent's quantity
 * changed or the parent was deleted; deriving it makes both cases impossible
 * by construction. It is also why the edit path must drop `is_auto_free` rows
 * when rehydrating an order — they are re-derived from their parent instead,
 * and keeping both would double the free half on every save.
 */

/** The subset of a party product this module reads. */
export interface ComboPartyProduct {
  item_code?: string | null;
  item_name?: string | null;
  category?: string | null;
  brand?: string | null;
  variety?: string | null;
  sub_group?: string | null;
  is_combo?: boolean | null;
  free_item_code?: string | null;
  /** How many free units per unit of the combo. Backend default is 1.0. */
  free_qty_per_unit?: number | string | null;
  free_item?: {
    item_code?: string | null;
    item_name?: string | null;
    category?: string | null;
    brand?: string | null;
    variety?: string | null;
    sub_group?: string | null;
    sal_factor2?: number | string | null;
    sal_pack_unit?: string | null;
    tax_rate?: number | string | null;
  } | null;
}

/** The subset of a confirmed order item this module reads. */
export interface ComboSourceItem {
  itemCode?: string | null;
  itemName?: string | null;
  category?: string | null;
  brand?: string | null;
  variety?: string | null;
  /** Boxes — the unit the user enters and the payload sends as `qty`. */
  qty?: number | null;
}

/** A derived free line. Display-only in the UI, a real item in the payload. */
export interface ComboLine {
  /** Stable within a render; parent code + child code cannot repeat. */
  key: string;
  parentItemCode: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  variety: string;
  subGroup: string;
  /** Boxes of the free item — what the user sees. */
  qty: number;
  /** Pieces per box (the free item's pack factor), 0 when unknown. */
  pcsPerBox: number;
  /** Total pieces = qty * pcsPerBox. What SAP ultimately ships. */
  pcs: number;
  taxRate: number;
  /** Shown under the parent, e.g. "Free with COLD PRESS 5 LTR + ...". */
  note: string;
}

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Backend default when a mapping omits it (`masters.py` DEFAULT_COMBO_FREE_QTY_PER_UNIT). */
const DEFAULT_FREE_QTY_PER_UNIT = 1;

/**
 * The party product an order item came from.
 *
 * Matched on item_code when the product list carries one, because that is
 * exact. Falls back to name+category+brand+variety — the web matches this way
 * because its rows do not always carry a code, and a combo picked through the
 * category/brand/variety cascade is identified by exactly those four fields.
 */
export const findPartyProduct = (
  item: ComboSourceItem,
  products: ComboPartyProduct[],
): ComboPartyProduct | null => {
  if (!Array.isArray(products) || products.length === 0) return null;

  const code = clean(item.itemCode);
  if (code) {
    const byCode = products.find((p) => clean(p.item_code) === code);
    if (byCode) return byCode;
  }

  const name = clean(item.itemName).toLowerCase();
  if (!name) return null;
  const category = clean(item.category).toLowerCase();
  const brand = clean(item.brand).toLowerCase();
  const variety = clean(item.variety).toLowerCase();

  return (
    products.find(
      (p) =>
        clean(p.item_name).toLowerCase() === name &&
        clean(p.category).toLowerCase() === category &&
        clean(p.brand).toLowerCase() === brand &&
        clean(p.variety).toLowerCase() === variety,
    ) ?? null
  );
};

/**
 * The free half owed for one order item, or null when there is none.
 *
 * Null — meaning "no child row" — for every case the mapping cannot answer:
 * the product is not a combo, the admin has not mapped its free half
 * (`free_item_code` blank), or the quantity is not yet a positive number. An
 * UNMAPPED combo stays a single line, which is what the backend expects.
 */
export const getComboCompanion = (
  item: ComboSourceItem,
  products: ComboPartyProduct[],
): ComboLine | null => {
  const product = findPartyProduct(item, products);
  if (!product || !product.is_combo) return null;

  const freeCode = clean(product.free_item_code);
  if (!freeCode) return null;

  const parentQty = toNumber(item.qty);
  if (parentQty <= 0) return null;

  const perUnit = toNumber(
    product.free_qty_per_unit,
    DEFAULT_FREE_QTY_PER_UNIT,
  );
  const qty = parentQty * (perUnit > 0 ? perUnit : DEFAULT_FREE_QTY_PER_UNIT);
  if (qty <= 0) return null;

  const free = product.free_item ?? {};
  const packFactor = toNumber(free.sal_factor2, 0);
  const parentCode = clean(product.item_code) || clean(item.itemCode);

  return {
    key: `combo-${parentCode}-${freeCode}`,
    parentItemCode: parentCode,
    itemCode: freeCode,
    itemName: clean(free.item_name) || freeCode,
    category: clean(free.category) || clean(product.category),
    brand: clean(free.brand),
    variety: clean(free.variety),
    subGroup: clean(free.sub_group),
    qty,
    pcsPerBox: packFactor,
    pcs: packFactor > 0 ? qty * packFactor : 0,
    taxRate: toNumber(free.tax_rate, 0),
    note: `Free with ${clean(item.itemName) || parentCode}`,
  };
};

/** Every derived free line for the current order, parents in order. */
export const getComboLines = (
  items: ComboSourceItem[],
  products: ComboPartyProduct[],
): ComboLine[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => getComboCompanion(item, products))
    .filter((line): line is ComboLine => line !== null);
};

/**
 * The combo children as `items[]` rows, ready to append to an order payload.
 *
 * Every price field is zeroed: the free half is a giveaway, and the backend
 * stores what it is sent without checking. `is_auto_free` and
 * `combo_source_code` are what let the scheme engine pair the row back to its
 * parent (`applies_to: FREE_LINE`) and stop it being counted as a trigger in
 * its own right.
 *
 * Deliberately excludes scheme giveaways: those ride on the parent line's
 * `schemes[]` array, and the SAP push fans them out into their own zero-priced
 * line. Emitting them here as well would ship the free stock twice.
 */
export const buildComboFreeItems = (
  items: ComboSourceItem[],
  products: ComboPartyProduct[],
): Record<string, unknown>[] =>
  getComboLines(items, products).map((line) => ({
    item_code: line.itemCode,
    item_name: line.itemName,
    category: line.category,
    brand: line.brand,
    variety: line.variety,
    item_type: "",
    // The paid rows send payload `qty` = total PIECES and payload `boxes` =
    // boxes ("qty/boxes are swapped in the payload", create.tsx:2566). The
    // free half follows the same inversion, or the two would disagree about
    // what a number means.
    qty: line.pcs || line.qty,
    boxes: line.qty,
    pcs: line.pcsPerBox,
    ltrs: 0,
    basic_price: 0,
    price_list_basic: 0,
    total: 0,
    tax_rate: line.taxRate,
    scheme_id: null,
    scheme_name: null,
    scheme_qty: 0,
    is_scheme_visible: false,
    schemes: [],
    is_auto_free: true,
    combo_source_code: line.parentItemCode,
  }));

/**
 * Drop the stored free halves when loading an order for edit.
 *
 * They are re-derived from their parents, so keeping the saved rows too would
 * post the free half twice on the next save.
 */
export const withoutAutoFreeItems = <T extends { is_auto_free?: unknown }>(
  items: T[],
): T[] =>
  Array.isArray(items) ? items.filter((item) => !item?.is_auto_free) : [];
