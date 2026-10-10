import { messages } from "@/lib/messages";

/**
 * The three list/content states : empty (no data at all — states the
 * one next action), zero-result (search/filters matched nothing) and error
 * (with retry). No decoration, no hints — one title, one optional line, one
 * optional action.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-12 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {body ? <p className="max-w-sm text-sm text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, onRetry }: { title?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-lg border border-danger bg-danger-soft px-4 py-12 text-center"
    >
      <p className="text-base font-medium text-ink">{title ?? messages.app.errorTitle}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-6 text-sm font-medium text-ink"
        >
          {messages.app.retry}
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-surface-sunken ${className ?? ""}`}
    />
  );
}

/** Standard list-page skeleton for loading.tsx templates. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <output aria-label={messages.app.loading} className="flex w-full flex-col gap-2">
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </output>
  );
}

/**
 * Render helper for list pages: returns the zero-results EmptyState when
 * filters are active, or the module-specific empty state otherwise.
 * Eliminates the repeated filtersActive ternary in every view component.
 *
 * This is a render helper (returns JSX), not a pure utility — call it only
 * from Client Component render paths, not from Server Components.
 */
export function listEmptyState(
  filtersActive: boolean,
  emptyBody: string,
  newAction?: React.ReactNode,
): React.ReactNode {
  if (filtersActive) {
    return (
      <EmptyState title={messages.list.zeroResultsTitle} body={messages.list.zeroResultsBody} />
    );
  }
  return <EmptyState title={messages.list.emptyTitle} body={emptyBody} action={newAction} />;
}
