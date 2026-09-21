import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

function getInitialTheme(): Theme {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("theme");
      if (q === "light" || q === "dark") {
        try {
          localStorage.setItem("circuit-theme", q);
        } catch {}
        return q;
      }
      const stored = localStorage.getItem("circuit-theme") as Theme | null;
      if (stored === "light") {
        return "light";
      }
    }
  } catch {}
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = getInitialTheme();
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", initial);
    }
    return initial;
  });

  // Keep data-theme and localStorage in sync whenever theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("circuit-theme", theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggle = () => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", next);
      }
      try {
        localStorage.setItem("circuit-theme", next);
      } catch {}
      return next;
    });
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
    try {
      localStorage.setItem("circuit-theme", t);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
