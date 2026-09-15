"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Top progress bar for route transitions (ADR-0008): a thin accent bar that
 * appears briefly after each navigation completes rendering. Deliberately
 * simple — Suspense/loading.tsx carry the real pending feedback.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), 300);
    return () => clearTimeout(timeout);
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 top-0 z-(--z-toast) h-0.5 origin-left bg-accent transition-transform duration-(--duration-slow) ${
        visible ? "scale-x-100" : "scale-x-0"
      }`}
    />
  );
}
