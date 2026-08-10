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

/** Behaviour of a single input field. */
export type UIFieldConfig = {
  label: string;
  enabled: boolean;
  required: boolean;
};

/** Field-behaviour map: { field_key: { label, enabled, required } }. */
export type UIFieldMap = Record<string, UIFieldConfig>;

const ENDPOINT = '/ui-config/labels/';
const FIELDS_ENDPOINT = '/ui-config/fields/';

let labels: UILabelMap = {};
let fields: UIFieldMap = {};
let loadPromise: Promise<UILabelMap> | null = null;
const listeners = new Set<(labels: UILabelMap) => void>();
const fieldListeners = new Set<(fields: UIFieldMap) => void>();

const emit = () => listeners.forEach((l) => l(labels));
const emitFields = () => fieldListeners.forEach((l) => l(fields));

/** Subscribe to label changes. Returns an unsubscribe fn. */
export const subscribeUILabels = (
  listener: (labels: UILabelMap) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe to field-config changes. Returns an unsubscribe fn. */
export const subscribeUIFields = (
  listener: (fields: UIFieldMap) => void,
): (() => void) => {
  fieldListeners.add(listener);
  return () => {
    fieldListeners.delete(listener);
  };
};

/** Current label map (may be empty before the first load). */
export const getUILabels = (): UILabelMap => labels;

/** Current field-config map (may be empty before the first load). */
export const getUIFields = (): UIFieldMap => fields;

const setLabels = (next: UILabelMap) => {
  labels = next || {};
  emit();
  void storage.saveUiLabels(labels);
};

const setFields = (next: UIFieldMap) => {
  fields = next || {};
  emitFields();
  void storage.saveUiFields(fields);
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
      // Seed from disk first so screens paint the last-known values immediately.
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
      if (Object.keys(fields).length === 0) {
        try {
          const cachedFields = await storage.getUiFields();
          if (cachedFields && Object.keys(cachedFields).length > 0) {
            fields = cachedFields as UIFieldMap;
            emitFields();
          }
        } catch {
          /* disk cache is best-effort */
        }
      }

      // Fetch labels + field config together (both feed the order forms).
      try {
        const data = (await api.get(ENDPOINT)) as UILabelMap;
        if (data && typeof data === 'object' && !('success' in data)) {
          setLabels(data);
        }
      } catch {
        /* keep last-known labels on any network/error */
      }
      try {
        const fieldData = (await api.get(FIELDS_ENDPOINT)) as UIFieldMap;
        if (fieldData && typeof fieldData === 'object' && !('success' in fieldData)) {
          setFields(fieldData);
        }
      } catch {
        /* keep last-known field config on any network/error */
      }
      return labels;
    })().finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  },

  /** Clear the caches (call on logout so the next user starts clean). */
  reset: () => {
    labels = {};
    fields = {};
    emit();
    emitFields();
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

/**
 * Resolve a field's behaviour outside React. Inside components prefer the
 * `useFieldConfig()` hook from AuthContext so the component re-renders on change.
 * `fallback` is the built-in default (the behaviour the code used before config).
 */
export const getFieldConfig = (
  key: string,
  fallback: UIFieldConfig,
): UIFieldConfig => {
  const value = fields[key];
  return value && typeof value === 'object' ? value : fallback;
};
