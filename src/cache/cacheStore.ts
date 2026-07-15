import { getCachePersistence } from "./persistence";

/**
 * Two-tier cache for API responses.
 *
 *  - Memory tier  : instant reads on revisit (no await, no flicker).
 *  - Disk tier    : survives app restarts, hydrated lazily per key.
 *
 * Entries are namespaced by a cache VERSION (bump to invalidate every old
 * payload after a shape change) and by a SCOPE (the signed-in user id) so one
 * user can never read another user's cached data on a shared device.
 */

const CACHE_VERSION = 1;
const NAMESPACE = `oms.cache.v${CACHE_VERSION}`;

// Hard ceiling on the memory tier so a long session can't grow unbounded.
const MAX_MEMORY_ENTRIES = 300;

export type CacheEntry<T = unknown> = {
  data: T;
  /** epoch ms when this entry was written */
  updatedAt: number;
};

let scope = "anon";
const memory = new Map<string, CacheEntry>();

/** Namespaced disk key for a logical cache key. */
const diskKey = (key: string) => `${NAMESPACE}.${scope}.${key}`;

/**
 * Point the cache at a user. Changing scope drops the in-memory tier so the
 * next reads can't serve the previous user's data.
 */
export const setCacheScope = (nextScope: string | number | null | undefined) => {
  const normalized = String(nextScope ?? "anon");
  if (normalized === scope) return;
  scope = normalized;
  memory.clear();
};

export const getCacheScope = () => scope;

const trimMemory = () => {
  if (memory.size <= MAX_MEMORY_ENTRIES) return;
  // Map preserves insertion order — drop the oldest entries first.
  const excess = memory.size - MAX_MEMORY_ENTRIES;
  let removed = 0;
  for (const key of memory.keys()) {
    memory.delete(key);
    if (++removed >= excess) break;
  }
};

/** Synchronous peek at the memory tier (no disk hit). */
export const peekCache = <T>(key: string): CacheEntry<T> | null =>
  (memory.get(key) as CacheEntry<T> | undefined) ?? null;

/** Read an entry, hydrating from disk on a memory miss. */
export const readCache = async <T>(key: string): Promise<CacheEntry<T> | null> => {
  const inMemory = memory.get(key);
  if (inMemory) return inMemory as CacheEntry<T>;

  try {
    const raw = await getCachePersistence().getItem(diskKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.updatedAt !== "number") return null;

    memory.set(key, parsed as CacheEntry);
    trimMemory();
    return parsed;
  } catch {
    return null;
  }
};

export const writeCache = async <T>(key: string, data: T): Promise<CacheEntry<T>> => {
  const entry: CacheEntry<T> = { data, updatedAt: Date.now() };
  memory.set(key, entry as CacheEntry);
  trimMemory();

  try {
    await getCachePersistence().setItem(diskKey(key), JSON.stringify(entry));
  } catch {
    // Disk is a nice-to-have; the memory tier still serves this session.
  }
  return entry;
};

export const removeCache = async (key: string): Promise<void> => {
  memory.delete(key);
  try {
    await getCachePersistence().removeItem(diskKey(key));
  } catch {
    // ignore
  }
};

/** Remove every entry whose key starts with `prefix` (current scope only). */
export const removeCacheByPrefix = async (prefix: string): Promise<void> => {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }

  try {
    const persistence = getCachePersistence();
    const all = await persistence.getAllKeys();
    const target = `${NAMESPACE}.${scope}.${prefix}`;
    const doomed = all.filter((k) => k.startsWith(target));
    if (doomed.length) await persistence.multiRemove(doomed);
  } catch {
    // ignore
  }
};

/** Wipe everything this cache owns (all scopes). Used on logout. */
export const clearCache = async (): Promise<void> => {
  memory.clear();
  try {
    const persistence = getCachePersistence();
    const all = await persistence.getAllKeys();
    const doomed = all.filter((k) => k.startsWith(NAMESPACE));
    if (doomed.length) await persistence.multiRemove(doomed);
  } catch {
    // ignore
  }
};

/** True when an entry is older than `ttlMs`. */
export const isStale = (entry: CacheEntry | null, ttlMs: number): boolean => {
  if (!entry) return true;
  return Date.now() - entry.updatedAt >= ttlMs;
};
