"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { messages } from "@/lib/messages";
import {
  addRequirementAction,
  deleteRequirementAction,
  moveRequirementAction,
  updateRequirementAction,
} from "../actions";
import {
  applyRequirementDelete,
  applyRequirementEdit,
  applyRequirementMove,
  requirementOwner,
  type WbsItem,
} from "../schemas/wbs";
import { readIdSet, writeIdSet } from "./id-set-storage";
import type { Enqueue } from "./wbs-queue";
import type { RequirementAccess, RequirementHandlers } from "./wbs-requirements";

const W = messages.keyDeliverables.wbs;

function requirementOf(current: readonly WbsItem[], id: number) {
  return requirementOwner(current, id)?.requirements.find((r) => r.id === id);
}

/**
 * The requirements cascade's workflow (ADR-0036), shared by the WBS diagram and the
 * Gantt: which lists are folded or open for adding, and each edit, queued behind the
 * editor's other changes.
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
  const { canCreate, canEdit, canDelete } = access;

  // Folded lists, kept per project in this browser like the collapsed branches.
  const storageKey = `wbs-req-hidden:${projectId}`;
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readIdSet(storageKey);
      if (saved) setHidden(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  const [adding, setAdding] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function changeHidden(change: (current: ReadonlySet<number>) => ReadonlySet<number>) {
    setHidden((current) => {
      const next = change(current);
      writeIdSet(storageKey, next);
      return next;
    });
  }

  function show(itemId: number) {
    changeHidden((current) => {
      if (!current.has(itemId)) return current;
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  }

  /** Negative ids for requirements the server has not answered for yet. */
  const pendingId = useRef(0);

  function add(itemId: number, text: string) {
    if (!canCreate || !hasItem(itemId)) return;
    const tempId = -++pendingId.current;
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
                    text,
                    isMet: false,
                    sortOrder: i.requirements.length + 1,
                    rowVer: 0,
                  },
                ],
              }
            : i,
        ),
      send: (current) =>
        current.some((i) => i.id === itemId) ? addRequirementAction({ itemId, text }) : null,
      done: () => announce(W.requirementAdded),
    });
  }

  /** Sends both fields; the unchanged one comes from the server's last answer. */
  function save(id: number, edit: { text?: string; isMet?: boolean }) {
    if (!canEdit || id < 0) return;
    enqueue({
      apply: (rows) => applyRequirementEdit(rows, id, edit),
      send: (current) => {
        const saved = requirementOf(current, id);
        return saved
          ? updateRequirementAction({
              id,
              text: edit.text ?? saved.text,
              isMet: edit.isMet ?? saved.isMet,
              rowVer: saved.rowVer,
            })
          : null;
      },
    });
  }

  function move(id: number, delta: -1 | 1) {
    const owner = requirementOwner(items, id);
    if (!canEdit || !owner || id < 0) return;
    const position = owner.requirements.findIndex((r) => r.id === id) + 1 + delta;
    if (position < 1 || position > owner.requirements.length) return;
    enqueue({
      apply: (rows) => applyRequirementMove(rows, id, position),
      send: (current) => {
        const saved = requirementOf(current, id);
        return saved ? moveRequirementAction({ id, position, rowVer: saved.rowVer }) : null;
      },
    });
  }

  function remove() {
    const id = confirmId;
    setConfirmId(null);
    if (!canDelete || id === null || id < 0) return;
    enqueue({
      apply: (rows) => applyRequirementDelete(rows, id),
      send: (current) => {
        const saved = requirementOf(current, id);
        return saved ? deleteRequirementAction({ id, rowVer: saved.rowVer }) : null;
      },
      done: () => announce(W.requirementDeleted),
    });
  }

  const handlers: RequirementHandlers = {
    add,
    edit: (id, text) => {
      if (requirementOf(items, id)?.text !== text) save(id, { text });
    },
    setMet: (id, isMet) => save(id, { isMet }),
    move,
    remove: (id) => {
      if (canDelete && id > 0) setConfirmId(id);
    },
    toggle: (itemId) =>
      changeHidden((current) => {
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
  };

  const confirming = confirmId !== null ? requirementOf(items, confirmId) : undefined;
  const dialog = (
    <ConfirmDialog
      open={confirming !== undefined}
      onOpenChange={(open) => {
        if (!open) setConfirmId(null);
      }}
      title={confirming ? W.deleteRequirementTitle(confirming.text) : ""}
      body={W.deleteRequirementBody}
      confirmLabel={W.delete}
      onConfirm={remove}
    />
  );

  return { hidden, adding, access, handlers, dialog };
}
