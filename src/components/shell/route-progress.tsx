"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top progress bar for route transitions (ADR-0008): a thin accent bar that
 * flashes briefly after each navigation completes rendering. Stateless — the
 * element is re-keyed per navigation and a CSS animation (route-progress-flash
 * in globals.css, killed by prefers-reduced-motion) does the rest.
 * Suspense/loading.tsx carry the real pending feedback.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div
      key={`${pathname}?${searchParams}`}
      aria-hidden="true"
      className="route-progress fixed inset-x-0 top-0 z-(--z-toast) h-0.5 origin-left bg-accent"
    />
  );
}
