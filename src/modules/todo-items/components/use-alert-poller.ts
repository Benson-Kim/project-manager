"use client";

import { useEffect } from "react";

const POLL_INTERVAL_MS = 60_000;
const PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
type DueAlert = { todoAlertId: number; title: string; body?: string };

function base64UrlToBytes(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function pollInOpenTab(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const response = await fetch("/api/due-alerts", { credentials: "include" });
    if (!response.ok) return;
    const alerts = (await response.json()) as DueAlert[];
    for (const alert of alerts) {
      new Notification(alert.title, {
        body: alert.body || "Your to-do alert is due. Click to open.",
        icon: "/favicon.ico",
        tag: `todo-alert-${alert.todoAlertId}`,
      });
    }
  } catch {
    // The todo page remains the authoritative in-app fallback.
  }
}

/**
 * Uses Web Push for closed-tab delivery. Push wakes a stopped worker for each
 * event; it never assumes that a worker or an interval survives. The server
 * must persist /api/alert-subscriptions and send a payload containing an alert.
 * Unsupported/denied/unconfigured/failed Push falls back to foreground-only
 * polling. Without Web Push, no browser API guarantees a no-tab notification.
 */
export function useAlertPoller(): void {
  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    const startForegroundFallback = (): void => {
      if (fallbackTimer) return;
      void pollInOpenTab();
      fallbackTimer = setInterval(() => void pollInOpenTab(), POLL_INTERVAL_MS);
    };

    const registerPush = async (): Promise<void> => {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        startForegroundFallback();
        return;
      }
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          startForegroundFallback();
          return;
        }
      }
      if (Notification.permission !== "granted" || !PUSH_PUBLIC_KEY || !("PushManager" in window)) {
        startForegroundFallback();
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const pushManager = registration.pushManager;
        if (!pushManager) throw new Error("PushManager unavailable");
        const subscription =
          (await pushManager.getSubscription()) ||
          (await pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(PUSH_PUBLIC_KEY),
          }));
        const response = await fetch("/api/alert-subscriptions", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(subscription),
        });
        if (!response.ok) throw new Error("subscription endpoint unavailable");
      } catch (error) {
        console.warn("[alerts] Web Push unavailable; using foreground fallback:", error);
        startForegroundFallback();
      }
    };

    void registerPush();
    return () => {
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, []);
}
