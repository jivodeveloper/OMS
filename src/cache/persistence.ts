import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Storage backend for the API cache.
 *
 * Deliberately a narrow interface so the backing store is swappable. Today it
 * is AsyncStorage (already a dependency, no native rebuild needed). Moving to
 * MMKV later is a single-file change: implement this interface with MMKV and
 * call `setCachePersistence(mmkvAdapter)` once at startup — nothing else in the
 * app has to change.
 */
export interface CachePersistence {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
  multiRemove(keys: string[]): Promise<void>;
}

const asyncStorageAdapter: CachePersistence = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: async () => [...(await AsyncStorage.getAllKeys())],
  multiRemove: (keys) => AsyncStorage.multiRemove(keys),
};

let persistence: CachePersistence = asyncStorageAdapter;

/** Swap the backing store (e.g. to MMKV) before the first cache read. */
export const setCachePersistence = (adapter: CachePersistence) => {
  persistence = adapter;
};

export const getCachePersistence = (): CachePersistence => persistence;
