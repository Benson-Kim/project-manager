"use client";

import { AvatarStack } from "@/components/ui/avatar-stack";
import { ProgressBar } from "@/components/ui/progress-bar";
import { planLine, TONES } from "@/components/ui/tones";
import { toDateInput } from "@/lib/format";
import { messages } from "@/lib/messages";
import { requirementChip, type WbsNode } from "../schemas/wbs";
import { requirementTally, type GanttDisplay } from "./gantt-layout";
import { PriorityChip, PrioritySelect } from "./priority-select";

const W = messages.keyDeliverables.wbs;
const C = W.card;

export interface GanttCardProps {
  node: WbsNode;
  /** Its sub-items and theirs, depth first; `depth` 1 for its own. */
  tiles: readonly { node: WbsNode; depth: number }[];
  progress: number;
  display: GanttDisplay;
  open: boolean;
  selected: boolean;
  /** The requirements panel below the chart shows this card's. */
  listing: boolean;
  /** Its right edge drags its end: a dated leaf that is not a milestone, for editors. */
  resizable: boolean;
  dragging: boolean;
  style?: React.CSSProperties;
  onSelect(): void;
  onToggle(): void;
  onRequirements(): void;
  /** Sets the priority picked from the list; absent for viewers. */
  onPriority?(priority: string | null): void;
}

function datesText(node: WbsNode): string {
  if (!node.start || !node.end) return C.noDates;
  const start = toDateInput(node.start);
  const end = toDateInput(node.end);
  return start === end ? start : `${start} – ${end}`;
}

/** A checklist: the requirements chip's icon. */
function ChecklistIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-[11px] fill-none stroke-current stroke-[1.6]"
    >
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M5 7h6M5 10h4" />
    </svg>
  );
}

/**
 * One Gantt card: a white title bar outlined in the item's colour, with the
 * status colour down its left edge, the name (the handle that drags it), the
 * met/total requirements chip that opens the requirements panel, and the
 * chevron that shows its sub-items (or its requirements when it has none).
 * Under it a meta strip with the priority, dates and progress; then the people
 * on it. Opened, one outline goes round all of it and its sub-items.
 */
export function GanttCard({
  node,
  tiles,
  progress,
  display,
  open,
  selected,
  listing,
  resizable,
  dragging,
  style,
  onSelect,
  onToggle,
  onRequirements,
  onPriority,
}: GanttCardProps) {
  const id = node.item.id;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const { met, total } = requirementTally(node.item.requirements);
  const line = planLine(node.depth, node.item.color);
  return (
    <li
      data-gantt-card={id}
      data-gantt-item={id}
      data-gantt-bar={id}
      data-testid={`gantt-card-${id}`}
      style={style}
      className={`relative flex shrink-0 flex-col text-left print:break-inside-avoid print:[print-color-adjust:exact] ${
        open ? `rounded-[10px] border-2 bg-surface p-1.5 ${line.border}` : ""
      } ${selected ? "rounded-[10px] ring-[3px] ring-coral ring-offset-1 ring-offset-surface" : ""} ${dragging ? "z-10 opacity-90 shadow-lg" : ""}`}
      onPointerDown={onSelect}
    >
      {resizable ? (
        <span
          aria-hidden="true"
          data-gantt-resize={id}
          data-testid={`gantt-card-${id}-end`}
          className={`absolute -right-1.5 z-10 h-[30px] w-3 cursor-ew-resize touch-none print:hidden ${open ? "top-1.5" : "top-0"}`}
        />
      ) : null}
      <div
        className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-[8px] bg-surface pr-1.5 pl-2 ${line.border} ${
          open ? "h-[26px] border-l-[7px]" : "h-[30px] border-2 border-l-[7px]"
        } ${TONES[node.color].bar}`}
      >
        <button
          type="button"
          data-gantt-handle={id}
          data-testid={`gantt-card-${id}-name`}
          title={name}
          onClick={onSelect}
          className={`min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-focus ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <span className="mr-1.5 text-[10px] font-normal text-ink-muted tabular-nums">
            {node.code}
          </span>
          {name}
        </button>
        <button
          type="button"
          aria-label={C.requirementsOf(name, met, total)}
          aria-pressed={listing}
          data-testid={`gantt-card-${id}-requirements`}
          onClick={onRequirements}
          className={`inline-flex shrink-0 cursor-pointer items-center gap-[3px] rounded-sm border px-[5px] py-0.5 text-[10px] tabular-nums hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-coral ${listing ? "border-coral text-ink" : "border-line text-ink-muted"}`}
        >
          <ChecklistIcon />
          {C.requirements(met, total)}
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? C.collapse(name) : C.expand(name)}
          data-testid={`gantt-card-${id}-toggle`}
          onClick={onToggle}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-coral"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className={`size-3.5 fill-none stroke-current stroke-[2.2] transition-transform [stroke-linecap:round] [stroke-linejoin:round] ${open ? "rotate-180" : ""}`}
          >
            <path d="M3 6l5 5 5-5" />
          </svg>
        </button>
      </div>

      <div className="mt-[5px] flex min-w-0 items-center gap-2 rounded-[8px] border border-line bg-surface px-2 py-1 text-[10px] whitespace-nowrap text-ink-muted">
        {onPriority ? (
          <PrioritySelect
            name={name}
            value={node.item.priority}
            onChange={onPriority}
            testId={`gantt-card-${id}-priority`}
            compact
          />
        ) : (
          <PriorityChip value={node.item.priority} />
        )}
        {display.dates ? (
          <span data-testid={`gantt-card-${id}-dates`} className="truncate tabular-nums">
            {datesText(node)}
          </span>
        ) : null}
        {display.progress ? (
          <ProgressBar
            value={progress}
            label={W.meta.workOf(name)}
            showValue
            fill={line.fill}
            valueClassName="text-[10px] font-semibold text-ink"
            className="min-w-16 flex-1"
          />
        ) : null}
      </div>

      {display.assignees ? (
        <div className="mt-[5px] flex h-6 items-center">
          <AvatarStack
            names={node.item.assignees.map((a) => a.name)}
            emptyLabel={messages.keyDeliverables.unassigned}
            max={4}
            size="sm"
          />
        </div>
      ) : null}

      {open ? (
        <ul
          data-testid={`gantt-card-${id}-body`}
          className={`m-0 mt-2 list-none p-0 ${tiles.length > 0 ? "grid grid-cols-2 gap-x-3 gap-y-2.5" : "flex flex-col gap-1"}`}
        >
          {tiles.length > 0 ? (
            tiles.map(({ node: tile }) => (
              <li
                key={tile.item.id}
                data-gantt-bar={tile.item.id}
                data-testid={`gantt-tile-${tile.item.id}`}
                title={tile.item.name || undefined}
                className={`flex h-7 min-w-0 items-center rounded-[8px] border-2 border-l-[7px] bg-surface px-2 text-xs font-semibold text-ink ${planLine(tile.depth, tile.item.color).border} ${TONES[tile.color].bar}`}
              >
                <span className="truncate">
                  <span className="mr-1 text-[10px] font-normal text-ink-muted tabular-nums">
                    {tile.code}
                  </span>
                  {tile.item.name || messages.keyDeliverables.deliverableFallback(tile.item.id)}
                </span>
              </li>
            ))
          ) : node.item.requirements.length > 0 ? (
            node.item.requirements.map((requirement) => (
              <li key={requirement.id} className="flex items-start gap-1.5 text-xs text-ink">
                <span
                  aria-hidden="true"
                  className={requirement.isMet ? "text-success" : "text-ink-faint"}
                >
                  {requirement.isMet ? "✓" : "○"}
                </span>
                <span className="text-ink-muted tabular-nums">{requirementChip(requirement)}</span>
                <span className="min-w-0 break-words">{requirement.text}</span>
              </li>
            ))
          ) : (
            <li className="text-xs text-ink-muted italic">{C.empty}</li>
          )}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * A milestone in its lane: a diamond on its day, filled once reached. It is a button like a
 * card's name, so it selects, opens its menu, takes the arrow keys and drags; its 40 px target
 * reaches past the diamond.
 */
export function GanttMilestone({
  node,
  reached,
  selected,
  style,
  onSelect,
}: {
  node: WbsNode;
  reached: boolean;
  selected: boolean;
  style?: React.CSSProperties;
  onSelect(): void;
}) {
  const id = node.item.id;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(id);
  const date = node.start ? toDateInput(node.start) : C.noDates;
  return (
    <li
      data-gantt-card={id}
      data-gantt-item={id}
      data-gantt-bar={id}
      data-testid={`gantt-milestone-${id}`}
      data-reached={reached}
      style={style}
      className="flex size-6 shrink-0 items-center justify-center"
    >
      <button
        type="button"
        data-gantt-handle={id}
        aria-label={C.milestone(name, date)}
        title={`${name} · ${date}`}
        onClick={onSelect}
        className={`relative flex size-6 cursor-grab items-center justify-center rounded-sm before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-focus ${selected ? "ring-[3px] ring-coral ring-offset-1 ring-offset-surface" : ""}`}
      >
        <span
          aria-hidden="true"
          className={`size-3 rotate-45 border-2 border-ink ${reached ? "bg-ink" : "bg-surface"}`}
        />
      </button>
    </li>
  );
}
