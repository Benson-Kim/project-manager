"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "@/components/ui/data-view/use-list-url-state";
import { Toolbar } from "@/components/ui/toolbar";
import { messages } from "@/lib/messages";

/**
 * Suppliers toolbar: debounced search forwarded 1:1 to usp_Supplier_List
 * @Search (SupplierName/ContactPerson/City). Project scope comes from the
 * route (ADR-0018) — no project filter here.
 */
export function SuppliersToolbar() {
  const { searchParams, update } = useListUrlState();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update({ q: value || null }), 250);
  };

  return (
    <Toolbar>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{messages.list.search}</span>
        <input
          type="search"
          autoComplete="off"
          placeholder={messages.list.search}
          data-testid="suppliers-search"
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </Toolbar>
  );
}
