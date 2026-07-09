import { useSyncExternalStore } from "react";

/**
 * Tiny shared store for the drawer's open/closed state.
 *
 * The global BottomBar is rendered as a sibling of the Drawer (so it can appear
 * on every screen), which means the drawer's dim overlay doesn't cover it.
 * CustomDrawer (which lives inside the drawer navigator) reports the status
 * here via `useDrawerStatus`, and the BottomBar subscribes so it can hide while
 * the sidebar is open and reappear when it closes.
 */

let drawerOpen = false;
const listeners = new Set<() => void>();

export const setDrawerOpen = (open: boolean) => {
  if (drawerOpen === open) return;
  drawerOpen = open;
  listeners.forEach((listener) => listener());
};

export const useDrawerOpen = (): boolean =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => drawerOpen,
    () => drawerOpen,
  );
