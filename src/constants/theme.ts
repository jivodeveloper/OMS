export const COLORS = {
  // Primary Blue Theme (from HTML)
  primary: '#2563EB',
  primaryDark: '#1E3A5F',
  primaryDarker: '#0F172A',
  primaryLight: '#DBEAFE',
  primaryLighter: '#EFF6FF',
  primaryHighlight: '#60A5FA',

  // Gradients (for reference - use with LinearGradient)
  gradientStart: '#1E3A5F',
  gradientEnd: '#2563EB',
  gradientDarkStart: '#0F172A',
  gradientDarkEnd: '#1E3A5F',
  black :'#000000',
  // Backgrounds
  background: '#F8FAFC',
  surface: '#FFFFFF',
  cardBackground: '#F0F7FF',
  cardBackgroundEnd: '#F8FAFC',

  // Text
  text: '#1E293B',
  textSecondary: '#64748B',
  textLight: '#FFFFFF',
  textMuted: '#94A3B8',
  textPrimary: '#0a0a0aff',
  // Borders
  border: '#E2E8F0',
  borderLight: '#E8EEF4',
  borderBlue: '#DBEAFE',
  borderDashed: '#BFDBFE',

  // Status
  error: '#DC2626',
  errorLight: '#FEF2F2',
  errorBorder: '#FECACA',
  success: '#22C55E',
  successLight: '#F0FDF4',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',

  // Input
  inputBackground: '#F8FAFC',
  inputBorder: '#E2E8F0',
  inputFocusBorder: '#2563EB',
  inputFocusShadow: 'rgba(37, 99, 235, 0.1)',

  // Shadows (for reference)
  shadowColor: 'rgba(30, 58, 95, 0.25)',
  buttonShadow: 'rgba(37, 99, 235, 0.35)',

  // Decorative
  decorCircle1: 'rgba(255, 255, 255, 0.05)',
  decorCircle2: 'rgba(255, 255, 255, 0.03)',
  decorCircleBlue: 'rgba(37, 99, 235, 0.2)',
  backdropBlur: 'rgba(255, 255, 255, 0.15)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  xxl: 24,
  full: 9999,
};

export const SHADOWS = {
  card: {
    shadowColor: '#1E3A5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  button: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  bottomBar: {
    shadowColor: '#1E3A5F',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
};

// Gradient presets for LinearGradient
export const GRADIENTS = {
  primary: ['#1E3A5F', '#2563EB'] as const,
  primaryReverse: ['#2563EB', '#1E3A5F'] as const,
  dark: ['#0F172A', '#1E3A5F'] as const,
  card: ['#F0F7FF', '#F8FAFC'] as const,
  cardWhite: ['#F0F7FF', '#FFFFFF'] as const,
};