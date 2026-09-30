"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * URL is the list state : q / sort / dir / view / page + module
 * filters. Updates replace history (no back-button spam) except page changes,
 * which push so back returns to the previous page.
 */
export function useListUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (changes: Record<string, string | null>, options?: { push?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      // Any change except explicit paging resets to page 1.
      if (!("page" in changes)) params.delete("page");
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options?.push) router.push(url);
      else router.replace(url);
    },
    [router, pathname, searchParams],
  );

  return { searchParams, update };
}
