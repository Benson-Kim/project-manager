"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { messages } from "@/lib/messages";
import type { MoSCoW } from "@/modules/requirements/schemas/moscow";
import type { SolutionType } from "@/modules/requirements/schemas/requirement-types";
import {
  addRequirementAction,
  moveRequirementAction,
  removeRequirementAction,
  setRequirementMoscowAction,
  setRequirementPlanningAction,
  updateRequirementAction,
} from "../actions";
import type { AddMore } from "./wbs-requirements";
import {
  applyRequirementEdit,
  applyRequirementMove,
  applyRequirementRemove,
  findRequirement,
  requirementIn,
  type RequirementPlanning,
  type WbsItem,
} from "../schemas/wbs";
import { readIdSet, writeIdSet } from "./id-set-storage";
import type { Enqueue } from "./wbs-queue";
import type { RequirementAccess, RequirementHandlers } from "./wbs-requirements";

const W = messages.keyDeliverables.wbs;

/** A solution type is what the cascade creates; the register makes the other kinds. */
const DEFAULT_ADD_TYPE: SolutionType = "FR";

/**
 * The requirements cascade's workflow (ADR-0037), shared by the WBS diagram and the Gantt: which
 * lists are folded or open for adding, the kind a new one is added as, and each edit, queued behind
 * the editor's other changes. A requirement is a project-level record that can sit on several
 * deliverables, so wording and the met tick are saved against the requirement's RowVer and shown on
 * every deliverable at once, while a move or a remove acts on one deliverable's allocation (its
 * placeRowVer). Removing only unallocates, so it asks nothing; the register owns deletion.
 */
export function useWbsRequirements({
  projectId,
  items,
  hasItem,
  access,
  enqueue,
  announce,
  select,
}: {
  projectId: number;
  /** The breakdown as shown, pending changes included. */
  items: readonly WbsItem[];
  hasItem: (id: number) => boolean;
  access: RequirementAccess;
  enqueue: Enqueue;
  announce: (message: string) => void;
  select: (itemId: number) => void;
}) {
  const { canCreate, canEdit } = access;

  // Lists start folded so the chart stays compact; the ones opened are kept per project in this
  // browser like the collapsed branches.
  const storageKey = `wbs-req-open:${projectId}`;
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readIdSet(storageKey);
      if (saved) setOpened(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  const hidden = useMemo<ReadonlySet<number>>(
    () => new Set(items.filter((item) => !opened.has(item.id)).map((item) => item.id)),
    [items, opened],
  );
  const [adding, setAdding] = useState<number | null>(null);
  // The last kind chosen, so adding several of one kind takes one choice.
  const [addType, setAddType] = useState<SolutionType>(DEFAULT_ADD_TYPE);

  function changeOpened(change: (current: ReadonlySet<number>) => ReadonlySet<number>) {
    setOpened((current) => {
      const next = change(current);
      writeIdSet(storageKey, next);
      return next;
    });
  }

  function show(itemId: number) {
    changeOpened((current) => (current.has(itemId) ? current : new Set(current).add(itemId)));
  }

  /** Negative ids for requirements the server has not answered for yet. */
  const pendingId = useRef(0);

  function add(itemId: number, text: string, type: SolutionType, more: AddMore = {}) {
    if (!canCreate || !hasItem(itemId)) return;
    const tempId = -++pendingId.current;
    const moscow = more.moscow ?? null;
    const parentId = more.parentId ?? null;
    const meetsId = more.meetsId ?? null;
    show(itemId);
    enqueue({
      apply: (rows) =>
        rows.map((i) =>
          i.id === itemId
            ? {
                ...i,
                requirements: [
                  ...i.requirements,
                  {
                    id: tempId,
                    // A sub-requirement takes its parent's type, as the proc does.
                    type: i.requirements.find((r) => r.id === parentId)?.type ?? type,
                    ref: "",
                    text,
                    isMet: false,
                    sortOrder: i.requirements.length + 1,
                    rowVer: 0,
                    placeRowVer: 0,
                    parentId,
                    moscow,
                    criteria: null,
                    estimateDays: null,
                    ownerId: null,
                    ownerName: null,
                  },
                ],
              }
            : i,
        ),
      send: (current) =>
        current.some((i) => i.id === itemId)
          ? addRequirementAction({
              projectId,
              itemId,
              type,
              text,
              moscow,
              parentRequirementId: parentId,
              meetsId,
            })
          : null,
      done: () => announce(W.requirementAdded),
    });
  }

  /** Wording or the met tick: shared across deliverables, saved against the requirement's RowVer.
   *  The unchanged fields (type and the other value) come from the server's last answer. */
  function save(id: number, edit: { text?: string; isMet?: boolean }) {
    if (!canEdit || id < 0) return;
    enqueue({
      apply: (rows) => applyRequirementEdit(rows, id, edit),
      send: (current) => {
        const saved = findRequirement(current, id);
        return saved
          ? updateRequirementAction({
              id,
              type: saved.type,
              text: edit.text ?? saved.text,
              isMet: edit.isMet ?? saved.isMet,
              rowVer: saved.rowVer,
            })
          : null;
      },
    });
  }

  function move(itemId: number, id: number, delta: -1 | 1) {
    const item = items.find((i) => i.id === itemId);
    if (!canEdit || !item || id < 0) return;
    const position = item.requirements.findIndex((r) => r.id === id) + 1 + delta;
    if (position < 1 || position > item.requirements.length) return;
    enqueue({
      apply: (rows) => applyRequirementMove(rows, itemId, id, position),
      send: (current) => {
        const saved = requirementIn(current, itemId, id);
        return saved
          ? moveRequirementAction({ itemId, id, position, rowVer: saved.placeRowVer })
          : null;
      },
    });
  }

  /** Shared by every deliverable that lists it, like the wording. */
  function setMoscow(id: number, moscow: MoSCoW | null) {
    if (!canEdit || id < 0 || findRequirement(items, id)?.moscow === moscow) return;
    enqueue({
      apply: (rows) => applyRequirementEdit(rows, id, { moscow }),
      send: (current) => {
        const saved = findRequirement(current, id);
        return saved
          ? setRequirementMoscowAction({ requirementId: id, rowVer: saved.rowVer, moscow })
          : null;
      },
    });
  }

  function setPlanning(id: number, planning: RequirementPlanning) {
    if (!canEdit || id < 0) return;
    enqueue({
      apply: (rows) => applyRequirementEdit(rows, id, planning),
      send: (current) => {
        const saved = findRequirement(current, id);
        return saved
          ? setRequirementPlanningAction({
              requirementId: id,
              rowVer: saved.rowVer,
              acceptanceCriteria: planning.criteria,
              estimateDays: planning.estimateDays,
              ownerStakeholderId: planning.ownerId,
            })
          : null;
      },
      done: () => announce(messages.feedback.saved),
    });
  }

  /** Off this deliverable only: the requirement, its wording and its links stay in the register. */
  function remove(itemId: number, id: number) {
    if (!canEdit || id < 0 || !requirementIn(items, itemId, id)) return;
    enqueue({
      apply: (rows) => applyRequirementRemove(rows, itemId, id),
      send: (current) => {
        const saved = requirementIn(current, itemId, id);
        return saved ? removeRequirementAction({ itemId, id, rowVer: saved.placeRowVer }) : null;
      },
      done: () => announce(W.requirementRemoved),
    });
  }

  const handlers: RequirementHandlers = {
    add,
    edit: (id, text) => {
      if (findRequirement(items, id)?.text !== text) save(id, { text });
    },
    setMet: (id, isMet) => save(id, { isMet }),
    setMoscow,
    setPlanning,
    move,
    remove,
    toggle: (itemId) =>
      changeOpened((current) => {
        const next = new Set(current);
        if (!next.delete(itemId)) next.add(itemId);
        return next;
      }),
    openAdd: (itemId) => {
      if (itemId !== null) {
        if (!canCreate) return;
        select(itemId);
        show(itemId);
      }
      setAdding(itemId);
    },
    setAddType,
  };

  return { hidden, adding, addType, access, handlers };
}
