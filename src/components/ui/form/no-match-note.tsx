"use client";

/**
 * The live note under a picker while its typed text names no option. The status region stays
 * mounted, so a screen reader hears the note as it appears.
 */
export function NoMatchNote({
  unmatched,
  text,
  clear,
  render,
}: {
  unmatched: boolean;
  text: string;
  clear: () => void;
  render: (text: string, clear: () => void) => React.ReactNode;
}) {
  return (
    <div role="status">
      {unmatched ? (
        <div className="mt-1 text-xs text-ink-muted">{render(text.trim(), clear)}</div>
      ) : null}
    </div>
  );
}
