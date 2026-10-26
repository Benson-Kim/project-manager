"use client";

import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { GANTT_SCALES, type GanttScale } from "./gantt-scale";
import { WBS_VIEWS, type BranchLayout, type WbsView } from "./wbs-diagram-layout";
import type { WbsTab } from "./wbs-row";

const W = messages.keyDeliverables.wbs;

export interface ToolbarCommand {
  run: () => void;
  /** Not offered at all (no permission). */
  hidden?: boolean;
  disabled?: boolean;
  pending?: boolean;
}

export interface WbsToolbarProps {
  addItem: ToolbarCommand;
  addSubItem: ToolbarCommand;
  addMilestone: ToolbarCommand;
  indent: ToolbarCommand;
  outdent: ToolbarCommand;
  moveUp: ToolbarCommand;
  moveDown: ToolbarCommand;
  moveTo: ToolbarCommand;
  rename: ToolbarCommand;
  details: ToolbarCommand;
  remove: ToolbarCommand;
  expandAll: ToolbarCommand;
  collapseAll: ToolbarCommand;
  /** How the selected parent's sub-items are laid out in the WBS diagram; null when none is. */
  subItems: {
    value: BranchLayout | "auto";
    onChange: (layout: BranchLayout | "auto") => void;
  } | null;
  view: WbsView;
  onView: (view: WbsView) => void;
  scale: GanttScale;
  onScale: (scale: GanttScale) => void;
  tab: WbsTab;
  onTab: (tab: WbsTab) => void;
  /** Links the schedule cannot satisfy, because an end they depend on has no date (ADR-0046). */
  unmet: number;
  /** Changes are still being sent to the server. */
  saving: boolean;
}

function Command({
  label,
  command,
  testId,
  variant = "secondary",
}: {
  label: string;
  command: ToolbarCommand;
  testId: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  if (command.hidden) return null;
  return (
    <Button
      variant={variant}
      data-testid={testId}
      disabled={command.disabled}
      pending={command.pending}
      onClick={command.run}
    >
      {label}
    </Button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  testId: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex rounded-md border border-line ${className ?? ""}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          data-testid={`${testId}-${option.value}`}
          onClick={() => onChange(option.value)}
          className={`min-h-10 cursor-pointer px-4 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
            value === option.value
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-raised"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const VIEW_OPTIONS = WBS_VIEWS.map((value) => ({ value, label: W.views[value] }));
const SCALE_OPTIONS = GANTT_SCALES.map((value) => ({ value, label: W.scales[value] }));
const LAYOUT_OPTIONS = (["auto", "row", "list"] as const).map((value) => ({
  value,
  label: W.layouts[value],
}));
const TAB_OPTIONS = [
  { value: "outline" as const, label: W.outlineTab },
  { value: "chart" as const, label: W.chartTab },
];

/**
 * The WBS editor's commands (ADR-0027): add, indent, move and rename act on
 * the selected item in either view; the view switches between the WBS
 * diagram and the Gantt. In the diagram, Sub-items sets how the selected
 * parent's branch is laid out. In the Gantt, the scale switches the timeline
 * between days, weeks and months, and on a phone the outline and the chart
 * are two tabs.
 */
export function WbsToolbar(props: WbsToolbarProps) {
  const gantt = props.view === "gantt";
  return (
    <div data-gantt-toolbar="" className="flex flex-col gap-2 print:hidden">
      <div
        role="toolbar"
        aria-label={messages.keyDeliverables.ganttTitle}
        className="flex flex-wrap items-center gap-2"
      >
        <Command label={W.addItem} command={props.addItem} testId="wbs-add" variant="primary" />
        <Command label={W.addSubItem} command={props.addSubItem} testId="wbs-add-sub" />
        <Command label={W.addMilestone} command={props.addMilestone} testId="wbs-add-milestone" />
        <Command label={W.indent} command={props.indent} testId="wbs-indent" />
        <Command label={W.outdent} command={props.outdent} testId="wbs-outdent" />
        <Command label={W.moveUp} command={props.moveUp} testId="wbs-move-up" />
        <Command label={W.moveDown} command={props.moveDown} testId="wbs-move-down" />
        <Command label={W.moveTo} command={props.moveTo} testId="wbs-move-to" />
        <Command label={W.rename} command={props.rename} testId="wbs-rename" />
        <Command label={W.details} command={props.details} testId="wbs-details" />
        <Command label={W.delete} command={props.remove} testId="wbs-delete" variant="danger" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={W.display}
          value={props.view}
          options={VIEW_OPTIONS}
          onChange={props.onView}
          testId="wbs-view"
        />
        {gantt ? (
          <>
            <Segmented
              label={W.scale}
              value={props.scale}
              options={SCALE_OPTIONS}
              onChange={props.onScale}
              testId="wbs-scale"
            />
            <Segmented
              label={W.view}
              value={props.tab}
              options={TAB_OPTIONS}
              onChange={props.onTab}
              className="md:hidden"
              testId="wbs-tab"
            />
          </>
        ) : props.subItems ? (
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sm text-ink-muted">
              {W.subItems}
            </span>
            <Segmented
              label={W.subItems}
              value={props.subItems.value}
              options={LAYOUT_OPTIONS}
              onChange={props.subItems.onChange}
              testId="wbs-sub-items"
            />
          </div>
        ) : null}
        <Command
          label={W.expandAll}
          command={props.expandAll}
          testId="wbs-expand-all"
          variant="secondary"
        />
        <Command
          label={W.collapseAll}
          command={props.collapseAll}
          testId="wbs-collapse-all"
          variant="secondary"
        />
        {props.unmet > 0 ? (
          <span data-testid="wbs-unmet" className="text-sm text-danger">
            {W.notMet(props.unmet)}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          data-testid="wbs-saving"
          className={`text-sm text-ink-muted ${props.saving ? "" : "invisible"}`}
        >
          {messages.feedback.savingState}
        </span>
      </div>
      <p className="text-xs text-ink-muted">{(gantt ? W.hints : W.diagramHints).join(" ")}</p>
    </div>
  );
}
