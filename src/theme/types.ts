import type { StatusBarStyle, TextStyle, ViewStyle } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedThemeScheme = Exclude<ThemePreference, "system">;

export interface SemanticColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  surfaceElevated: string;
  primary: string;
  primaryContainer: string;
  secondary: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  border: string;
  divider: string;
  overlay: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  shadow: string;
  card: string;
  inputBackground: string;
  placeholder: string;
  statusBarStyle: StatusBarStyle;
}

export interface ThemeSpacing { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }
export interface ThemeRadius { sm: number; md: number; lg: number; xl: number; full: number }

export interface ThemeTypography {
  display: TextStyle;
  heading: TextStyle;
  title: TextStyle;
  body: TextStyle;
  bodySmall: TextStyle;
  label: TextStyle;
  caption: TextStyle;
}

export interface ThemeShadows { card: ViewStyle; elevated: ViewStyle }

export interface AppTheme {
  scheme: ResolvedThemeScheme;
  dark: boolean;
  colors: SemanticColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  typography: ThemeTypography;
  shadows: ThemeShadows;
  status: Pick<SemanticColors, "success" | "warning" | "error" | "info">;
  chart: Readonly<Record<string, string>>;
}
