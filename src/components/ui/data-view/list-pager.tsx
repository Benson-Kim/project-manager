"use client";

import { messages } from "@/lib/messages";
import { useListUrlState } from "./use-list-url-state";

const PAGE_BUTTON =
  "min-h-11 rounded-md border border-line px-4 text-sm font-medium text-ink disabled:opacity-50";

/** Previous / next for a paged list; each step pushes ?page= so Back returns to the last page. */
export function ListPager({
  page,
  pages,
  className = "",
}: {
  page: number;
  pages: number;
  className?: string;
}) {
  const { update } = useListUrlState();
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={messages.list.page(page, pages)}
      className={`flex items-center justify-between ${className}`}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => update({ page: String(page - 1) }, { push: true })}
        className={PAGE_BUTTON}
      >
        {messages.list.previousPage}
      </button>
      <p className="text-sm text-ink-muted">{messages.list.page(page, pages)}</p>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => update({ page: String(page + 1) }, { push: true })}
        className={PAGE_BUTTON}
      >
        {messages.list.nextPage}
      </button>
    </nav>
  );
}
