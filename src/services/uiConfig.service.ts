import { api } from './api';
import { storage } from '../utils/storage';

/**
 * uiConfig — dynamic UI field labels served by the backend.
 *
 * Admins rename field labels (e.g. "Price List" → "Distributor Price") from the
 * web dashboard; this app renders the current wording without an APK rebuild.
 *
 *   • Fetched ONCE after login / on a restored session — never per screen.
 *   • Cached in a tiny module-level store (+ AsyncStorage mirror for an instant
 *     paint on relaunch) and exposed to screens through AuthContext's
 *     `useUILabels()` hook, which re-renders on change.
 *   • Read with a fallback so the UI is always correct before labels load.
 */

/** Flat map the backend returns: { field_key: display_name }. */
export type UILabelMap = Record<string, string>;

const ENDPOINT = '/ui-config/labels/';

let labels: UILabelMap = {};
let loadPromise: Promise<UILabelMap> | null = null;
const listeners = new Set<(labels: UILabelMap) => void>();

const emit = () => listeners.forEach((l) => l(labels));

/** Subscribe to label changes. Returns an unsubscribe fn. */
export const subscribeUILabels = (
  listener: (labels: UILabelMap) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Current label map (may be empty before the first load). */
export const getUILabels = (): UILabelMap => labels;

const setLabels = (next: UILabelMap) => {
  labels = next || {};
  emit();
  void storage.saveUiLabels(labels);
};

export const uiConfigService = {
  /**
   * Load the label map once and cache it. Concurrent calls share one in-flight
   * request. Never throws — a failed fetch keeps the last-known map so the UI
   * falls back to hardcoded text. Call fire-and-forget after login / startup.
   */
  load: async (force = false): Promise<UILabelMap> => {
    if (!force && loadPromise) return loadPromise;

    loadPromise = (async () => {
      // Seed from disk first so screens paint the last-known labels immediately.
      if (Object.keys(labels).length === 0) {
        try {
          const cached = await storage.getUiLabels();
          if (cached && Object.keys(cached).length > 0) {
            labels = cached;
            emit();
          }
        } catch {
          /* disk cache is best-effort */
        }
      }

      try {
        const data = (await api.get(ENDPOINT)) as UILabelMap;
        if (data && typeof data === 'object' && !('success' in data)) {
          setLabels(data);
        }
      } catch {
        /* keep last-known labels on any network/error */
      }
      return labels;
    })().finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  },

  /** Clear the cache (call on logout so the next user starts clean). */
  reset: () => {
    labels = {};
    emit();
  },
};

/**
 * Resolve a single label outside React. Inside components, prefer the
 * `useUILabels()` hook from AuthContext so the component re-renders on change.
 */
export const getLabel = (key: string, fallback: string): string => {
  const value = labels[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
};
