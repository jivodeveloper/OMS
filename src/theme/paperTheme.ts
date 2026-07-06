import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";
import { darkTheme } from "./themes/darkTheme";
import { lightTheme } from "./themes/lightTheme";
import type { AppTheme } from "./types";

function createPaperTheme(theme: AppTheme): MD3Theme {
  const baseTheme = theme.dark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...baseTheme,
    dark: theme.dark,
    colors: {
      ...baseTheme.colors,
      primary: theme.colors.primary,
      primaryContainer: theme.colors.primaryContainer,
      secondary: theme.colors.secondary,
      background: theme.colors.background,
      surface: theme.colors.surface,
      surfaceVariant: theme.colors.surfaceVariant,
      surfaceDisabled: theme.colors.surfaceVariant,
      onSurface: theme.colors.text,
      onSurfaceVariant: theme.colors.textSecondary,
      onSurfaceDisabled: theme.colors.textDisabled,
      outline: theme.colors.border,
      outlineVariant: theme.colors.divider,
      error: theme.colors.error,
      shadow: theme.colors.shadow,
      backdrop: theme.colors.overlay,
    },
  };
}

export const lightPaperTheme = createPaperTheme(lightTheme);
export const darkPaperTheme = createPaperTheme(darkTheme);
