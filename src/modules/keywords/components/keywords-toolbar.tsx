"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Keywords toolbar: search + view toggle (passed as children by DataView's
 * renderToolbar). Project scope comes from the route .
 */
export function KeywordsToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      <SearchInput testId="keywords-search" />
      {children}
    </Toolbar>
  );
}
