"use client";

import { Menu, MenuButton, MenuCheckbox } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import type { GanttDisplay } from "./gantt-layout";
import type { ToolbarCommand } from "./wbs-toolbar";

const W = messages.keyDeliverables.wbs;
const B = W.board;

const DISPLAY_LABELS: Record<keyof GanttDisplay, string> = {
  progress: B.progress,
  dates: B.dates,
  today: B.today,
  assignees: W.meta.people,
  milestones: W.milestoneStrip.label,
};

export interface GanttToolsProps {
  /** The toolbar's own add commands, so both places add the same way. */
  addItem: ToolbarCommand;
  addMilestone: ToolbarCommand;
  onCopySummary(): void;
  display: GanttDisplay;
  onDisplay(change: Partial<GanttDisplay>): void;
}

const iconButton =
  "flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-coral";
const icon =
  "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]";

/**
 * The bar floating at the foot of the Gantt: Add (an item or a milestone), copy a text summary
 * of the plan, and the Display menu of what the cards and chart show.
 */
export function GanttTools({
  addItem,
  addMilestone,
  onCopySummary,
  display,
  onDisplay,
}: GanttToolsProps) {
  return (
    <div
      role="group"
      aria-label={B.tools}
      data-testid="gantt-tools"
      className="absolute bottom-4 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-surface px-2 shadow-lg print:hidden"
    >
      {addItem.hidden ? null : (
        <Menu
          label={B.add}
          align="start"
          testId="gantt-tools-add"
          trigger={
            <>
              <span aria-hidden="true">+</span> {B.add} <span aria-hidden="true">▾</span>
            </>
          }
          triggerClassName="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-coral disabled:opacity-50"
        >
          <MenuButton testId="gantt-tools-add-item" onClick={addItem.run}>
            {W.addItem}
          </MenuButton>
          <MenuButton testId="gantt-tools-add-milestone" onClick={addMilestone.run}>
            {W.addMilestone}
          </MenuButton>
        </Menu>
      )}
      <button
        type="button"
        aria-label={B.copySummary}
        title={B.copySummary}
        data-testid="gantt-tools-copy"
        onClick={onCopySummary}
        className={iconButton}
      >
        <svg viewBox="0 0 16 16" className={icon} aria-hidden="true">
          <path d="M9 2l5 5-5 5V9c-4 0-6 1-7 4 0-4 2-7 7-8z" />
        </svg>
      </button>
      <Menu
        label={B.display}
        testId="gantt-tools-display"
        trigger={
          <svg viewBox="0 0 16 16" className={icon} aria-hidden="true">
            <circle cx="8" cy="8" r="2.5" />
            <circle cx="8" cy="8" r="6" />
          </svg>
        }
        triggerClassName={iconButton}
      >
        {(Object.keys(DISPLAY_LABELS) as (keyof GanttDisplay)[]).map((key) => (
          <MenuCheckbox
            key={key}
            checked={display[key]}
            onChange={(shown) => onDisplay({ [key]: shown })}
            testId={`gantt-show-${key}`}
          >
            {DISPLAY_LABELS[key]}
          </MenuCheckbox>
        ))}
      </Menu>
    </div>
  );
}
