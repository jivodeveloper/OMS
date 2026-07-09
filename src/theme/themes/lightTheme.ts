import { lightColors } from "../colors/light";
import type { AppTheme, ThemeRadius, ThemeSpacing, ThemeTypography } from "../types";

export const spacing: ThemeSpacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius: ThemeRadius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 };
export const typography: ThemeTypography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: "700" },
  heading: { fontSize: 24, lineHeight: 32, fontWeight: "700" },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
};

export const lightTheme: AppTheme = {
  scheme: "light",
  dark: false,
  colors: lightColors,
  spacing,
  radius,
  typography,
  shadows: {
    card: { shadowColor: lightColors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
    elevated: { shadowColor: lightColors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 20, elevation: 8 },
  },
  status: { success: lightColors.success, warning: lightColors.warning, error: lightColors.error, info: lightColors.info },
  chart: {},
};
