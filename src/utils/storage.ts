import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  HIDDEN_NOTIFICATION_IDS: 'hidden_notification_ids',
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

  // Clear all
  clear: async () => {
    await AsyncStorage.multiRemove([
      KEYS.ACCESS_TOKEN,
      KEYS.REFRESH_TOKEN,
      KEYS.USER,
      KEYS.HIDDEN_NOTIFICATION_IDS,
    ]);
  },
};
