import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local auto-save for the Create Order form.
 *
 * The Create screen unmounts whenever the user navigates away (the drawer uses
 * `unmountOnBlur`), so any partially-filled form is lost. We mirror the form to
 * device storage as the user types and restore it when they come back. The
 * draft is cleared once the order is actually created (or the user taps Clear),
 * so a fresh form is shown after a successful submit.
 *
 * NOTE: this is purely local (AsyncStorage) and is unrelated to the server-side
 * "Draft order" feature — it never hits the API.
 */

// Bump when the draft shape changes so old payloads are ignored instead of
// restoring into a form that no longer understands them.
const DRAFT_VERSION = 1;

// Drafts older than this are considered abandoned and are not restored.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type OrderDraftVariant = "order" | "foc";

export type OrderDraftPayload = {
  partyName: string | null;
  company: number | null;
  branch: number | null;
  poNumber: string;
  comment: string;
  delivery: string;
  selectedBillTo: number | null;
  selectedShipTo: number | null;
  assignedStateCode: string;
  itemRows: unknown[];
  orderItems: unknown[];
};

export type StoredOrderDraft = OrderDraftPayload & { savedAt: number };

const draftKey = (variant: OrderDraftVariant) =>
  `oms.order_draft.v${DRAFT_VERSION}.${variant}`;

/** True when the draft holds anything worth restoring. */
export const isDraftMeaningful = (draft: OrderDraftPayload | null): boolean => {
  if (!draft) return false;
  return Boolean(
    draft.partyName ||
      (Array.isArray(draft.orderItems) && draft.orderItems.length > 0) ||
      (Array.isArray(draft.itemRows) && draft.itemRows.length > 0) ||
      draft.comment?.trim() ||
      draft.poNumber?.trim(),
  );
};

export const saveOrderDraft = async (
  variant: OrderDraftVariant,
  draft: OrderDraftPayload,
): Promise<void> => {
  try {
    if (!isDraftMeaningful(draft)) return;
    const payload: StoredOrderDraft = { ...draft, savedAt: Date.now() };
    await AsyncStorage.setItem(draftKey(variant), JSON.stringify(payload));
  } catch {
    // Auto-save is best-effort — never block the user on a storage failure.
  }
};

export const loadOrderDraft = async (
  variant: OrderDraftVariant,
): Promise<StoredOrderDraft | null> => {
  try {
    const raw = await AsyncStorage.getItem(draftKey(variant));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredOrderDraft;
    if (!parsed || typeof parsed !== "object") return null;

    // Drop abandoned drafts rather than resurrecting stale data.
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > DRAFT_TTL_MS
    ) {
      await clearOrderDraft(variant);
      return null;
    }

    if (!isDraftMeaningful(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearOrderDraft = async (
  variant: OrderDraftVariant,
): Promise<void> => {
  try {
    await AsyncStorage.removeItem(draftKey(variant));
  } catch {
    // ignore
  }
};
