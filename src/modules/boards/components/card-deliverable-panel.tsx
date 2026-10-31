"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import {
  removeRequirementAction,
  updateRequirementAction,
} from "@/modules/key-deliverables/actions";
import { removeRequirementInput } from "@/modules/key-deliverables/schemas/key-deliverable";
import {
  setRequirementMoscowAction,
  setRequirementPlanningAction,
} from "@/modules/requirements/actions";
import {
  MoscowBadge,
  MoscowButtons,
  TypeBadge,
} from "@/modules/requirements/components/requirement-chips";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import { readBoardCardAction } from "../actions";
import type { BoardCardDetailRow, CardDeliverableRequirement } from "../schemas/board-card";
import { tallyPercent } from "../schemas/board-kanban";
import { BoardConfirm } from "./board-confirm";
import { CriteriaEditor } from "./criteria-editor";

const D = messages.boards.drawer;

function tallies(rows: readonly CardDeliverableRequirement[]) {
  const must = rows.filter((r) => r.MoSCoW === "M");
  return {
    must: { done: must.filter((r) => r.IsMet).length, total: must.length },
    met: { done: rows.filter((r) => r.IsMet).length, total: rows.length },
  };
}

/**
 * The drawer's deliverable section (ADR-0052): its must-have completion, its readiness and its
 * requirements, ticked met and prioritised in place. Each change goes through the requirement's
 * own write (RowVer-checked), then the card is read again so the next change carries the new
 * RowVer. The checkboxes have no name and their changes stop here, so the card form never
 * counts them as unsaved edits. `onChanged` tells the board to redraw once the sheet closes.
 */
export function CardDeliverablePanel({
  card,
  canEdit,
  onChanged,
}: {
  card: BoardCardDetailRow;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState(card.DeliverableRequirements);
  const [removing, setRemoving] = useState<CardDeliverableRequirement | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (card.DeliverableState !== "live" || card.KeyDeliverableId === null) return null;
  const deliverableId = card.KeyDeliverableId;
  const { must, met } = tallies(rows);
  const mustPercent = tallyPercent(must);
  async function reread() {
    const fresh = await readBoardCardAction({ boardCardId: card.BoardCardId });
    if (fresh.ok) setRows(fresh.data.DeliverableRequirements);
  }
  function change(
    id: number,
    patch: Partial<CardDeliverableRequirement>,
    send: (row: CardDeliverableRequirement) => Promise<ActionResult<unknown>>,
  ) {
    const row = rows.find((r) => r.RequirementId === id);
    if (!row || pending) return;
    setError("");
    setRows((current) => current.map((r) => (r.RequirementId === id ? { ...r, ...patch } : r)));
    start(async () => {
      try {
        const result = await send(row);
        if (result.ok) onChanged();
        else setError(result.error.message);
        await reread();
      } catch {
        setError(messages.errors.INTERNAL);
      }
    });
  }
  const setMet = (row: CardDeliverableRequirement, isMet: boolean) =>
    change(row.RequirementId, { IsMet: isMet }, (r) =>
      updateRequirementAction({
        id: r.RequirementId,
        type: r.RequirementType,
        text: r.Requirement,
        isMet,
        rowVer: r.RowVer,
      }),
    );
  const setMoscow = (row: CardDeliverableRequirement, moscow: MoSCoW | null) =>
    change(row.RequirementId, { MoSCoW: moscow }, (r) =>
      setRequirementMoscowAction({ requirementId: r.RequirementId, rowVer: r.RowVer, moscow }),
    );
  const setCriteria = (row: CardDeliverableRequirement, criteria: string) =>
    change(row.RequirementId, { AcceptanceCriteria: criteria.trim() || null }, (r) =>
      setRequirementPlanningAction({
        requirementId: r.RequirementId,
        rowVer: r.RowVer,
        acceptanceCriteria: criteria,
        estimateDays: r.EstimateDays,
        ownerStakeholderId: r.OwnerStakeholderId,
      }),
    );
  return (
    <section
      aria-label={D.section}
      data-testid="card-deliverable"
      className="flex flex-col gap-3"
      onChange={(event) => event.stopPropagation()}
    >
      <Link
        className="text-sm text-accent underline"
        href={`/projects/${card.DeliverableProjectId}/deliverables/gantt?view=wbs`}
      >
        {card.DeliverableTitle}
      </Link>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-2.5 text-xs text-ink-muted">
          <p className="mb-1.5 flex justify-between gap-2">
            <span>{D.mustCompletion}</span>
            <b className="text-ink">
              {must.done}/{must.total}
            </b>
          </p>
          <ProgressBar value={mustPercent ?? 0} label={D.mustCompletion} showValue={false} />
        </div>
        <div className="rounded-lg border border-line p-2.5 text-xs text-ink-muted">
          <p className="mb-1.5 flex justify-between gap-2">
            <span>{D.readiness}</span>
            <b className="text-ink">{tallyPercent(met) ?? 0}%</b>
          </p>
          <ProgressBar value={tallyPercent(met) ?? 0} label={D.readiness} showValue={false} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {D.requirements}
      </h3>
      {rows.length ? (
        <ul className="flex flex-col gap-2" aria-busy={pending}>
          {rows.map((row) => (
            <li
              key={row.RequirementId}
              data-testid={`card-requirement-${row.RequirementId}`}
              style={{ marginLeft: `${row.Depth * 1.25}rem` }}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${row.IsMet ? "border-tone-green-ink" : "border-line"}`}
            >
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={row.IsMet}
                disabled={!canEdit || pending}
                aria-label={D.met(row.Ref)}
                onChange={(event) => setMet(row, event.target.checked)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={row.RequirementType} />
                  <span className="text-xs text-ink-muted">{row.Ref}</span>
                  <span className={row.IsMet ? "text-ink-muted line-through" : ""}>
                    {row.Requirement}
                  </span>
                </p>
                <CriteriaEditor
                  key={`${row.RequirementId}-${row.RowVer}`}
                  value={row.AcceptanceCriteria}
                  label={D.criteria(row.Ref)}
                  canEdit={canEdit}
                  disabled={pending}
                  onSave={(criteria) => setCriteria(row, criteria)}
                />
                {canEdit ? (
                  <MoscowButtons
                    value={row.MoSCoW}
                    onChange={(code) => setMoscow(row, code)}
                    disabled={pending}
                    label={D.moscow(row.Ref)}
                  />
                ) : row.MoSCoW ? (
                  <MoscowBadge code={row.MoSCoW} />
                ) : null}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted hover:bg-surface-raised hover:text-danger focus-visible:outline-2 focus-visible:outline-coral disabled:opacity-50"
                  aria-label={D.unallocate(row.Ref)}
                  title={D.unallocate(row.Ref)}
                  disabled={pending}
                  onClick={() => setRemoving(row)}
                >
                  <span aria-hidden>×</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{D.noRequirements}</p>
      )}
      {removing ? (
        <BoardConfirm
          title={D.unallocateTitle}
          body={D.unallocateBody(removing.Ref, card.DeliverableTitle ?? "")}
          confirmLabel={D.remove}
          schema={removeRequirementInput}
          input={{
            itemId: deliverableId,
            id: removing.RequirementId,
            rowVer: removing.PlaceRowVer,
          }}
          save={async (input) => {
            const result = await removeRequirementAction(input);
            if (result.ok) onChanged();
            reread().catch(() => setError(messages.errors.INTERNAL));
            return result;
          }}
          close={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}
