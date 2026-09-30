"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

/**
 * Theme = system | light | dark . The choice persists in
 * localStorage("theme"); html[data-theme] is applied pre-paint by the inline
 * script in the root layout (see themeInitScript) so there is no flash.
 */
export type ThemePreference = "system" | "light" | "dark";

/** Inline script source for the root layout (executed with the CSP nonce). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function apply(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/*
 * localStorage("theme") as an external store (useSyncExternalStore): the
 * server snapshot is "system", the client snapshot re-syncs after hydration —
 * no setState-in-effect, no hydration mismatch.
 */
let storeListeners: Array<() => void> = [];

function subscribeToStore(listener: () => void): () => void {
  storeListeners.push(listener);
  return () => {
    storeListeners = storeListeners.filter((l) => l !== listener);
  };
}

function emitStoreChange() {
  for (const listener of storeListeners) listener();
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToStore,
    readStoredPreference,
    () => "system",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (preference === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    apply(next);
    emitStoreChange();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
