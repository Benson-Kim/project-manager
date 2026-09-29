"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "./use-list-url-state";
import { messages } from "@/lib/messages";

/**
 * Controlled search input — debounces 250 ms, syncs to ?q= URL param.
 * Used inside module toolbars so all modules share the same behaviour.
 */
export function SearchInput({
  testId,
  placeholder,
}: {
  testId?: string;
  placeholder?: string;
}) {
  const { searchParams, update } = useListUrlState();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync controlled value if the URL param changes externally (e.g. clear-filters).
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update({ q: value || null }), 250);
  };

  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{placeholder ?? messages.list.search}</span>
      <input
        type="search"
        autoComplete="off"
        placeholder={placeholder ?? messages.list.search}
        data-testid={testId ?? "search-input"}
        className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
