import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

function getInitial(): Theme {
  try {
    const stored = localStorage.getItem("tj-theme") as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  return "dark";
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === "light") {
    html.classList.add("light");
    html.classList.remove("dark");
  } else {
    html.classList.add("dark");
    html.classList.remove("light");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitial);

  /* Apply class immediately on first paint (before React hydration) */
  useEffect(() => {
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Apply class + persist on every change */
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem("tj-theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setThemeState(t => (t === "dark" ? "light" : "dark"));
  const setTheme    = (t: Theme) => setThemeState(t);

  return <Ctx.Provider value={{ theme, toggleTheme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
