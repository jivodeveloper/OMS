import { useContext } from "react";
import { AppThemeContext } from "../provider/ThemeProvider";

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error("useAppTheme must be used within ThemeProvider");

  const { theme, preference, resolvedScheme, setPreference } = context;
  return {
    theme,
    colors: theme.colors,
    spacing: theme.spacing,
    radius: theme.radius,
    typography: theme.typography,
    preference,
    resolvedScheme,
    setPreference,
  };
}
