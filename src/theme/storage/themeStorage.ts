import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemePreference } from "../types";

const THEME_PREFERENCE_KEY = "@oms/theme-preference";
const VALID_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export async function getThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return VALID_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : "system";
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}
