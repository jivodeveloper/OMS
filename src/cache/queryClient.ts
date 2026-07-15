import {
  CacheEntry,
  isStale,
  peekCache,
  readCache,
  removeCacheByPrefix,
  writeCache,
} from "./cacheStore";

/**
 * The stale-while-revalidate engine sitting between the app and the network.
 *
 *  - Cache hit, fresh  → return cached, no network.
 *  - Cache hit, stale  → return cached IMMEDIATELY, refresh in the background,
 *                        notify subscribers if the payload actually changed.
 *  - Cache miss        → fetch, cache, return.
 *
 * Concurrent callers for the same key share a single in-flight request
 * (single-flight), which collapses the "every screen fetches parties on mount"
 * problem into one network call.
 */

type Listener = (data: unknown) => void;

const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();

/** Cheap structural comparison so we only notify on real changes. */
const isSameData = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

// Cached payloads are shared across callers; hand out copies so a screen that
// mutates its result can't corrupt the cache for everyone else.
const clone = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export const subscribeToQuery = (key: string, listener: Listener): (() => void) => {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
};

const notify = (key: string, data: unknown) => {
  const set = listeners.get(key);
  if (!set?.size) return;
  set.forEach((listener) => {
    try {
      listener(clone(data));
    } catch {
      // A bad subscriber must never break the cache.
    }
  });
};

/** Synchronous read of the memory tier — used for first paint without a flash. */
export const peekQuery = <T>(key: string): T | undefined => {
  const entry = peekCache<T>(key);
  return entry ? clone(entry.data) : undefined;
};

/** Fetch through the network and update the cache + subscribers. */
const revalidate = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  previous: CacheEntry<T> | null,
): Promise<T> => {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    try {
      const fresh = await fetcher();
      const changed = !previous || !isSameData(previous.data, fresh);
      await writeCache(key, fresh);
      if (changed) notify(key, fresh);
      return fresh;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
};

export type FetchQueryOptions = {
  /** How long an entry stays fresh. */
  ttlMs: number;
  /** Skip the cache entirely and go to the network (pull-to-refresh). */
  force?: boolean;
};

export const fetchQuery = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  { ttlMs, force = false }: FetchQueryOptions,
): Promise<T> => {
  if (force) {
    return clone(await revalidate(key, fetcher, await readCache<T>(key)));
  }

  const entry = await readCache<T>(key);

  if (entry && !isStale(entry, ttlMs)) {
    // Fresh — no network at all.
    return clone(entry.data);
  }

  if (entry) {
    // Stale — serve now, refresh behind the user's back.
    void revalidate(key, fetcher, entry).catch(() => undefined);
    return clone(entry.data);
  }

  // Cold — must wait for the network.
  return clone(await revalidate(key, fetcher, null));
};

/**
 * Drop cached entries so the next read re-fetches. Called automatically after
 * mutations; `refetch` lets a caller warm the cache straight away.
 */
export const invalidateQueries = async (prefixes: string[]): Promise<void> => {
  if (!prefixes.length) return;
  await Promise.all(prefixes.map((prefix) => removeCacheByPrefix(prefix)));

  // Wake any mounted screen watching an invalidated key so it can refetch.
  for (const key of listeners.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      notify(key, undefined);
    }
  }
};

/** Keys currently being observed by a mounted screen. */
export const getActiveQueryKeys = (): string[] => [...listeners.keys()];
