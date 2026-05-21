"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    // Read persisted theme from localStorage on client mount and validate it safely
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setThemeState(savedTheme);
    } else {
      setThemeState("system");
      localStorage.setItem("theme", "system");
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    console.log("[ThemeProvider] setTheme called with:", newTheme);
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  const applyTheme = (themeValue: Theme) => {
    const root = document.documentElement;
    console.log("[ThemeProvider] applyTheme called with:", themeValue, "classList before:", root.className);
    root.classList.remove("light", "dark");

    if (themeValue === "dark") {
      root.classList.add("dark");
    } else if (themeValue === "light") {
      root.classList.add("light");
    } else {
      // system
      const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      console.log("[ThemeProvider] systemIsDark:", systemIsDark);
      if (systemIsDark) {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
    console.log("[ThemeProvider] classList after:", root.className);
  };

  useEffect(() => {
    // Apply theme whenever state changes
    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      
      const handleSystemChange = (e: MediaQueryListEvent) => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        if (e.matches) {
          root.classList.add("dark");
        } else {
          root.classList.add("light");
        }
      };

      mediaQuery.addEventListener("change", handleSystemChange);
      return () => mediaQuery.removeEventListener("change", handleSystemChange);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
