"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the page's data when its window comes to the front, so a save from another window shows. */
export function useRefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
}
