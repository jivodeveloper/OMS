import NetInfo from '@react-native-community/netinfo';

/**
 * Network helpers around @react-native-community/netinfo (already a dependency).
 *
 * Centralised so screens don't each wire up NetInfo. The key use is a
 * pre-flight check before an action that needs the internet (e.g. login): a
 * clear "you're offline" message is far better than letting the request hang
 * and fail with a generic error.
 */

export const OFFLINE_MESSAGE =
  'No internet connection. Please turn on Wi-Fi or mobile data and try again.';

/**
 * True when the device currently has a usable internet connection.
 *
 * Uses `isInternetReachable` when NetInfo has determined it (this catches the
 * "connected to Wi-Fi but no actual internet" case), and falls back to
 * `isConnected` while reachability is still `null` (unknown) so we never block a
 * user whose connection is simply not yet probed.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (state.isInternetReachable === false) return false;
    return state.isConnected ?? true;
  } catch {
    // NetInfo unavailable — don't block the user on our own failure; let the
    // request itself surface any real network error.
    return true;
  }
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeOnline(onChange: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    const online =
      state.isInternetReachable === false ? false : state.isConnected ?? true;
    onChange(online);
  });
}
