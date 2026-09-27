"use client";

import { SearchInput } from "@/components/ui/data-view/search-input";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Select } from "@/components/ui/form/inputs";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";
import { SUPPLIER_RATINGS } from "../schemas/supplier";

/**
 * Suppliers toolbar: search + rating filter + view toggle (passed as children
 * by DataView's renderToolbar). All controls on one line inside the shared
 * Toolbar shell. Project scope comes from the route.
 */
export function SuppliersToolbar({ children }: { children?: React.ReactNode }) {
  const { searchParams, update } = useListUrlState();

  return (
    <Toolbar>
      {/* Search */}
      <SearchInput testId="suppliers-search" />

      {/* Rating filter */}
      <label>
        <span className="sr-only">{messages.suppliers.rating}</span>
        <Select
          name="rating"
          data-testid="filter-rating"
          value={searchParams.get("rating") ?? ""}
          onChange={(e) => update({ rating: e.target.value || null })}
          className="w-auto"
        >
          <option value="">{messages.suppliers.allRatings}</option>
          {SUPPLIER_RATINGS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </label>

      {/* View toggle — injected by DataView via renderToolbar */}
      {children}
    </Toolbar>
  );
}
