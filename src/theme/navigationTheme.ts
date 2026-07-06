import type { Theme as NavigationTheme } from "@react-navigation/native";
import { darkTheme } from "./themes/darkTheme";
import { lightTheme } from "./themes/lightTheme";
import type { AppTheme } from "./types";

export function createNavigationTheme(theme: AppTheme): NavigationTheme {
  return {
    dark: theme.dark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.error,
    },
    fonts: {
      regular: { fontFamily: "System", fontWeight: "400" },
      medium: { fontFamily: "System", fontWeight: "500" },
      bold: { fontFamily: "System", fontWeight: "700" },
      heavy: { fontFamily: "System", fontWeight: "900" },
    },
  };
}

export const lightNavigationTheme = createNavigationTheme(lightTheme);
export const darkNavigationTheme = createNavigationTheme(darkTheme);
