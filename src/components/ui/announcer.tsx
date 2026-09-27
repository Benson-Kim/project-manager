"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * The ONE aria-live announcer : route changes, result counts, save
 * confirmations. Visually hidden; polite only — urgent feedback goes through
 * the error toast (assertive).
 */
interface AnnouncerContextValue {
  announce: (message: string) => void;
}

const AnnouncerContext = createContext<AnnouncerContextValue | null>(null);

export function LiveAnnouncer({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");

  const announce = useCallback((next: string) => {
    // Clear first so repeating the same message is re-announced.
    setMessage("");
    requestAnimationFrame(() => setMessage(next));
  }, []);

  const value = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="sr-only" data-testid="live-announcer">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerContextValue {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error("useAnnouncer must be used inside LiveAnnouncer");
  return ctx;
}
