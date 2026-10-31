"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/form/combobox";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import type { ProjectOption } from "@/modules/projects/project-options";
import {
  setRequirementMoscowAction,
  updateRequirementAction,
} from "@/modules/requirements/actions";
import {
  MoscowBadge,
  MoscowButtons,
  TypeBadge,
} from "@/modules/requirements/components/requirement-chips";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import { isSolution } from "@/modules/requirements/schemas/requirement-types";
import {
  linkBoardCardRequirementAction,
  readBoardCardAction,
  readPackagingOptionsAction,
} from "../actions";
import type { BoardCardDetailRow } from "../schemas/board-card";
import { BoardField } from "./board-form";

const M = messages.boards;
const R = M.requirement;
const D = M.drawer;

interface Option {
  id: number;
  label: string;
}

/**
 * The card sheet's requirement section. A requirement card shows its requirement with the met
 * tick and MoSCoW chips, and can drop it; a plain card can take one (its own intention,
 * usp_BoardCard_LinkRequirement). A deliverable card never carries one, and a requirement this
 * reader cannot see is left alone. Every write ends with a fresh read handed to `onCardChange`,
 * so the sheet's next save carries the card's new row version. Changes stop here, so the card
 * form never counts them as unsaved edits.
 */
export function CardRequirementPanel({
  card,
  boardProjectId,
  projects,
  takenIds,
  canLink,
  canEditRequirement,
  onCardChange,
}: {
  card: BoardCardDetailRow;
  boardProjectId: number | null;
  projects: ProjectOption[];
  takenIds: readonly number[];
  canLink: boolean;
  canEditRequirement: boolean;
  onCardChange: (card: BoardCardDetailRow) => void;
}) {
  const [shown, setShown] = useState({
    isMet: Boolean(card.RequirementIsMet),
    moscow: card.RequirementMoSCoW,
  });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (card.DeliverableState !== "none" || card.RequirementState === "restricted") return null;
  function write(send: () => Promise<ActionResult<unknown>>) {
    if (pending) return;
    setError("");
    start(async () => {
      try {
        const result = await send();
        if (!result.ok) setError(result.error.message);
        const fresh = await readBoardCardAction({ boardCardId: card.BoardCardId });
        if (!fresh.ok) return;
        setShown({
          isMet: Boolean(fresh.data.RequirementIsMet),
          moscow: fresh.data.RequirementMoSCoW,
        });
        onCardChange(fresh.data);
      } catch {
        setError(messages.errors.INTERNAL);
      }
    });
  }
  const link = (requirementId: number | null) =>
    write(() =>
      linkBoardCardRequirementAction({
        boardCardId: card.BoardCardId,
        rowVer: card.RowVer,
        requirementId,
      }),
    );
  const live =
    card.RequirementState === "live" &&
    card.RequirementId !== null &&
    card.RequirementType !== null &&
    card.RequirementRowVer !== null
      ? {
          id: card.RequirementId,
          type: card.RequirementType,
          ref: card.RequirementRef ?? "",
          text: card.RequirementText ?? "",
          rowVer: card.RequirementRowVer,
        }
      : null;
  const setMet = (isMet: boolean) => {
    if (!live) return;
    setShown((current) => ({ ...current, isMet }));
    write(() =>
      updateRequirementAction({
        requirementId: live.id,
        rowVer: live.rowVer,
        requirementType: live.type,
        requirement: live.text,
        isMet,
      }),
    );
  };
  const setMoscow = (moscow: MoSCoW | null) => {
    if (!live) return;
    setShown((current) => ({ ...current, moscow }));
    write(() =>
      setRequirementMoscowAction({ requirementId: live.id, rowVer: live.rowVer, moscow }),
    );
  };
  return (
    <section
      aria-label={R.section}
      data-testid="card-requirement"
      className="flex flex-col gap-2"
      onChange={(event) => event.stopPropagation()}
    >
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {live ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5 text-sm">
          <p className="flex flex-wrap items-center gap-1.5">
            {isSolution(live.type) && canEditRequirement ? (
              <input
                type="checkbox"
                className="size-4"
                checked={shown.isMet}
                disabled={pending}
                aria-label={D.met(live.ref)}
                onChange={(event) => setMet(event.target.checked)}
              />
            ) : null}
            <TypeBadge type={live.type} />
            <Link
              className="text-accent underline"
              href={`/projects/${card.RequirementProjectId}/requirements?id=${live.id}`}
            >
              {live.ref}
            </Link>
            <span className={shown.isMet ? "text-ink-muted line-through" : ""}>{live.text}</span>
          </p>
          {canEditRequirement ? (
            <MoscowButtons
              value={shown.moscow}
              onChange={setMoscow}
              disabled={pending}
              label={D.moscow(live.ref)}
            />
          ) : shown.moscow ? (
            <MoscowBadge code={shown.moscow} />
          ) : null}
        </div>
      ) : null}
      {canLink && card.RequirementState !== "none" ? (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="secondary"
            disabled={pending || !card.Title}
            pending={pending}
            onClick={() => link(null)}
          >
            {R.unlink}
          </Button>
          {!card.Title ? <p className="text-xs text-ink-muted">{R.needsTitle}</p> : null}
        </div>
      ) : null}
      {canLink && card.RequirementState === "none" ? (
        <RequirementPicker
          boardProjectId={boardProjectId}
          projects={projects}
          takenIds={takenIds}
          pending={pending}
          onLink={link}
        />
      ) : null}
    </section>
  );
}

/** Which requirement to link: the board's project, or on a standalone board a chosen one. */
function RequirementPicker({
  boardProjectId,
  projects,
  takenIds,
  pending,
  onLink,
}: {
  boardProjectId: number | null;
  projects: ProjectOption[];
  takenIds: readonly number[];
  pending: boolean;
  onLink: (requirementId: number) => void;
}) {
  const [project, setProject] = useState(boardProjectId ?? projects[0]?.id ?? 0);
  const [options, setOptions] = useState<Option[]>([]);
  const [choice, setChoice] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!project) return;
    let active = true;
    readPackagingOptionsAction({ projectId: project })
      .then((result) => {
        if (!active) return;
        if (result.ok)
          setOptions(
            result.data.requirements.map((r) => ({ id: r.id, label: `${r.ref} · ${r.text}` })),
          );
        else setError(result.error.message);
      })
      .catch(() => {
        if (active) setError(messages.errors.INTERNAL);
      });
    return () => {
      active = false;
    };
  }, [project]);
  const free = options
    .filter((o) => !takenIds.includes(o.id))
    .map((o) => ({ value: String(o.id), label: o.label }));
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {boardProjectId === null ? (
        <BoardField name="linkProject" label={M.project}>
          <Combobox
            name="linkProject"
            defaultValue={String(project || "")}
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
            onSelect={(option) => {
              setError("");
              setOptions([]);
              setChoice(0);
              setProject(Number(option?.value ?? 0));
            }}
          />
        </BoardField>
      ) : null}
      <BoardField name="linkRequirement" label={R.pick}>
        <Combobox
          key={project}
          name="linkRequirement"
          defaultValue=""
          options={free}
          onSelect={(option) => setChoice(Number(option?.value ?? 0))}
        />
      </BoardField>
      <Button
        variant="secondary"
        className="self-start"
        disabled={pending || !choice}
        pending={pending}
        onClick={() => onLink(choice)}
      >
        {R.link}
      </Button>
    </div>
  );
}
