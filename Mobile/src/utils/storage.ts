import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
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

  // Clear all
  clear: async () => {
    await AsyncStorage.multiRemove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER]);
  },
};