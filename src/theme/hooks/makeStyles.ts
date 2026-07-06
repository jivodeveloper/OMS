import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type { AppTheme } from "../types";
import { useAppTheme } from "./useAppTheme";

export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: AppTheme) => T,
) {
  return function useThemedStyles(): T {
    const { theme } = useAppTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
