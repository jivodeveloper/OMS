import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  UI_LABELS: 'ui_labels',
  HIDDEN_NOTIFICATION_IDS: 'hidden_notification_ids',
  NOTIFICATION_PERMISSION: 'notification_permission_state',
  // Stable per-install device identifier. Created once, then persisted for the
  // life of the install — deliberately NOT cleared on logout (see clear()).
  DEVICE_ID: 'device_id',
};

// Persisted state for our custom notification-permission prompt.
export type NotificationPromptStatus =
  | 'never_asked'
  | 'dismissed'
  | 'granted'
  | 'denied';

export type NotificationPromptState = {
  status: NotificationPromptStatus;
  lastPromptAt: number | null;
  dismissCount: number;
};

const DEFAULT_NOTIFICATION_PROMPT_STATE: NotificationPromptState = {
  status: 'never_asked',
  lastPromptAt: null,
  dismissCount: 0,
};

export const storage = {
  
  saveTokens: async (access: string, refresh: string) => {
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, access);
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refresh);
  },
  
  getAccessToken: async () => {
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  },

  getRefreshToken: async () => {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  },

  // User
  saveUser: async (user: object) => {
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
  },

  getUser: async () => {
    const user = await AsyncStorage.getItem(KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  // Dynamic UI labels ({ field_key: display_name }). Cached so a relaunch paints
  // the last-known wording instantly, before the network fetch completes.
  saveUiLabels: async (labels: Record<string, string>) => {
    await AsyncStorage.setItem(KEYS.UI_LABELS, JSON.stringify(labels));
  },

  getUiLabels: async (): Promise<Record<string, string>> => {
    const raw = await AsyncStorage.getItem(KEYS.UI_LABELS);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  getHiddenNotificationIds: async (): Promise<number[]> => {
    const value = await AsyncStorage.getItem(KEYS.HIDDEN_NOTIFICATION_IDS);
    if (!value) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item))
        : [];
    } catch {
      return [];
    }
  },

  addHiddenNotificationIds: async (ids: number[]) => {
    const existing = await storage.getHiddenNotificationIds();
    const merged = Array.from(
      new Set(
        [...existing, ...ids]
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item)),
      ),
    );
    await AsyncStorage.setItem(
      KEYS.HIDDEN_NOTIFICATION_IDS,
      JSON.stringify(merged),
    );
  },

  // Device identifier. Read once at startup by DeviceService, which creates it
  // if absent. Kept separate from the auth keys so it outlives logout.
  getDeviceId: async (): Promise<string | null> => {
    return AsyncStorage.getItem(KEYS.DEVICE_ID);
  },

  setDeviceId: async (deviceId: string): Promise<void> => {
    await AsyncStorage.setItem(KEYS.DEVICE_ID, deviceId);
  },

  // Notification permission prompt state
  getNotificationPromptState: async (): Promise<NotificationPromptState> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.NOTIFICATION_PERMISSION);
      if (!raw) return { ...DEFAULT_NOTIFICATION_PROMPT_STATE };
      const parsed = JSON.parse(raw);
      return {
        status: parsed.status ?? 'never_asked',
        lastPromptAt:
          typeof parsed.lastPromptAt === 'number' ? parsed.lastPromptAt : null,
        dismissCount:
          typeof parsed.dismissCount === 'number' ? parsed.dismissCount : 0,
      };
    } catch {
      return { ...DEFAULT_NOTIFICATION_PROMPT_STATE };
    }
  },

  saveNotificationPromptState: async (
    patch: Partial<NotificationPromptState>,
  ): Promise<void> => {
    const current = await storage.getNotificationPromptState();
    const next = { ...current, ...patch };
    await AsyncStorage.setItem(
      KEYS.NOTIFICATION_PERMISSION,
      JSON.stringify(next),
    );
  },

  // Clear all. NOTE: two keys are intentionally NOT cleared on logout:
  //   • the notification permission prompt state — so a returning/other user on
  //     the same device isn't re-nagged if permission is already granted; and
  //   • the device id — one physical install must keep ONE id across logins, or
  //     every logout/login would mint a new "device" in the backend. It is only
  //     ever removed by an app reinstall or a manual storage wipe.
  // Both are simply omitted from the removal list below.
  clear: async () => {
    await AsyncStorage.multiRemove([
      KEYS.ACCESS_TOKEN,
      KEYS.REFRESH_TOKEN,
      KEYS.USER,
      KEYS.UI_LABELS,
      KEYS.HIDDEN_NOTIFICATION_IDS,
    ]);
  },
};
