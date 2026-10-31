"use client";

import { useRef, useState } from "react";
import { TONES } from "@/components/ui/tones";
import { messages } from "@/lib/messages";
import {
  MoscowBadge,
  MoscowButtons,
  TYPE_TONES,
} from "@/modules/requirements/components/requirement-chips";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import {
  MAX_REQUIREMENT_LENGTH,
  type RequirementOption,
} from "@/modules/requirements/schemas/requirement";
import {
  SOLUTION_TYPES,
  type SolutionType,
} from "@/modules/requirements/schemas/requirement-types";
import {
  requirementChip,
  requirementIndent,
  requirementOutdent,
  requirementOutline,
  type RequirementPlanning,
  type WbsNode,
  type WbsRequirement,
} from "../schemas/wbs";
import { DraftInput } from "./draft-input";
import { RequirementMore } from "./wbs-requirement-more";

const W = messages.keyDeliverables.wbs;

/**
 * The quick-add's extras: a MoSCoW code, a saved requirement of the item to nest under, and the
 * business or stakeholder requirement it meets.
 */
export interface AddMore {
  moscow?: MoSCoW | null;
  parentId?: number | null;
  meetsId?: number | null;
}

/** What a requirements list asks the editor to do (ADR-0036). */
export interface RequirementHandlers {
  /** The cascade only adds solution types: a need is never allocated to a deliverable. */
  add: (itemId: number, text: string, type: SolutionType, more?: AddMore) => void;
  edit: (id: number, text: string) => void;
  setMet: (id: number, met: boolean) => void;
  /** null clears it. */
  setMoscow: (id: number, moscow: MoSCoW | null) => void;
  /** Criteria, estimate and owner, saved together. */
  setPlanning: (id: number, planning: RequirementPlanning) => void;
  /** -1 up, 1 down, within one deliverable's list. */
  move: (itemId: number, id: number, delta: -1 | 1) => void;
  /** Takes the requirement off this one deliverable; it stays in the register (ADR-0037). */
  remove: (itemId: number, id: number) => void;
  /** Show or hide an item's requirements. */
  toggle: (itemId: number) => void;
  /** Open (or, with null, close) the add field under an item. */
  openAdd: (itemId: number | null) => void;
  /** Remembers the kind the next requirement is added as. */
  setAddType: (type: SolutionType) => void;
}

export interface RequirementAccess {
  canCreate: boolean;
  canEdit: boolean;
}

/** Not saved yet. */
export function isPending(requirement: WbsRequirement): boolean {
  return requirement.id < 0;
}

function metCount(requirements: readonly WbsRequirement[]): number {
  return requirements.filter((r) => r.isMet).length;
}

const iconButton =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-muted " +
  "hover:bg-surface-raised hover:text-ink disabled:cursor-default disabled:opacity-40 print:hidden";

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
      <path d={up ? "M8 3l5 6H3z" : "M8 13l5-6H3z"} />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
      <path d="M4.2 3.1L8 6.9l3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2z" />
    </svg>
  );
}

/** "FR-3" in front of the wording, so a row says which requirement of the register it is. */
export function RefChip({ requirement }: { requirement: WbsRequirement }) {
  return (
    <span className="shrink-0 text-xs leading-5 font-medium text-ink-muted tabular-nums">
      {requirementChip(requirement)}
    </span>
  );
}

/** Move up, Move down and Remove for one requirement. */
export function RequirementControls({
  itemId,
  requirement,
  index,
  count,
  access,
  on,
}: {
  /** The deliverable this requirement sits under; move and remove act on it. */
  itemId: number;
  requirement: WbsRequirement;
  index: number;
  count: number;
  access: RequirementAccess;
  on: RequirementHandlers;
}) {
  const pending = isPending(requirement);
  const text = requirement.text;
  return (
    <span className="flex shrink-0 items-center">
      <RequirementMore
        requirement={requirement}
        canEdit={access.canEdit}
        className={iconButton}
        onMoscow={(moscow) => on.setMoscow(requirement.id, moscow)}
        onPlanning={(planning) => on.setPlanning(requirement.id, planning)}
      />
      {access.canEdit && count > 1 ? (
        <>
          <button
            type="button"
            aria-label={W.moveRequirementUp(text)}
            data-testid={`wbs-req-up-${requirement.id}`}
            disabled={pending || index === 0}
            onClick={() => on.move(itemId, requirement.id, -1)}
            className={iconButton}
          >
            <Arrow up />
          </button>
          <button
            type="button"
            aria-label={W.moveRequirementDown(text)}
            data-testid={`wbs-req-down-${requirement.id}`}
            disabled={pending || index === count - 1}
            onClick={() => on.move(itemId, requirement.id, 1)}
            className={iconButton}
          >
            <Arrow up={false} />
          </button>
        </>
      ) : null}
      {access.canEdit ? (
        <button
          type="button"
          aria-label={W.removeRequirement(text)}
          data-testid={`wbs-req-remove-${requirement.id}`}
          disabled={pending}
          onClick={() => on.remove(itemId, requirement.id)}
          className={iconButton}
        >
          <Cross />
        </button>
      ) : null}
    </span>
  );
}

export function MetBox({
  requirement,
  canEdit,
  on,
}: {
  requirement: WbsRequirement;
  canEdit: boolean;
  on: RequirementHandlers;
}) {
  return (
    <input
      type="checkbox"
      aria-label={W.requirementMet(requirement.text)}
      data-testid={`wbs-req-met-${requirement.id}`}
      checked={requirement.isMet}
      disabled={!canEdit || isPending(requirement)}
      onChange={(event) => on.setMet(requirement.id, event.target.checked)}
      className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-default"
    />
  );
}

const pickerClass =
  "h-7 min-w-0 flex-1 cursor-pointer rounded-sm border border-line bg-surface px-0.5 text-xs text-ink focus:border-focus focus:outline-none";

const pickerLabelClass = "flex items-center gap-1 text-[10px] font-semibold text-ink-muted";

/**
 * The kind and the wording of a new requirement. Enter adds and keeps the field open for the
 * next one; Escape or an empty Enter closes it. The type select offers solution types only, and
 * "Meets" traces the new one to a business or stakeholder requirement of the register.
 */
export function AddRequirementField({
  node,
  type,
  needs,
  on,
  className,
}: {
  node: WbsNode;
  type: SolutionType;
  needs: readonly RequirementOption[];
  on: RequirementHandlers;
  className: string;
}) {
  const [text, setText] = useState("");
  const [moscow, setMoscow] = useState<MoSCoW | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [meetsId, setMeetsId] = useState<number | null>(null);
  // Stops the closing blur from adding what Escape dropped.
  const cancelled = useRef(false);
  const id = node.item.id;
  const requirements = node.item.requirements;
  const outline = requirementOutline(requirements).filter((e) => e.requirement.id > 0);
  const parent = requirements.find((r) => r.id === parentId);
  // A sub-requirement takes its parent's type, so the type chips only choose a top-level one.
  const shownType = parent?.type ?? type;

  function add(): boolean {
    const value = text.trim();
    if (!value || cancelled.current) return false;
    on.add(id, value, type, { moscow, parentId: parent ? parentId : null, meetsId });
    setText("");
    return true;
  }

  return (
    <span
      data-testid={`wbs-quick-add-${id}`}
      className="flex w-full min-w-0 flex-col gap-1 rounded-sm border border-line bg-surface p-1"
      // Picking a chip keeps the form open; only leaving it closes it.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        add();
        on.openAdd(null);
      }}
      // A chip pressed with the pointer leaves the caret in the text, ready for the next one.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) event.preventDefault();
      }}
    >
      <input
        autoFocus
        data-wbs-req-add={id}
        aria-label={W.newRequirementFor(node.code, parent ? requirementChip(parent) : null)}
        aria-keyshortcuts="Tab Shift+Tab"
        placeholder={W.quickAdd.placeholder}
        value={text}
        maxLength={MAX_REQUIREMENT_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!add()) on.openAdd(null);
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            setText("");
            on.openAdd(null);
          } else if (event.key === "Tab") {
            // Nests like the outline's names; with nowhere to go, Tab moves on as usual.
            const next = event.shiftKey
              ? requirementOutdent(requirements, parentId)
              : requirementIndent(requirements, parentId);
            if (next === undefined) return;
            event.preventDefault();
            setParentId(next);
          }
        }}
        className={className}
      />
      <span
        role="group"
        aria-label={W.requirementTypeFor(node.code)}
        className="flex flex-wrap gap-1"
      >
        {SOLUTION_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={shownType === option}
            disabled={parent !== undefined}
            onClick={() => on.setAddType(option)}
            className={`min-h-6 cursor-pointer rounded-full border px-1.5 text-[10px] font-semibold disabled:cursor-default ${
              shownType === option
                ? TONES[TYPE_TONES[option]].badge
                : "border-line bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </span>
      <MoscowButtons value={moscow} onChange={setMoscow} label={W.quickAdd.moscowFor(node.code)} />
      <label className={pickerLabelClass}>
        {W.quickAdd.parent}
        <select
          value={parentId ?? ""}
          onChange={(event) => setParentId(event.target.value ? Number(event.target.value) : null)}
          className={pickerClass}
        >
          <option value="">{W.quickAdd.topLevel}</option>
          {outline.map(({ requirement, depth }) => (
            <option key={requirement.id} value={requirement.id}>
              {`${"  ".repeat(depth)}${requirementChip(requirement)} ${requirement.text}`}
            </option>
          ))}
        </select>
      </label>
      {needs.length > 0 ? (
        <label className={pickerLabelClass}>
          {W.quickAdd.meets}
          <select
            data-testid={`wbs-req-meets-${id}`}
            value={meetsId ?? ""}
            onChange={(event) => setMeetsId(event.target.value ? Number(event.target.value) : null)}
            className={pickerClass}
          >
            <option value="">{W.quickAdd.meetsNone}</option>
            {needs.map((need) => (
              <option key={need.id} value={need.id}>
                {`${need.ref} ${need.text}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </span>
  );
}

/**
 * Opens the add field under an item: "Add requirement" under the Gantt's list, a "+" in a WBS
 * box's head row.
 */
export function AddRequirementButton({
  node,
  on,
  className,
  tabIndex,
  children = W.addRequirement,
}: {
  node: WbsNode;
  on: RequirementHandlers;
  className: string;
  tabIndex?: number;
  children?: React.ReactNode;
}) {
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-label={W.addRequirementTo(name)}
      title={W.addRequirementTo(name)}
      data-testid={`wbs-req-add-${node.item.id}`}
      onClick={() => on.openAdd(node.item.id)}
      onDoubleClick={(event) => event.stopPropagation()}
      className={className}
    >
      {children}
    </button>
  );
}

/** Shows or hides an item's requirements: "2 of 3 met". */
export function RequirementsToggle({
  node,
  hidden,
  on,
  className,
}: {
  node: WbsNode;
  hidden: boolean;
  on: RequirementHandlers;
  className: string;
}) {
  const requirements = node.item.requirements;
  return (
    <button
      type="button"
      aria-expanded={!hidden}
      aria-label={hidden ? W.showRequirements(node.code) : W.hideRequirements(node.code)}
      data-testid={`wbs-req-toggle-${node.item.id}`}
      onClick={() => on.toggle(node.item.id)}
      className={className}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={`size-3 shrink-0 transition-transform ${hidden ? "" : "rotate-90"}`}
        fill="currentColor"
      >
        <path d="M5 3l6 5-6 5z" />
      </svg>
      <span className="truncate">
        {W.requirementCount(metCount(requirements), requirements.length)}
      </span>
    </button>
  );
}

/** A requirement's wording; click to edit. */
function RequirementText({
  requirement,
  canEdit,
  on,
}: {
  requirement: WbsRequirement;
  canEdit: boolean;
  on: RequirementHandlers;
}) {
  const [editing, setEditing] = useState(false);
  // Enter and the closing blur both report the text.
  const sent = useRef<string | null>(null);
  const textClass = `min-w-0 flex-1 truncate text-xs leading-5 print:whitespace-normal ${
    requirement.isMet ? "text-ink-muted line-through" : "text-ink"
  }`;
  if (editing) {
    return (
      <DraftInput
        autoFocus
        aria-label={W.editRequirement(requirement.text)}
        value={requirement.text}
        maxLength={MAX_REQUIREMENT_LENGTH}
        onCommit={(next) => {
          const value = next.trim();
          if (!value || sent.current === value) return;
          sent.current = value;
          on.edit(requirement.id, value);
        }}
        onSettle={() => setEditing(false)}
        onBlur={() => setEditing(false)}
        className="h-7 min-w-0 flex-1 rounded-sm border border-focus bg-surface px-1.5 text-xs text-ink select-text focus:outline-none"
      />
    );
  }
  const bubble = (
    <span
      aria-hidden="true"
      data-testid="wbs-req-bubble"
      className="pointer-events-none absolute bottom-full left-0 z-(--z-dropdown) mb-1 hidden w-72 max-w-[80vw] rounded bg-ink px-2 py-1.5 text-xs whitespace-normal text-surface shadow-md wrap-anywhere group-focus-within:block group-hover:block print:hidden"
    >
      <span className="font-semibold">{requirementChip(requirement)}</span> {requirement.text}
    </span>
  );
  if (!canEdit || isPending(requirement)) {
    return (
      <>
        <span className={textClass}>{requirement.text}</span>
        {bubble}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={W.editRequirement(requirement.text)}
        onClick={() => {
          sent.current = null;
          setEditing(true);
        }}
        className={`${textClass} -mx-1 cursor-text rounded-sm px-1 text-left hover:bg-surface-raised`}
      >
        {requirement.text}
      </button>
      {bubble}
    </>
  );
}

/** A box's requirements, cascading like the minutes' discussion points. */
export function BoxRequirements({
  node,
  hidden,
  adding,
  addType,
  needs,
  access,
  on,
  only,
  alwaysOpen = false,
  addButton = true,
}: {
  node: WbsNode;
  hidden: boolean;
  adding: boolean;
  /** The kind the add field is set to. */
  addType: SolutionType;
  /** The project's business and stakeholder requirements, for the add field's "Meets". */
  needs: readonly RequirementOption[];
  access: RequirementAccess;
  on: RequirementHandlers;
  /** Under a filter, the requirements that show; the rest keep their place for moves. */
  only?: ReadonlySet<number>;
  /** Always listed, with no show/hide toggle (the Gantt's requirements panel). */
  alwaysOpen?: boolean;
  /** "Add requirement" under the list; off where the item has its own "+" (a WBS box). */
  addButton?: boolean;
}) {
  const requirements = node.item.requirements;
  const field = access.canCreate && (adding || addButton);
  if (requirements.length === 0 && !field) return null;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  const open = alwaysOpen || !hidden || adding;
  const listed = only ? requirements.some((r) => only.has(r.id)) : requirements.length > 0;

  return (
    <div
      data-testid={`wbs-reqs-${node.item.id}`}
      className="mt-1 flex flex-col gap-1 border-t border-line pt-1 font-normal"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {requirements.length > 0 && !alwaysOpen ? (
        <RequirementsToggle
          node={node}
          hidden={!open}
          on={on}
          className="-mx-1 flex min-h-6 cursor-pointer items-center gap-1 self-start rounded-sm px-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink print:hidden"
        />
      ) : null}
      {open && listed ? (
        <ul
          aria-label={W.requirementsOf(name)}
          className="m-0 flex list-none flex-col gap-1 border-l-2 border-line p-0 pl-2"
        >
          {requirements.map((requirement, index) =>
            only && !only.has(requirement.id) ? null : (
              <li
                key={requirement.id}
                data-testid={`wbs-req-${requirement.id}`}
                className={`group relative flex items-start gap-1.5 rounded-sm border bg-surface px-1 py-0.5 ${TONES[TYPE_TONES[requirement.type]].line}`}
              >
                <span className="flex h-5 items-center">
                  <MetBox requirement={requirement} canEdit={access.canEdit} on={on} />
                </span>
                <RefChip requirement={requirement} />
                {requirement.moscow ? <MoscowBadge code={requirement.moscow} /> : null}
                <RequirementText requirement={requirement} canEdit={access.canEdit} on={on} />
                <span className="-my-1 hidden group-focus-within:flex group-hover:flex pointer-coarse:flex has-[[aria-expanded=true]]:flex">
                  <RequirementControls
                    itemId={node.item.id}
                    requirement={requirement}
                    index={index}
                    count={requirements.length}
                    access={access}
                    on={on}
                  />
                </span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {!field ? null : adding ? (
        <AddRequirementField
          node={node}
          type={addType}
          needs={needs}
          on={on}
          className="h-9 w-full min-w-0 rounded-md border border-focus bg-surface px-2 text-sm text-ink select-text focus:outline-none"
        />
      ) : (
        <AddRequirementButton
          node={node}
          on={on}
          className="min-h-6 cursor-pointer self-start rounded-sm border border-dashed border-line px-2 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink print:hidden"
        />
      )}
    </div>
  );
}
