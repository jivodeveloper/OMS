import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { getThemePreference, setThemePreference } from "../storage/themeStorage";
import { darkTheme } from "../themes/darkTheme";
import { lightTheme } from "../themes/lightTheme";
import type { AppTheme, ResolvedThemeScheme, ThemePreference } from "../types";

export interface AppThemeContextValue {
  theme: AppTheme;
  preference: ThemePreference;
  resolvedScheme: ResolvedThemeScheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

export const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    getThemePreference()
      .then((savedPreference) => {
        if (active) {
          setPreferenceState(savedPreference);
          setIsReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setPreferenceState("system");
          setIsReady(true);
        }
      });
    return () => { active = false; };
  }, []);

  const resolvedScheme: ResolvedThemeScheme =
    preference === "system"
      ? systemScheme === "dark" ? "dark" : "light"
      : preference;

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    await setThemePreference(nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  const value = useMemo<AppThemeContextValue>(() => ({
    theme: resolvedScheme === "dark" ? darkTheme : lightTheme,
    preference,
    resolvedScheme,
    setPreference,
  }), [preference, resolvedScheme, setPreference]);

  if (!isReady) return null;

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
