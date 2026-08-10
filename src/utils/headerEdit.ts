import { useSyncExternalStore } from "react";

/**
 * Lets a screen publish an "edit" action into the shared drawer header.
 *
 * Same problem and same shape as headerRefresh: the header lives in
 * app/(main)/_layout.tsx, but whether editing is allowed is per-document state
 * the header cannot see — it depends on the document's status and on
 * server-decided permissions the screen has already fetched.
 *
 * So the screen registers a handler while editing is permitted, and the header
 * renders the icon only while one exists. Clearing it on unmount means the icon
 * can never linger on a screen that does not own it.
 *
 * Module-level store (same pattern as AppDialog/Toast) — no context needed.
 */

type EditHandler = () => void;

let handler: EditHandler | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Register (or clear, with null) the header edit action. */
export const setHeaderEditHandler = (fn: EditHandler | null) => {
  if (handler === fn) return;
  handler = fn;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// A primitive snapshot, so useSyncExternalStore can compare cheaply without
// allocating a new object on every render.
const getSnapshot = () => (handler ? 1 : 0);

export const useHeaderEdit = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    available: state === 1,
    run: () => handler?.(),
  };
};
