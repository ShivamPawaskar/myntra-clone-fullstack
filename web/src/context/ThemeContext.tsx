"use client";

/**
 * FEATURE 2 — Runtime theme switching + persistence.
 *
 * - Holds the active theme name in React state (so any component can read
 *   or toggle it via the useTheme() hook).
 * - Persists the choice to localStorage so it survives reloads. (The web
 *   equivalent of the mobile app's AsyncStorage persistence requirement.)
 * - Applies the theme by setting `data-theme` on <html>, which swaps the
 *   CSS-variable block defined in globals.css. Components re-render nothing
 *   for the color change — the browser repaints from the new variable
 *   values — which is what makes theme switching cheap and instant.
 * - Respects the OS `prefers-color-scheme` on first visit when the user
 *   has no saved preference yet.
 *
 * The no-flash-on-load problem (FOUC of the wrong theme) is solved by a
 * tiny inline script injected in <head> (see app/layout.tsx) that sets
 * data-theme BEFORE first paint; this provider then syncs React state to
 * whatever that script already applied.
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ThemeName } from "@/theme/tokens";

const STORAGE_KEY = "myntra-clone-theme";

type ThemeContextValue = {
  theme: ThemeName;
  toggleTheme: () => void;
  setTheme: (t: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("light");

  // On mount, read whatever the pre-paint inline script already decided
  // (data-theme on <html>) so React state matches the DOM exactly.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as ThemeName | null;
    if (current === "light" || current === "dark") {
      setThemeState(current);
    }
  }, []);

  const applyTheme = useCallback((t: ThemeName) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // localStorage can throw in private mode; theme still works for the
      // session, it just won't persist. Non-fatal by design.
    }
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "light" ? "dark" : "light");
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** The script string injected before first paint to prevent a wrong-theme
 *  flash. Reads saved preference, falls back to OS setting. Kept as a
 *  string so it can run synchronously in <head> before React hydrates. */
export const noFlashScript = `
(function() {
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;
