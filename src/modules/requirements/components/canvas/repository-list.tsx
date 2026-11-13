"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GripIcon } from "@/components/ui/action-icons";
import { buttonClass } from "@/components/ui/button-styles";
import { Input, Switch } from "@/components/ui/form/inputs";
import { messages } from "@/lib/messages";
import { itemKey, type CanvasGaps } from "../../canvas/gaps";
import {
  CANVAS_TYPE_FILTERS,
  filterRepository,
  type CanvasTypeFilter,
} from "../../canvas/repository-filter";
import type { CanvasItem } from "../../schemas/canvas";
import { CANVAS_ITEM_MIME } from "./canvas-board";
import { chip, GapChips, ItemBadge } from "./item-chips";

const M = messages.requirements.canvas;

function RepositoryCard({
  item,
  gap,
  selected,
  canEdit,
  onSelect,
  onReveal,
}: {
  item: CanvasItem;
  gap: CanvasGaps | undefined;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onReveal: () => void;
}) {
  const placeable = canEdit && !item.OnCanvas;
  return (
    <li
      draggable={placeable}
      onDragStart={(event) =>
        event.dataTransfer.setData(CANVAS_ITEM_MIME, itemKey(item.Kind, item.ItemId))
      }
      className="flex items-start gap-1"
    >
      {placeable ? <GripIcon className="mt-2 h-3.5 w-2 shrink-0 cursor-grab fill-ink-muted" /> : null}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        data-testid={`canvas-item-${item.Kind}-${item.ItemId}`}
        className={`flex min-w-0 flex-1 flex-col gap-1 rounded-md border p-2 text-left ${
          selected ? "border-accent bg-surface-raised" : "border-line bg-surface"
        }`}
      >
        <span className="flex flex-wrap items-center gap-1">
          <ItemBadge type={item.Type} refLabel={item.Ref} />
          {item.OnCanvas ? (
            <span className={`${chip} border-line text-ink-muted`}>{M.onCanvas}</span>
          ) : null}
          <GapChips gap={gap} />
        </span>
        <span className="line-clamp-2 text-sm font-medium text-ink">{item.Title}</span>
        {item.Summary ? (
          <span className="line-clamp-2 text-xs text-ink-muted">{item.Summary}</span>
        ) : null}
      </button>
      {placeable ? (
        <button
          type="button"
          aria-label={M.reveal(item.Ref)}
          onClick={onReveal}
          className="min-h-8 min-w-8 rounded border border-line text-ink-muted"
        >
          +
        </button>
      ) : null}
    </li>
  );
}

/** Left pane: every item in the project. The text is shown as plain text, never as HTML. */
export function RepositoryList({
  items,
  gaps,
  canEdit,
  newRequirementHref,
  selectedKey,
  onSelect,
  onReveal,
}: {
  items: readonly CanvasItem[];
  gaps: ReadonlyMap<string, CanvasGaps>;
  canEdit: boolean;
  newRequirementHref?: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onReveal: (item: CanvasItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CanvasTypeFilter>("All");
  const [gapsOnly, setGapsOnly] = useState(false);
  const shown = useMemo(
    () => filterRepository(items, gaps, { query, type, gapsOnly }),
    [items, gaps, query, type, gapsOnly],
  );
  const onCanvas = items.filter((item) => item.OnCanvas).length;

  return (
    <section
      aria-label={M.repository(items.length)}
      className="flex min-h-0 flex-col gap-2 border-line p-3 lg:border-r print:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">{M.repository(items.length)}</h2>
        {newRequirementHref ? (
          <Link
            href={newRequirementHref}
            scroll={false}
            data-testid="canvas-new-requirement"
            className={buttonClass("secondary", "compact")}
          >
            {messages.requirements.newRequirement}
          </Link>
        ) : null}
      </div>
      <Input
        type="search"
        aria-label={M.search}
        placeholder={M.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="group" aria-label={M.types} className="flex flex-wrap gap-1">
        {CANVAS_TYPE_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={type === option}
            onClick={() => setType(option)}
            className={`min-h-8 rounded border px-2 text-xs font-medium ${
              type === option
                ? "border-accent bg-surface-raised text-ink"
                : "border-line text-ink-muted"
            }`}
          >
            {option === "All" ? M.all : option}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
        <Switch
          label={M.gapsOnly}
          checked={gapsOnly}
          onChange={(event) => setGapsOnly(event.target.checked)}
        />
        <span data-testid="canvas-on-count">{M.onCanvasCount(onCanvas)}</span>
      </div>
      {shown.length === 0 ? (
        <p className="p-2 text-sm text-ink-muted">{M.noMatch}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {shown.map((item) => {
            const key = itemKey(item.Kind, item.ItemId);
            return (
              <RepositoryCard
                key={key}
                item={item}
                gap={gaps.get(key)}
                selected={selectedKey === key}
                canEdit={canEdit}
                onSelect={() => onSelect(key)}
                onReveal={() => onReveal(item)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
