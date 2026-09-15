"use client";

import { useEffect, useState } from "react";
import { messages } from "@/lib/messages";

/** PWA connectivity banner (ADR-0008): offline warning, brief back-online note. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [cameBack, setCameBack] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOffline = () => {
      setOffline(true);
      setCameBack(false);
    };
    const onOnline = () => {
      setOffline(false);
      setCameBack(true);
      setTimeout(() => setCameBack(false), 3000);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
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
