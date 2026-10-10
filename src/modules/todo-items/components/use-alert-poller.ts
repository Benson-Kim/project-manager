"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { localWallClock } from "@/lib/local-time";
import { messages } from "@/lib/messages";
import { registerPushSubscriptionAction } from "../actions";
import { armAlarmSound, playAlarmChime } from "./alarm-sound";

const POLL_INTERVAL_MS = 30_000;
/** Alarms already announced in this browser session, so a reload doesn't toast and chime again. */
const ANNOUNCED_KEY = "todo-alarms-announced";
const PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

/** A to-do alert whose date and time have come (GET /api/due-alerts). */
export interface DueAlarm {
  todoAlertId: number;
  todoItemId: number;
  title: string;
  rowVer: number;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function loadAnnounced(): Set<number> {
  try {
    const raw = sessionStorage.getItem(ANNOUNCED_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function saveAnnounced(ids: Set<number>): void {
  try {
    sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode, blocked): announcements just repeat after a reload.
  }
}

async function fetchDueAlarms(): Promise<DueAlarm[] | null> {
  try {
    // The browser's wall clock: alert times are the user's local times.
    const response = await fetch(`/api/due-alerts?now=${encodeURIComponent(localWallClock())}`, {
      credentials: "include",
    });
    return response.ok ? ((await response.json()) as DueAlarm[]) : null;
  } catch {
    return null;
  }
}

/** A desktop notification, when the user allowed them (same tag as Web Push: no duplicates). */
function notifyDesktop(alarm: DueAlarm, onOpen: () => void): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification(alarm.title, {
    body: messages.todoItems.alarmBody,
    icon: "/favicon.ico",
    tag: `todo-alert-${alarm.todoAlertId}`,
  });
  notification.onclick = () => {
    window.focus();
    onOpen();
  };
}

/** Web Push for closed-tab delivery, when configured (VAPID keys) and allowed. */
async function registerPush(): Promise<void> {
  if (!PUSH_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(PUSH_PUBLIC_KEY),
      }));
    const result = await registerPushSubscriptionAction(subscription.toJSON());
    if (!result.ok) throw new Error(result.error.message);
  } catch (error) {
    console.warn("[alerts] Web Push unavailable; the open app still polls:", error);
  }
}

/**
 * The to-do alarm (client feedback: "nothing happens when the time arrives").
 * While the app is open it asks every 30 s which alerts are due — always, not
 * only when desktop notifications are allowed — and announces each newly due
 * alert once: a toast that stays until closed (Open goes to the to-do), a
 * chime (alarm-sound.ts), a desktop notification when allowed, and the bell's
 * due list (returned here).
 * Snoozed, dismissed or completed alerts leave the due list, so a re-armed
 * alert announces again; an alert still due after a reload stays in the bell
 * without a second toast (announced ids live in sessionStorage). Web Push, when configured, covers closed tabs.
 */
export function useAlertPoller(): DueAlarm[] {
  const router = useRouter();
  const { toast } = useToast();
  const [due, setDue] = useState<DueAlarm[]>([]);

  useEffect(() => {
    let cancelled = false;
    const announced = loadAnnounced();
    armAlarmSound();

    const poll = async () => {
      const alarms = await fetchDueAlarms();
      if (cancelled || !alarms) return;
      setDue(alarms);
      const dueIds = new Set(alarms.map((alarm) => alarm.todoAlertId));
      for (const id of announced) if (!dueIds.has(id)) announced.delete(id);
      let fresh = false;
      for (const alarm of alarms) {
        if (announced.has(alarm.todoAlertId)) continue;
        fresh = true;
        announced.add(alarm.todoAlertId);
        const open = () => router.push(`/todo?id=${alarm.todoItemId}`);
        toast({
          variant: "warning",
          persist: true,
          title: messages.todoItems.alarmDue(alarm.title),
          action: { label: messages.todoItems.openAlarm, onAction: open },
        });
        notifyDesktop(alarm, open);
      }
      saveAnnounced(announced);
      // One chime per poll that brings new alarms, not one per alarm.
      if (fresh) playAlarmChime();
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void registerPush();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router, toast]);

  return due;
}
