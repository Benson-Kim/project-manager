"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { panelPosition, type PanelPosition } from "@/components/ui/data-view/datasheet";
import { AnchoredPanel } from "@/components/ui/dialog";
import { messages } from "@/lib/messages";
import { MoscowButtons } from "@/modules/requirements/components/requirement-chips";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import {
  criteriaField,
  estimateField,
  MAX_CRITERIA_LENGTH,
} from "@/modules/requirements/schemas/requirement-planning";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import type { RequirementPlanning, WbsRequirement } from "../schemas/wbs";
import { keepInside } from "./wbs-box-note";

const R = messages.requirements;
const W = messages.keyDeliverables.wbs;
const PANEL_SIZE = { minWidth: 320, minBelow: 320 };

/** The project's stakeholders, any of whom can own a requirement. WbsGantt provides them. */
export const RequirementOwnersContext = createContext<readonly StakeholderOption[]>([]);

interface Draft {
  criteria: string;
  estimate: string;
  owner: string;
}

function draftOf(requirement: WbsRequirement): Draft {
  return {
    criteria: requirement.criteria ?? "",
    estimate: requirement.estimateDays === null ? "" : String(requirement.estimateDays),
    owner: requirement.ownerId === null ? "" : String(requirement.ownerId),
  };
}

/** The saved owner stays choosable even when the list no longer offers them. */
function ownerChoices(
  owners: readonly StakeholderOption[],
  requirement: WbsRequirement,
): readonly StakeholderOption[] {
  const { ownerId, ownerName } = requirement;
  if (ownerId === null || owners.some((o) => o.stakeholderId === ownerId)) return owners;
  return [...owners, { stakeholderId: ownerId, name: ownerName ?? R.owner }];
}

function sameAs(requirement: WbsRequirement, planning: RequirementPlanning): boolean {
  return (
    requirement.criteria === planning.criteria &&
    requirement.estimateDays === planning.estimateDays &&
    requirement.ownerId === planning.ownerId
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="12.5" cy="8" r="1.4" />
    </svg>
  );
}

/**
 * "More..." on a saved requirement: MoSCoW (saved on each press) and the acceptance criteria,
 * estimate and owner (saved together). Without edit access it shows them read-only.
 */
export function RequirementMore({
  requirement,
  canEdit,
  className,
  onMoscow,
  onPlanning,
}: {
  requirement: WbsRequirement;
  canEdit: boolean;
  className: string;
  onMoscow: (moscow: MoSCoW | null) => void;
  onPlanning: (planning: RequirementPlanning) => void;
}) {
  const owners = useContext(RequirementOwnersContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftOf(requirement));
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const label = W.requirementMore(requirement.text);

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraft(draftOf(requirement));
    setError(null);
    setPosition(
      panelPosition(rect, { width: window.innerWidth, height: window.innerHeight }, PANEL_SIZE),
    );
  }

  function close(refocus: boolean) {
    setPosition(null);
    if (refocus) buttonRef.current?.focus();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const criteria = criteriaField.safeParse(draft.criteria);
    const estimate = estimateField.safeParse(draft.estimate);
    if (!criteria.success || !estimate.success) {
      setError((criteria.error ?? estimate.error)?.issues[0]?.message ?? R.estimateInvalid);
      return;
    }
    const ownerId = draft.owner === "" ? null : Number(draft.owner);
    const planning: RequirementPlanning = {
      criteria: criteria.data,
      estimateDays: estimate.data,
      ownerId,
      ownerName: owners.find((o) => o.stakeholderId === ownerId)?.name ?? null,
    };
    if (!sameAs(requirement, planning)) onPlanning(planning);
    close(true);
  }

  const field =
    "w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink disabled:bg-surface-raised";
  return (
    <span
      className="contents"
      onPointerDown={keepInside}
      onDoubleClick={keepInside}
      onContextMenu={keepInside}
      onKeyDown={keepInside}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={position !== null}
        title={label}
        data-testid={`wbs-req-more-${requirement.id}`}
        disabled={requirement.id < 0}
        onClick={() => (position ? close(false) : open())}
        className={className}
      >
        <MoreIcon />
      </button>
      {position ? (
        <AnchoredPanel
          open
          title={label}
          style={{ ...position }}
          testId={`wbs-req-more-${requirement.id}-panel`}
          onEscape={() => close(true)}
          onOutside={(target) => {
            if (target && buttonRef.current?.contains(target)) return;
            close(false);
          }}
        >
          <p className="m-0 line-clamp-2 text-sm font-medium text-ink">{requirement.text}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">{R.moscowTitle}</span>
            <MoscowButtons value={requirement.moscow} onChange={onMoscow} disabled={!canEdit} />
          </div>
          <form noValidate onSubmit={save} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
              {R.acceptanceCriteria}
              <textarea
                rows={3}
                value={draft.criteria}
                maxLength={MAX_CRITERIA_LENGTH}
                disabled={!canEdit}
                onChange={(event) => setDraft({ ...draft, criteria: event.target.value })}
                className={`${field} resize-y`}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
                {R.estimateDays}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={draft.estimate}
                  disabled={!canEdit}
                  aria-invalid={error !== null}
                  aria-describedby={error ? `${ids}-error` : undefined}
                  onChange={(event) => setDraft({ ...draft, estimate: event.target.value })}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
                {R.owner}
                <select
                  value={draft.owner}
                  disabled={!canEdit}
                  onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
                  className={field}
                >
                  <option value="">{R.unassigned}</option>
                  {ownerChoices(owners, requirement).map((o) => (
                    <option key={o.stakeholderId} value={o.stakeholderId}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? (
              <p id={`${ids}-error`} role="alert" className="m-0 text-xs text-danger">
                {error}
              </p>
            ) : null}
            {canEdit ? (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => close(true)}>
                  {messages.actions.cancel}
                </Button>
                <Button type="submit" data-testid={`wbs-req-more-${requirement.id}-save`}>
                  {messages.actions.save}
                </Button>
              </div>
            ) : null}
          </form>
        </AnchoredPanel>
      ) : null}
    </span>
  );
}
