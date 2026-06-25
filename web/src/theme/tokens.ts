/**
 * FEATURE 2 — CENTRALIZED THEME ARCHITECTURE (single source of truth)
 *
 * Every color, spacing, radius, and font value the UI uses is defined ONCE
 * here as a *semantic* token (e.g. `bg.surface`, `text.primary`,
 * `accent.default`) rather than a raw value scattered across components.
 *
 * How scalability is achieved:
 *   - Components never reference raw hex values or even raw scale colors.
 *     They reference semantic tokens via CSS variables (var(--color-bg-surface)).
 *   - Each theme (light / dark, and any future theme like "high-contrast"
 *     or a seasonal sale theme) only has to provide a mapping from semantic
 *     token -> value. Adding a whole new theme is one new object below plus
 *     one entry in `themes` — zero component changes.
 *   - Because the tokens are semantic, a redesign (e.g. change the brand
 *     accent) is a one-line edit that propagates everywhere automatically.
 *
 * The raw palette (`palette`) is private to this file. Themes map semantic
 * roles onto it. Components only ever see semantic roles.
 */

// --- Private raw palette (never used directly by components) ---
const palette = {
  pink50: "#fff0f6",
  pink500: "#ff3f6c", // Myntra-esque primary
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
  green500: "#03a685", // "in stock" / success
  red500: "#ef4444",
  amber500: "#f59e0b",
  black: "#000000",
};

// Semantic token keys — the contract every theme must fulfill.
export type SemanticTokens = {
  "bg-app": string;
  "bg-surface": string;
  "bg-surface-raised": string;
  "bg-muted": string;
  "text-primary": string;
  "text-secondary": string;
  "text-muted": string;
  "text-on-accent": string;
  "accent-default": string;
  "accent-hover": string;
  "accent-subtle": string;
  "border-default": string;
  "border-strong": string;
  "success": string;
  "danger": string;
  "warning": string;
  "shadow-color": string;
};

const lightTheme: SemanticTokens = {
  "bg-app": palette.gray50,
  "bg-surface": palette.white,
  "bg-surface-raised": palette.white,
  "bg-muted": palette.gray100,
  "text-primary": palette.gray900,
  "text-secondary": palette.gray700,
  "text-muted": palette.gray500,
  "text-on-accent": palette.white,
  "accent-default": palette.pink500,
  "accent-hover": palette.pink600,
  "accent-subtle": palette.pink50,
  "border-default": palette.gray200,
  "border-strong": palette.gray300,
  "success": palette.green500,
  "danger": palette.red500,
  "warning": palette.amber500,
  "shadow-color": "rgba(17, 24, 39, 0.08)",
};

const darkTheme: SemanticTokens = {
  "bg-app": palette.gray950,
  "bg-surface": palette.gray900,
  "bg-surface-raised": palette.gray800,
  "bg-muted": palette.gray800,
  "text-primary": palette.gray50,
  "text-secondary": palette.gray300,
  "text-muted": palette.gray400,
  "text-on-accent": palette.white,
  "accent-default": palette.pink500,
  "accent-hover": palette.pink600,
  "accent-subtle": "rgba(255, 63, 108, 0.12)",
  "border-default": palette.gray700,
  "border-strong": palette.gray500,
  "success": palette.green500,
  "danger": palette.red500,
  "warning": palette.amber500,
  "shadow-color": "rgba(0, 0, 0, 0.5)",
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
};

export type ThemeName = keyof typeof themes;

// Non-color tokens are theme-independent (shared across all themes).
export const tokens = {
  radius: { sm: "6px", md: "10px", lg: "16px", pill: "999px" },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "40px" },
  font: {
    body: "'Inter', system-ui, -apple-system, sans-serif",
    weightRegular: "400",
    weightMedium: "500",
    weightBold: "700",
  },
};

/** Serializes a theme's semantic tokens into a CSS custom-property block.
 *  Used both for SSR injection and runtime theme switching, so the variable
 *  names are guaranteed identical in both paths. */
export function themeToCssVars(theme: SemanticTokens): string {
  return Object.entries(theme)
    .map(([key, value]) => `--color-${key}: ${value};`)
    .join(" ");
}
