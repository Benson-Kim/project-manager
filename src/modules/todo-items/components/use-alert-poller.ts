"use client";

import { useCallback, useEffect, useRef } from "react";
import { pollDueAlertsAction } from "../actions";

const POLL_INTERVAL_MS = 60_000; // 1 minute

/**
 * Tracks which alert IDs have already been notified in this browser session
 * so we don't fire the same notification twice within the same poll window.
 * Cleared on page reload (intentional — a reload means the user returned).
 */
const notifiedIds = new Set<number>();

/**
 * Request browser notification permission the first time an alert fires.
 * Returns true if notifications may be shown (granted or already granted).
 */
async function ensurePermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Fire a browser notification for a single due alert.
 * Falls back gracefully when the Notification API is unavailable or denied.
 */
function fireNotification(title: string, todoItemId: number): void {
  const body = "Your to-do item is due now. Click to open.";
  const notification = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: `todo-alert-${todoItemId}`, // collapses duplicates per item
    requireInteraction: false,
  });
  notification.onclick = () => {
    window.focus();
    // Notification.onclick runs outside React — useRouter is unavailable here.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/todo";
    notification.close();
  };
}

type DueAlert = { todoAlertId: number; todoItemId: number; title: string; rowVer: number };

/**
 * useAlertPoller — mounts a 60-second interval that polls usp_Todo_GetDueAlerts
 * (via pollDueAlertsAction) and fires browser Notification API calls for any
 * alert that is due and has not yet been notified this session.
 *
 * Lifecycle:
 *  1. Permission is requested lazily on the first due alert (not on mount).
 *  2. Once granted, each due alert fires ONE notification per session (tracked
 *     in the module-level `notifiedIds` Set).
 *  3. The interval is cleared on unmount (shell navigation / sign-out).
 *
 * The hook is intentionally side-effect only — it has no return value and
 * mounts silently. Place it in a Client Component that stays mounted for the
 * whole session (AppShell).
 */
export function useAlertPoller(): void {
  // Stable ref to the poll function so the interval closure stays fresh.
  const pollRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const poll = useCallback(async () => {
    let alerts: DueAlert[];
    try {
      alerts = await pollDueAlertsAction();
    } catch {
      // Network error / server restart — silently skip this tick.
      return;
    }

    if (alerts.length === 0) return;

    // Request permission once, lazily, only when there is actually something to show.
    const canNotify = await ensurePermission();
    if (!canNotify) return;

    for (const alert of alerts) {
      if (notifiedIds.has(alert.todoAlertId)) continue;
      notifiedIds.add(alert.todoAlertId);
      fireNotification(alert.title, alert.todoItemId);
    }
  }, []);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    // Run immediately on mount so the user gets notified on page load too,
    // then repeat every POLL_INTERVAL_MS.
    void poll();
    const id = setInterval(() => {
      void pollRef.current?.();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once — the interval captures pollRef, not poll directly
}
