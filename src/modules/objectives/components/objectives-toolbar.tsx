"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";

/**
 * Objectives toolbar: search + view toggle (passed as children by DataView's
 * renderToolbar). Project scope comes from the route.
 */
export function ObjectivesToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="objectives-search" />
      {children}
    </Toolbar>
  );
}
