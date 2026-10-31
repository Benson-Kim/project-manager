"use client";

import { Button } from "@/components/ui/button";
import { stripKeyTarget } from "../notebook-model";

/** The move arrows beside a strip; the button carries the accessible name. */
function MoveArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="M10 3.5L5.5 8l4.5 4.5" />
      ) : (
        <path d="M6 3.5L10.5 8 6 12.5" />
      )}
    </svg>
  );
}

const TAB_STYLES = {
  section: (selected: boolean) =>
    `-mb-px min-h-11 max-w-56 truncate border-b-2 px-3 text-sm font-semibold ${
      selected ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
    }`,
  page: (selected: boolean) =>
    `min-h-11 max-w-48 truncate rounded-md border px-3 text-sm font-medium ${
      selected
        ? "border-accent bg-surface-raised text-ink"
        : "border-line bg-surface text-ink-muted hover:bg-surface-raised"
    }`,
};

/**
 * One ARIA tablist of a notebook: its tabs ("section") or the pages of a tab
 * ("page"). Arrows, Home and End move between them; only the selected one is in
 * the tab order.
 */
export function TabStrip({
  level,
  label,
  items,
  activeId,
  onSelect,
  idPrefix,
  panelPrefix,
  testId,
}: {
  level: keyof typeof TAB_STYLES;
  label: string;
  items: { id: number; title: string }[];
  activeId: number | null;
  onSelect: (id: number) => void;
  idPrefix: string;
  panelPrefix: string;
  testId: string;
}) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = items.findIndex((item) => item.id === activeId);
    const next = stripKeyTarget(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    const target = items[next];
    onSelect(target.id);
    document.getElementById(`${idPrefix}${target.id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-wrap gap-1"
    >
      {items.map((item) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}${item.id}`}
            aria-selected={selected}
            aria-controls={`${panelPrefix}${item.id}`}
            tabIndex={selected ? 0 : -1}
            data-testid={testId}
            onClick={() => onSelect(item.id)}
            className={TAB_STYLES[level](selected)}
          >
            {item.title}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The two arrows that move the selected tab or page one place (client feedback
 * 2026-10-26: arrows beside the strip, not worded buttons by the editor). The
 * names stay on aria-label, so each is still announced.
 */
export function MoveButtons({
  leftLabel,
  rightLabel,
  canLeft,
  canRight,
  onMove,
  testId,
}: {
  leftLabel: string;
  rightLabel: string;
  canLeft: boolean;
  canRight: boolean;
  onMove: (offset: -1 | 1) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="secondary"
        aria-label={leftLabel}
        title={leftLabel}
        className="min-h-11 px-3"
        disabled={!canLeft}
        onClick={() => onMove(-1)}
        data-testid={`${testId}-left`}
      >
        <MoveArrow direction="left" />
      </Button>
      <Button
        variant="secondary"
        aria-label={rightLabel}
        title={rightLabel}
        className="min-h-11 px-3"
        disabled={!canRight}
        onClick={() => onMove(1)}
        data-testid={`${testId}-right`}
      >
        <MoveArrow direction="right" />
      </Button>
    </div>
  );
}
