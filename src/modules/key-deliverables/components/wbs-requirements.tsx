"use client";

import { useState } from "react";
import { messages } from "@/lib/messages";
import type { WbsNode, WbsRequirement } from "../schemas/wbs";
import { DraftInput } from "./draft-input";

const W = messages.keyDeliverables.wbs;

/** What a requirements list asks the editor to do (ADR-0036). */
export interface RequirementHandlers {
  add: (itemId: number, text: string) => void;
  edit: (id: number, text: string) => void;
  setMet: (id: number, met: boolean) => void;
  /** -1 up, 1 down, among the item's requirements. */
  move: (id: number, delta: -1 | 1) => void;
  /** Asks first. */
  remove: (id: number) => void;
  /** Show or hide an item's requirements. */
  toggle: (itemId: number) => void;
  /** Open (or, with null, close) the add field under an item. */
  openAdd: (itemId: number | null) => void;
}

export interface RequirementAccess {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** A requirement shown before the server gave it an id: nothing can be done to it yet. */
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

/** Move up, Move down and Delete for one requirement. */
export function RequirementControls({
  requirement,
  index,
  count,
  access,
  on,
}: {
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
            onClick={() => on.move(requirement.id, -1)}
            className={iconButton}
          >
            <Arrow up />
          </button>
          <button
            type="button"
            aria-label={W.moveRequirementDown(text)}
            data-testid={`wbs-req-down-${requirement.id}`}
            disabled={pending || index === count - 1}
            onClick={() => on.move(requirement.id, 1)}
            className={iconButton}
          >
            <Arrow up={false} />
          </button>
        </>
      ) : null}
      {access.canDelete ? (
        <button
          type="button"
          aria-label={W.deleteRequirement(text)}
          data-testid={`wbs-req-delete-${requirement.id}`}
          disabled={pending}
          onClick={() => on.remove(requirement.id)}
          className={`${iconButton} hover:text-danger`}
        >
          <Cross />
        </button>
      ) : null}
    </span>
  );
}

/** The met tick box. */
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
 * The field that adds requirements under an item: Enter adds one and keeps the
 * field open for the next, Escape or leaving an empty field closes it.
 */
export function AddRequirementField({
  node,
  on,
  className,
}: {
  node: WbsNode;
  on: RequirementHandlers;
  className: string;
}) {
  const [text, setText] = useState("");
  const id = node.item.id;

  function add(): boolean {
    const value = text.trim();
    if (!value) return false;
    on.add(id, value);
    setText("");
    return true;
  }

  return (
    <input
      autoFocus
      data-wbs-req-add={id}
      aria-label={W.newRequirementFor(node.code)}
      value={text}
      maxLength={4000}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!add()) on.openAdd(null);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setText("");
          on.openAdd(null);
        }
      }}
      onBlur={() => {
        add();
        on.openAdd(null);
      }}
      className={className}
    />
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

/** One requirement's wording: a field while editing, else text the editor can click to edit. */
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
  const textClass = `min-w-0 flex-1 text-xs leading-5 wrap-anywhere ${
    requirement.isMet ? "text-ink-muted line-through" : "text-ink"
  }`;
  if (editing) {
    return (
      <DraftInput
        autoFocus
        aria-label={W.editRequirement(requirement.text)}
        value={requirement.text}
        maxLength={4000}
        onCommit={(next) => {
          if (next.trim()) on.edit(requirement.id, next.trim());
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
      onClick={() => setEditing(true)}
      className={`${textClass} -mx-1 cursor-text rounded-sm px-1 text-left hover:bg-surface-raised`}
    >
      {requirement.text}
    </button>
  );
}

/**
 * A box's requirements in the WBS diagram, cascading under its name and dates
 * the way the minutes list discussion points under an agenda item: a count that
 * shows or hides them, each with its tick box, and "Add requirement" last.
 */
export function BoxRequirements({
  node,
  hidden,
  adding,
  access,
  on,
}: {
  node: WbsNode;
  hidden: boolean;
  adding: boolean;
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
              <RequirementText requirement={requirement} canEdit={access.canEdit} on={on} />
              <span className="-my-1 flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                <RequirementControls
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
            on={on}
            className="h-7 w-full min-w-0 rounded-sm border border-focus bg-surface px-1.5 text-xs text-ink select-text focus:outline-none"
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
