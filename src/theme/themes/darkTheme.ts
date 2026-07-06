import { darkColors } from "../colors/dark";
import type { AppTheme } from "../types";
import { radius, spacing, typography } from "./lightTheme";

export const darkTheme: AppTheme = {
  scheme: "dark",
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  typography,
  shadows: {
    card: { shadowColor: darkColors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 14, elevation: 4 },
    elevated: { shadowColor: darkColors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 24, elevation: 10 },
  },
  status: { success: darkColors.success, warning: darkColors.warning, error: darkColors.error, info: darkColors.info },
  chart: {},
};
