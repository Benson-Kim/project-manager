"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form/field";
import { ListOptions } from "@/components/ui/lookup-lists";
import { TONES } from "@/components/ui/tones";
import { formatDate, toDateInput } from "@/lib/format";
import { OPTION_COLORS, type OptionColor } from "@/lib/lookup-lists";
import { messages } from "@/lib/messages";
import { StakeholderMultiSelect } from "@/modules/stakeholders/components/stakeholder-picker";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import { budgetSchema } from "../schemas/key-deliverable";
import { DONE_STATUS, type WbsDetailsPatch, type WbsNode } from "../schemas/wbs";
import { DraftInput } from "./draft-input";
import { BoxNote } from "./wbs-box-note";
import { budgetText } from "./wbs-box-meta";
import { BRANCH_LAYOUTS, type BranchLayout } from "./wbs-diagram-layout";
import { Segmented } from "./wbs-segmented";

const K = messages.keyDeliverables;
const P = K.wbs.panel;

const LAYOUT_OPTIONS = BRANCH_LAYOUTS.map((value) => ({
  value,
  label: K.wbs.layouts[value],
}));

/** What the details panel asks the editor to do; each change saves on its own, in the queue. */
export interface DetailsPanelHandlers {
  rename: (name: string) => void;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
  update: (patch: WbsDetailsPatch) => void;
  note: (text: string) => Promise<boolean>;
  done: () => void;
  close: () => void;
}

const field =
  "h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-focus focus:outline-none";
const labelText = "text-xs font-medium text-ink-muted";

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${labelText}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <span className="flex min-h-9 items-center text-sm font-normal text-ink">{value}</span>
    </div>
  );
}

/**
 * The selected item's details under the WBS chart (ADR-0052): name, assignees, priority, dates,
 * colour, budget, note and Done, each saved as soon as it changes. A parent's dates and budget
 * come from its sub-items, so they show here without a field.
 */
export function WbsDetailsPanel({
  node,
  canEdit,
  canDone,
  assigneeOptions,
  rolledBudget,
  subItems,
  on,
}: {
  node: WbsNode;
  canEdit: boolean;
  /** The status list offers the done status. */
  canDone: boolean;
  assigneeOptions: StakeholderOption[];
  /** The budget the box shows: its own, or its sub-items' sum. */
  rolledBudget: number | null;
  /** How a parent's sub-items are laid out in the diagram (this viewer's choice); null for a leaf. */
  subItems: {
    value: BranchLayout;
    onChange: (layout: BranchLayout) => void;
  } | null;
  on: DetailsPanelHandlers;
}) {
  const item = node.item;
  const parent = node.childIds.length > 0;
  const name = item.name || K.deliverableFallback(item.id);
  const headingId = `wbs-details-${item.id}`;
  const done = item.status === DONE_STATUS;
  const dates = (date: Date | null) => (date ? formatDate(date) : K.wbs.noDates);
  const budget = rolledBudget === null ? "" : budgetText(rolledBudget);

  function commitBudget(raw: string) {
    const parsed = budgetSchema.safeParse(raw);
    if (parsed.success && parsed.data !== item.budget) on.update({ budget: parsed.data });
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="wbs-details-panel"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 print:hidden"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          <span className="mr-2 font-normal text-ink-muted tabular-nums">{node.code}</span>
          {name}
        </h2>
        <BoxNote
          id={item.id}
          code={node.code}
          note={item.note}
          offerAdd
          canEdit={canEdit}
          tabbable
          onSave={on.note}
          testId="wbs-details-note"
        />
        <button
          type="button"
          aria-label={P.close}
          title={P.close}
          data-testid="wbs-details-close"
          onClick={on.close}
          className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {canEdit ? (
          <Labelled label={K.wbs.rename}>
            <DraftInput
              commitOnUnmount
              data-testid="wbs-details-name"
              data-wbs-details-name={item.id}
              value={item.name}
              maxLength={4000}
              onCommit={(next) => on.rename(next)}
              className={field}
            />
          </Labelled>
        ) : (
          <ReadOnly label={K.wbs.rename} value={name} />
        )}

        {canEdit ? (
          <Labelled label={K.priority}>
            <select
              data-testid="wbs-details-priority"
              value={item.priority ?? ""}
              onChange={(event) => on.update({ priority: event.target.value || null })}
              className={field}
            >
              <option value="">{messages.projects.none}</option>
              <ListOptions list="key-deliverable.priority" current={item.priority} />
            </select>
          </Labelled>
        ) : (
          <ReadOnly label={K.priority} value={item.priority ?? messages.projects.none} />
        )}

        {canEdit && !parent ? (
          <>
            <Labelled label={item.isMilestone ? K.milestoneDate : K.startDate}>
              <DraftInput
                commitOnUnmount
                type="date"
                data-testid="wbs-details-start"
                value={toDateInput(item.start)}
                onCommit={on.setStart}
                className={field}
              />
            </Labelled>
            {item.isMilestone ? null : (
              <Labelled label={K.deadline}>
                <DraftInput
                  commitOnUnmount
                  type="date"
                  data-testid="wbs-details-end"
                  value={toDateInput(item.end)}
                  onCommit={on.setEnd}
                  className={field}
                />
              </Labelled>
            )}
          </>
        ) : (
          <>
            <ReadOnly
              label={parent ? K.rolledUp(K.startDate) : K.startDate}
              value={dates(node.start)}
            />
            <ReadOnly
              label={parent ? K.rolledUp(K.deadline) : K.deadline}
              value={dates(node.end)}
            />
          </>
        )}

        {/* A wrapping <label> would name the first chip's remove button, and a click on the
            label text would take that person off; Field points its label at the input. */}
        <div className="min-w-0 sm:col-span-2">
          {canEdit ? (
            <Field label={K.assignees} name="assigneeIds" labelClassName={labelText}>
              <StakeholderMultiSelect
                options={assigneeOptions}
                selected={item.assignees}
                disabled={false}
                inputName="assigneeIds[]"
                removeLabel={K.removeAssignee}
                emptyPlaceholder={K.unassigned}
                onAdd={(option) => {
                  if (item.assignees.some((a) => a.id === option.stakeholderId)) return;
                  on.update({
                    assignees: [...item.assignees, { id: option.stakeholderId, name: option.name }],
                  });
                }}
                onRemove={(id) =>
                  on.update({ assignees: item.assignees.filter((a) => a.id !== id) })
                }
              />
            </Field>
          ) : (
            <ReadOnly
              label={K.assignees}
              value={item.assignees.map((a) => a.name).join(", ") || K.unassigned}
            />
          )}
        </div>

        {canEdit && !parent ? (
          <Labelled label={K.budget}>
            <DraftInput
              commitOnUnmount
              data-testid="wbs-details-budget"
              inputMode="decimal"
              value={item.budget === null ? "" : String(item.budget)}
              onCommit={commitBudget}
              className={field}
            />
          </Labelled>
        ) : (
          <ReadOnly label={parent ? K.rolledUp(K.budget) : K.budget} value={budget || "—"} />
        )}

        <div className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-muted">
          <span id={`${headingId}-colour`}>{P.colour}</span>
          <div
            role="radiogroup"
            aria-labelledby={`${headingId}-colour`}
            className="flex min-h-9 flex-wrap items-center gap-1.5"
          >
            {([null, ...OPTION_COLORS] as (OptionColor | null)[]).map((color) => (
              <button
                key={color ?? "level"}
                type="button"
                role="radio"
                aria-checked={item.color === color}
                aria-label={color ? messages.lookupLists.colors[color] : P.levelColour}
                title={color ? messages.lookupLists.colors[color] : P.levelColour}
                disabled={!canEdit}
                data-testid={`wbs-details-colour-${color ?? "level"}`}
                onClick={() => item.color !== color && on.update({ color })}
                className={`size-6 rounded-full border-2 ${
                  color ? TONES[color].swatch : "border-line bg-level-1"
                } ${item.color === color ? "ring-2 ring-coral ring-offset-1 ring-offset-surface" : ""} disabled:cursor-default`}
              />
            ))}
          </div>
        </div>

        {subItems ? (
          <div className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-muted">
            <span aria-hidden="true">{K.wbs.subItems}</span>
            <Segmented
              label={K.wbs.subItems}
              value={subItems.value}
              options={LAYOUT_OPTIONS}
              onChange={subItems.onChange}
              testId="wbs-sub-items"
            />
          </div>
        ) : null}
      </div>

      {canEdit && canDone ? (
        <div>
          <Button
            variant={done ? "secondary" : "primary"}
            data-testid="wbs-details-done"
            disabled={done}
            onClick={on.done}
          >
            {done ? P.done : P.markDone}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
