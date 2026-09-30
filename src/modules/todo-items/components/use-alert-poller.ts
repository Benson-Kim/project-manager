"use client";

import { useEffect } from "react";

/**
 * useAlertPoller — registers the Project Manager Service Worker on first mount.
 *
 * The SW (public/sw.js) polls /api/due-alerts every 60 s and fires OS-level
 * browser notifications via self.registration.showNotification(). It runs in
 * a dedicated thread and keeps polling even when no app tab is open, as long
 * as the browser process is running in the background (default on Windows for
 * Chrome/Edge).
 *
 * The hook is side-effect only — no return value. Place it in a Client
 * Component that stays mounted for the whole session (AppShell).
 */
export function useAlertPoller(): void {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Request notification permission lazily on registration success.
        // The browser will only show the prompt when Notification.permission
        // is "default" (not yet decided).
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
        return reg;
      })
      .catch((err) => {
        // SW registration failure is non-fatal — alerts won't ring but the
        // rest of the app is unaffected.
        console.warn("[alerts] Service Worker registration failed:", err);
      });
  }, []); // run once on mount
}
