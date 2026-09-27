"use client";

import { messages } from "@/lib/messages";
import { useSearchInput } from "./use-search-input";

/**
 * The standard debounced + flush-on-blur search field.
 * Accessible: visible sr-only label satisfies §5.1 no-hints rule (no placeholder).
 * Inject testId to keep e2e selectors module-specific.
 */
export function SearchInput({ testId }: { testId: string }) {
  const { value, onChange, onBlur } = useSearchInput();
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{messages.list.search}</span>
      <input
        type="search"
        autoComplete="off"
        data-testid={testId}
        className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
