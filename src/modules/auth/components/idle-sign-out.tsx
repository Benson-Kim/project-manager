"use client";

import { useEffect } from "react";
import { NEVER_IDLE_TIMEOUT } from "@/lib/auth/idle-timeout";
import { idleSignOutAction } from "../actions";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const HEARTBEAT_MS = 60_000;
const CHECK_MS = 30_000;
/** Shared by every tab of this browser, so activity in one keeps the others signed in. */
const SHARED_KEY = "pm:lastActivity";

function sharedLastActivity(): number {
  try {
    return Number(localStorage.getItem(SHARED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function shareActivity(at: number): void {
  try {
    localStorage.setItem(SHARED_KEY, String(at));
  } catch {
    // Storage blocked: this tab still tracks its own activity.
  }
}

/**
 * Signs the user out after their idle time (ADR-0057). Only real input counts:
 * at most once a minute it reaches the session route, which re-issues the
 * cookie with the new activity time; nothing that runs in the background may.
 * A page load counts, so the cookie and this tab start from the same moment.
 * After a sleep or hibernation the first check signs out before any input
 * can count as activity.
 */
export function IdleSignOut({ idleTimeoutMinutes }: { idleTimeoutMinutes: number }) {
  useEffect(() => {
    // The server only learns of activity from a heartbeat, so the idle time is
    // counted from the last one: this tab and the cookie expire together.
    let lastHeartbeat = 0;
    let signingOut = false;
    const timeoutMs = idleTimeoutMinutes * 60_000;

    const expired = () =>
      idleTimeoutMinutes !== NEVER_IDLE_TIMEOUT &&
      lastHeartbeat > 0 &&
      Date.now() - Math.max(lastHeartbeat, sharedLastActivity()) > timeoutMs;

    const signOut = () => {
      if (signingOut) return;
      signingOut = true;
      idleSignOutAction().catch(() => {
        signingOut = false;
      });
    };

    const check = () => {
      if (expired()) signOut();
    };

    const onActivity = () => {
      if (signingOut) return;
      if (expired()) return signOut();
      const now = Date.now();
      if (now - lastHeartbeat < HEARTBEAT_MS) return;
      lastHeartbeat = now;
      shareActivity(now);
      void fetch("/api/auth/session", { cache: "no-store" }).catch(() => undefined);
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", check);
    onActivity();
    const timer = idleTimeoutMinutes === NEVER_IDLE_TIMEOUT ? null : setInterval(check, CHECK_MS);

    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", check);
      if (timer) clearInterval(timer);
    };
  }, [idleTimeoutMinutes]);

  return null;
}
