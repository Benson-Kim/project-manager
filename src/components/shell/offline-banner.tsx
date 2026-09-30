"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { messages } from "@/lib/messages";

/*
 * navigator.onLine as an external store: the server snapshot is "online" and
 * the client re-syncs after hydration (covers loading the app while offline)
 * without setState-in-effect.
 */
function subscribeToConnectivity(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** PWA connectivity banner : offline warning, brief back-online note. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const [cameBack, setCameBack] = useState(false);
  const offline = !online;

  useEffect(() => {
    // State changes happen only inside event/timeout callbacks.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      setCameBack(true);
      timeout = setTimeout(() => setCameBack(false), 3000);
    };
    const onOffline = () => {
      clearTimeout(timeout);
      setCameBack(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline && !cameBack) return null;

  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-(--z-toast) p-2 text-center text-sm font-medium ${
        offline ? "bg-warning-soft text-ink" : "bg-success-soft text-ink"
      }`}
    >
      {offline ? messages.app.offline : messages.app.online}
    </div>
  );
}
