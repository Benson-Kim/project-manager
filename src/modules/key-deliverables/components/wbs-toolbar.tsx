"use client";

import { Spinner } from "@/components/ui/spinner";
import { messages } from "@/lib/messages";
import { GANTT_SCALES, type GanttScale } from "./gantt-scale";
import { WBS_VIEWS, type WbsView } from "./wbs-diagram-layout";
import { Segmented } from "./wbs-segmented";

const W = messages.keyDeliverables.wbs;

export interface ToolbarCommand {
  run: () => void;
  /** Not offered at all (no permission). */
  hidden?: boolean;
  disabled?: boolean;
  pending?: boolean;
}

type Shown = { value: boolean; onChange: (value: boolean) => void } | null;

export interface WbsToolbarProps {
  addItem: ToolbarCommand;
  addSubItem: ToolbarCommand;
  addMilestone: ToolbarCommand;
  indent: ToolbarCommand;
  outdent: ToolbarCommand;
  moveUp: ToolbarCommand;
  moveDown: ToolbarCommand;
  moveTo: ToolbarCommand;
  /** Takes back the last move or reschedule. */
  undo: ToolbarCommand;
  rename: ToolbarCommand;
  details: ToolbarCommand;
  remove: ToolbarCommand;
  expandAll: ToolbarCommand;
  collapseAll: ToolbarCommand;
  copyCsv: ToolbarCommand;
  /** The boxes or cards name the people on them. */
  people: Shown;
  /** The WBS boxes show their dates, status and work, not just the code and name. */
  boxDetails?: Shown;
  /** The milestone strip above the diagram, or over the Gantt with its guides. */
  milestones: Shown;
  /** The editor fills the screen; null where the browser cannot. */
  fullscreen: { value: boolean; onChange: (fullscreen: boolean) => void } | null;
  view: WbsView;
  onView: (view: WbsView) => void;
  scale: GanttScale;
  onScale: (scale: GanttScale) => void;
  /** Links the schedule cannot satisfy, because an end they depend on has no date (ADR-0046). */
  unmet: number;
  /** Changes are still being sent to the server. */
  saving: boolean;
  /** The project's sticky note. */
  planNote?: React.ReactNode;
  /** Search and chips over the WBS diagram; absent in the Gantt. */
  filter?: React.ReactNode;
}

const tool =
  "inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40";

const TOOL_VARIANTS = {
  primary: "border-accent bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border-line bg-surface text-ink hover:bg-surface-raised",
  danger: "border-line bg-surface text-danger hover:bg-surface-raised",
} as const;

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
    <button
      type="button"
      data-testid={testId}
      disabled={command.disabled || command.pending}
      onClick={command.run}
      className={`${tool} ${TOOL_VARIANTS[variant]}`}
    >
      {command.pending ? <Spinner /> : null}
      {label}
    </button>
  );
}

function Toggle({
  label,
  pressed,
  onChange,
  testId,
}: {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={() => onChange(!pressed)}
      className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap text-ink hover:bg-surface-raised"
    >
      <span
        aria-hidden="true"
        className={`flex size-4 items-center justify-center rounded-sm border ${
          pressed ? "border-accent bg-accent text-on-accent" : "border-ink-muted bg-surface"
        }`}
      >
        {pressed ? (
          <svg viewBox="0 0 12 12" className="size-3">
            <path
              d="M2.5 6.2l2.2 2.2 4.8-4.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        ) : null}
      </span>
      {label}
    </button>
  );
}

const VIEW_OPTIONS = WBS_VIEWS.map((value) => ({ value, label: W.views[value] }));
const SCALE_OPTIONS = GANTT_SCALES.map((value) => ({ value, label: W.scales[value] }));

/**
 * The WBS editor's commands (ADR-0027): add, indent, move and rename act on
 * the selected item in either view; the view switches between the WBS
 * diagram and the Gantt. In the diagram, Sub-items sets how the selected
 * parent's branch is laid out. In the Gantt, the scale switches the timeline
 * between days, weeks and months; what the cards show is set from the bar at the chart's foot.
 */
export function WbsToolbar(props: WbsToolbarProps) {
  const gantt = props.view === "gantt";
  return (
    <div data-gantt-toolbar="" className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={W.display}
          value={props.view}
          options={VIEW_OPTIONS}
          onChange={props.onView}
          testId="wbs-view"
          compact
        />
        {gantt ? (
          <Segmented
            label={W.scale}
            value={props.scale}
            options={SCALE_OPTIONS}
            onChange={props.onScale}
            testId="wbs-scale"
            compact
          />
        ) : null}
        {props.filter}
        <div className="flex flex-wrap items-center gap-1">
          {props.people ? (
            <Toggle
              label={W.meta.people}
              pressed={props.people.value}
              onChange={props.people.onChange}
              testId="wbs-people"
            />
          ) : null}
          {props.boxDetails ? (
            <Toggle
              label={W.meta.details}
              pressed={props.boxDetails.value}
              onChange={props.boxDetails.onChange}
              testId="wbs-details-toggle"
            />
          ) : null}
          {props.milestones ? (
            <Toggle
              label={W.milestoneStrip.label}
              pressed={props.milestones.value}
              onChange={props.milestones.onChange}
              testId="wbs-milestones"
            />
          ) : null}
          {props.fullscreen ? (
            <Toggle
              label={W.fullscreen}
              pressed={props.fullscreen.value}
              onChange={props.fullscreen.onChange}
              testId="wbs-fullscreen"
            />
          ) : null}
        </div>
        <Command label={W.expandAll} command={props.expandAll} testId="wbs-expand-all" />
        <Command label={W.collapseAll} command={props.collapseAll} testId="wbs-collapse-all" />
        <Command label={W.csv.copy} command={props.copyCsv} testId="wbs-copy-csv" />
        {props.planNote}
      </div>
      <div
        role="toolbar"
        aria-label={messages.keyDeliverables.ganttTitle}
        className="flex flex-wrap items-center gap-1.5"
      >
        <Command label={W.addItem} command={props.addItem} testId="wbs-add" variant="primary" />
        <Command label={W.addMilestone} command={props.addMilestone} testId="wbs-add-milestone" />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
        <Command label={W.addSubItem} command={props.addSubItem} testId="wbs-add-sub" />
        <Command label={W.indent} command={props.indent} testId="wbs-indent" />
        <Command label={W.outdent} command={props.outdent} testId="wbs-outdent" />
        <Command label={W.moveUp} command={props.moveUp} testId="wbs-move-up" />
        <Command label={W.moveDown} command={props.moveDown} testId="wbs-move-down" />
        <Command label={W.moveTo} command={props.moveTo} testId="wbs-move-to" />
        <Command label={W.undoMove} command={props.undo} testId="wbs-undo" />
        <Command label={W.rename} command={props.rename} testId="wbs-rename" />
        <Command label={W.details} command={props.details} testId="wbs-details" />
        <Command label={W.delete} command={props.remove} testId="wbs-delete" variant="danger" />
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
