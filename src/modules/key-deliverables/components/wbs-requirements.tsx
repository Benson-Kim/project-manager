"use client";

import { useRef, useState } from "react";
import { messages } from "@/lib/messages";
import { MAX_REQUIREMENT_LENGTH } from "@/modules/requirements/schemas/requirement";
import {
  isSolution,
  SOLUTION_TYPES,
  type SolutionType,
} from "@/modules/requirements/schemas/requirement-types";
import { requirementChip, type WbsNode, type WbsRequirement } from "../schemas/wbs";
import { DraftInput } from "./draft-input";

const W = messages.keyDeliverables.wbs;

/** What a requirements list asks the editor to do (ADR-0036). */
export interface RequirementHandlers {
  /** The cascade only adds solution types: a need is never allocated to a deliverable. */
  add: (itemId: number, text: string, type: SolutionType) => void;
  edit: (id: number, text: string) => void;
  setMet: (id: number, met: boolean) => void;
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

/**
 * The kind and the wording of a new requirement. Enter adds and keeps the field open for the
 * next one; Escape or an empty Enter closes it. The type select offers solution types only.
 */
export function AddRequirementField({
  node,
  type,
  on,
  className,
}: {
  node: WbsNode;
  type: SolutionType;
  on: RequirementHandlers;
  className: string;
}) {
  const [text, setText] = useState("");
  // Stops the closing blur from adding what Escape dropped.
  const cancelled = useRef(false);
  const id = node.item.id;

  function add(): boolean {
    const value = text.trim();
    if (!value || cancelled.current) return false;
    on.add(id, value, type);
    setText("");
    return true;
  }

  return (
    <span
      className="flex w-full min-w-0 items-center gap-1"
      // Picking a type keeps the field open; only leaving the pair closes it.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        add();
        on.openAdd(null);
      }}
    >
      <select
        aria-label={W.requirementTypeFor(node.code)}
        value={type}
        // The guard, not a cast: only a kind the catalog knows reaches the add.
        onChange={(event) => {
          if (isSolution(event.target.value)) on.setAddType(event.target.value);
        }}
        className="h-7 shrink-0 cursor-pointer rounded-sm border border-focus bg-surface px-0.5 text-xs text-ink focus:outline-none"
      >
        {SOLUTION_TYPES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <input
        autoFocus
        data-wbs-req-add={id}
        aria-label={W.newRequirementFor(node.code)}
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
          }
        }}
        className={className}
      />
    </span>
  );
}

/** "Add requirement" under an item; the field takes its place while open. */
export function AddRequirementButton({
  node,
  on,
  className,
}: {
  node: WbsNode;
  on: RequirementHandlers;
  className: string;
}) {
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  return (
    <button
      type="button"
      aria-label={W.addRequirementTo(name)}
      data-testid={`wbs-req-add-${node.item.id}`}
      onClick={() => on.openAdd(node.item.id)}
      className={className}
    >
      {W.addRequirement}
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
  const textClass = `min-w-0 flex-1 text-xs leading-5 wrap-anywhere ${
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
  if (!canEdit || isPending(requirement)) {
    return <span className={textClass}>{requirement.text}</span>;
  }
  return (
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
  );
}

/** A box's requirements, cascading like the minutes' discussion points. */
export function BoxRequirements({
  node,
  hidden,
  adding,
  addType,
  access,
  on,
}: {
  node: WbsNode;
  hidden: boolean;
  adding: boolean;
  /** The kind the add field is set to. */
  addType: SolutionType;
  access: RequirementAccess;
  on: RequirementHandlers;
}) {
  const requirements = node.item.requirements;
  if (requirements.length === 0 && !access.canCreate) return null;
  const name = node.item.name || messages.keyDeliverables.deliverableFallback(node.item.id);
  const open = !hidden || adding;

  return (
    <div
      data-testid={`wbs-reqs-${node.item.id}`}
      className="mt-1 flex flex-col gap-1 border-t border-line pt-1 font-normal"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {requirements.length > 0 ? (
        <RequirementsToggle
          node={node}
          hidden={!open}
          on={on}
          className="-mx-1 flex min-h-6 cursor-pointer items-center gap-1 self-start rounded-sm px-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink print:hidden"
        />
      ) : null}
      {open && requirements.length > 0 ? (
        <ul
          aria-label={W.requirementsOf(name)}
          className="m-0 flex list-none flex-col gap-0.5 border-l border-line p-0 pl-2"
        >
          {requirements.map((requirement, index) => (
            <li
              key={requirement.id}
              data-testid={`wbs-req-${requirement.id}`}
              className="group flex items-start gap-1.5"
            >
              <span className="flex h-5 items-center">
                <MetBox requirement={requirement} canEdit={access.canEdit} on={on} />
              </span>
              <RefChip requirement={requirement} />
              <RequirementText requirement={requirement} canEdit={access.canEdit} on={on} />
              <span className="-my-1 flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
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
          ))}
        </ul>
      ) : null}
      {access.canCreate ? (
        adding ? (
          <AddRequirementField
            node={node}
            type={addType}
            on={on}
            className="h-7 min-w-0 flex-1 rounded-sm border border-focus bg-surface px-1.5 text-xs text-ink select-text focus:outline-none"
          />
        ) : (
          <AddRequirementButton
            node={node}
            on={on}
            className="min-h-6 cursor-pointer self-start rounded-sm border border-dashed border-line px-2 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink print:hidden"
          />
        )
      ) : null}
    </div>
  );
}
