"use client";

import { ListFilter } from "@/components/ui/data-view/list-filter";
import { SearchInput } from "@/components/ui/data-view/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Suppliers toolbar: search + rating filter + view toggle (passed as children
 * by DataView's renderToolbar). All controls on one line inside the shared
 * Toolbar shell. Project scope comes from the route.
 */
export function SuppliersToolbar({ children }: { children?: React.ReactNode }) {
  return (
    <Toolbar>
      {/* Search */}
      <SearchInput testId="suppliers-search" />

      {/* Rating filter */}
      <ListFilter
        list="supplier.rating"
        param="rating"
        label={messages.suppliers.rating}
        allLabel={messages.suppliers.allRatings}
        testId="filter-rating"
      />

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
