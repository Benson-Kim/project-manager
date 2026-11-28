"use client";

import { Menu, MenuButton, MenuCheckbox } from "@/components/ui/menu";
import { messages } from "@/lib/messages";
import type { GanttDisplay } from "./gantt-layout";
import type { GanttDisplaySettings } from "./use-gantt-display";
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
  display: GanttDisplaySettings;
  onDisplay(change: Partial<GanttDisplaySettings>): void;
  undatedCount?: number;
}

const iconButton =
  "flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-coral";
const icon =
  "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]";

/**
 * The bar under the Gantt: Add (an item or a milestone), copy a text summary
 * of the plan, the Critical path toggle, and the Display menu of what the cards and chart show.
 */
export function GanttTools({
  addItem,
  addMilestone,
  onCopySummary,
  display,
  onDisplay,
  undatedCount = 0,
}: GanttToolsProps) {
  return (
    <div
      role="group"
      aria-label={B.tools}
      data-testid="gantt-tools"
      className="flex h-auto min-h-12 max-w-full flex-wrap items-center gap-1 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-lg print:hidden"
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
          triggerClassName="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-coral disabled:opacity-50"
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
      <button
        type="button"
        aria-pressed={display.criticalPath}
        data-testid="gantt-tools-critical-path"
        onClick={() => onDisplay({ criticalPath: !display.criticalPath })}
        className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs focus-visible:outline-2 focus-visible:outline-coral ${
          display.criticalPath
            ? "border-danger bg-danger-soft font-semibold text-danger"
            : "border-transparent text-ink hover:bg-surface-raised"
        }`}
      >
        <svg viewBox="0 0 16 16" className={icon} aria-hidden="true">
          <path d="M2 12h4l2-8 2 8h4" />
        </svg>
        {B.criticalPath}
      </button>
      {display.criticalPath && undatedCount > 0 ? (
        <span
          data-testid="gantt-critical-path-undated"
          role="status"
          className="px-1.5 text-xs text-ink-muted"
        >
          {B.criticalUndated(undatedCount)}
        </span>
      ) : null}
    </div>
  );
}
