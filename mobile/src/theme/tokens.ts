/**
 * FEATURE 2 (mobile) — Centralized theme tokens.
 *
 * Identical semantic-token philosophy to the web client: components never
 * hardcode colors, they read semantic roles from the active theme object
 * provided by ThemeContext. Adding a new theme = one new object here; no
 * screen code changes. React Native has no CSS variables, so instead of a
 * :root var block the theme object itself is passed through context and
 * components pull `theme.colors.<role>`.
 */

const palette = {
  pink500: "#ff3f6c",
  pink600: "#e02e5a",
  white: "#ffffff",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
  gray950: "#0b0f17",
  green500: "#03a685",
  red500: "#ef4444",
  amber500: "#f59e0b",
};

export type ThemeColors = {
  bgApp: string;
  bgSurface: string;
  bgSurfaceRaised: string;
  bgMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  accentDefault: string;
  accentHover: string;
  accentSubtle: string;
  borderDefault: string;
  borderStrong: string;
  success: string;
  danger: string;
  warning: string;
};

const lightColors: ThemeColors = {
  bgApp: palette.gray50,
  bgSurface: palette.white,
  bgSurfaceRaised: palette.white,
  bgMuted: palette.gray100,
  textPrimary: palette.gray900,
  textSecondary: palette.gray700,
  textMuted: palette.gray500,
  textOnAccent: palette.white,
  accentDefault: palette.pink500,
  accentHover: palette.pink600,
  accentSubtle: "#fff0f6",
  borderDefault: palette.gray200,
  borderStrong: palette.gray300,
  success: palette.green500,
  danger: palette.red500,
  warning: palette.amber500,
};

const darkColors: ThemeColors = {
  bgApp: palette.gray950,
  bgSurface: palette.gray900,
  bgSurfaceRaised: palette.gray800,
  bgMuted: palette.gray800,
  textPrimary: palette.gray50,
  textSecondary: palette.gray300,
  textMuted: palette.gray400,
  textOnAccent: palette.white,
  accentDefault: palette.pink500,
  accentHover: palette.pink600,
  accentSubtle: "rgba(255,63,108,0.12)",
  borderDefault: palette.gray700,
  borderStrong: palette.gray500,
  success: palette.green500,
  danger: palette.red500,
  warning: palette.amber500,
};

export const themes = {
  light: { name: "light", colors: lightColors },
  dark: { name: "dark", colors: darkColors },
};

export type ThemeName = keyof typeof themes;

// Theme-independent design tokens (shared across themes).
export const tokens = {
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  fontSize: { sm: 13, md: 15, lg: 18, xl: 24, xxl: 28 },
  fontWeight: { regular: "400" as const, medium: "500" as const, bold: "700" as const },
};
