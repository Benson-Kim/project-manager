"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { onOtherWindowSaved } from "@/lib/cross-window";

const SETTLE_MS = 300;

/**
 * Reloads this window's data when another window of the app saves: soon after, when this
 * window is on screen, or as soon as it comes back when it is hidden.
 */
export function CrossWindowSync() {
  const router = useRouter();
  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      pending = false;
      router.refresh();
    };
    const onSaved = () => {
      if (document.visibilityState !== "visible") {
        pending = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(refresh, SETTLE_MS);
    };
    const onReturn = () => {
      if (pending && document.visibilityState === "visible") refresh();
    };
    const stop = onOtherWindowSaved(onSaved);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearTimeout(timer);
      stop();
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [router]);
  return null;
}
