import { useSyncExternalStore } from "react";

/**
 * Lets a screen publish a "refresh" action into the shared drawer header.
 *
 * The header (and its notification bell) lives in app/(main)/_layout.tsx, while
 * the data a refresh needs lives inside the screen. Rather than duplicating the
 * bell in every screen that wants a refresh button, a screen registers its
 * handler here and the header renders the button while that handler exists.
 *
 * Module-level store (same pattern as AppDialog/Toast) — no context needed.
 */

type RefreshHandler = () => void | Promise<void>;

let handler: RefreshHandler | null = null;
let refreshing = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Register (or clear, with null) the header refresh action. */
export const setHeaderRefreshHandler = (fn: RefreshHandler | null) => {
  if (handler === fn) return;
  handler = fn;
  emit();
};

/** Drive the header's spinner while a refresh is in flight. */
export const setHeaderRefreshing = (value: boolean) => {
  if (refreshing === value) return;
  refreshing = value;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Snapshot must be a primitive so useSyncExternalStore can compare it cheaply
// without allocating a new object on every render.
const STATE_NONE = 0;
const STATE_IDLE = 1;
const STATE_REFRESHING = 2;

const getSnapshot = () => {
  if (!handler) return STATE_NONE;
  return refreshing ? STATE_REFRESHING : STATE_IDLE;
};

export const useHeaderRefresh = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    available: state !== STATE_NONE,
    refreshing: state === STATE_REFRESHING,
    run: () => handler?.(),
  };
};
