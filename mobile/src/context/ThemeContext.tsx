/**
 * FEATURE 2 (mobile) — Theme provider with AsyncStorage persistence.
 *
 * Mirrors the web ThemeContext but uses:
 *   - AsyncStorage (the RN equivalent of localStorage) for persistence, as
 *     the requirement explicitly calls for.
 *   - the OS color scheme via React Native's Appearance API as the default
 *     on first launch when no preference is saved yet.
 *
 * The active theme object is passed down through context; screens call
 * useTheme() and style themselves from theme.colors.<role>, so a toggle
 * re-renders the tree with the new color object and nothing hardcodes a
 * color value.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themes, ThemeName } from "../theme/tokens";

const STORAGE_KEY = "myntra-clone-theme";

type ThemeContextValue = {
  theme: (typeof themes)[ThemeName];
  themeName: ThemeName;
  toggleTheme: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>("light");
  const [ready, setReady] = useState(false);

  // On launch: load saved preference, else fall back to the OS setting.
  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeName | null;
        if (saved === "light" || saved === "dark") {
          setThemeName(saved);
        } else {
          const sys = Appearance.getColorScheme();
          setThemeName(sys === "dark" ? "dark" : "light");
        }
      } catch {
        setThemeName("light");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeName((prev: ThemeName) => {
      const next: ThemeName = prev === "light" ? "dark" : "light";
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        /* persistence is best-effort; theme still applies this session */
      });
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: themes[themeName], themeName, toggleTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
