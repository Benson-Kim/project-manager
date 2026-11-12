"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action";
import { messages } from "@/lib/messages";
import { useFullscreen } from "@/modules/key-deliverables/components/use-fullscreen";
import {
  addResponsibilityMemberAction,
  createResponsibilityMatrixAction,
  deleteResponsibilityMatrixAction,
  moveResponsibilityMemberAction,
  removeResponsibilityMemberAction,
  renameResponsibilityMatrixAction,
  setResponsibilityCellAction,
} from "../actions/responsibility";
import type { StakeholderOption } from "../repository/stakeholder-options";
import {
  RESPONSIBILITY_FRAMEWORKS,
  responsibilityFramework,
  type ResponsibilityFrameworkCode,
  type ResponsibilityRowKind,
} from "../schemas/responsibility-frameworks";
import { ResponsibilityGrid, rowKey } from "../schemas/responsibility-grid";
import { historyKeyOf, type HistoryKey } from "../schemas/responsibility-history-keys";
import type {
  ResponsibilityCell,
  ResponsibilityMatrixSummary,
  ResponsibilityMember,
  ResponsibilityRowRef,
} from "../schemas/responsibility-matrix";
import {
  canRedo,
  canUndo,
  dropUndo,
  pushUndo,
  setBack,
  stepBack,
  takeRedo,
  takeUndo,
  writesOf,
  type MatrixNow,
  type ResponsibilityStep,
} from "../schemas/responsibility-undo";
import { ResponsibilityCsvButton } from "./responsibility-csv-button";
import { useSaveQueue } from "./use-save-queue";

const t = messages.responsibility;

let lastKey = 0;
const newKey = () => ++lastKey;

const ROW_KINDS = Object.keys(t.rowKinds) as ResponsibilityRowKind[];

interface RowOption {
  id: number;
  label: string;
}

interface CellChange {
  row: ResponsibilityRowRef;
  stakeholderId: number;
  roleCode: string | null;
  expectedRoleCode: string | null;
  holderIds: number[];
}

type Ask =
  | { kind: "move"; change: CellChange; roleLabel: string; holders: string[] }
  | { kind: "remove"; stakeholderId: number; name: string }
  | { kind: "rename"; matrix: ResponsibilityMatrixSummary }
  | { kind: "delete"; matrix: ResponsibilityMatrixSummary };

export function ResponsibilityView({
  projectId,
  matrices,
  selected,
  members,
  cells,
  rows,
  stakeholders,
  canCreate,
  canEdit,
  canDelete,
}: {
  projectId: number;
  matrices: ResponsibilityMatrixSummary[];
  selected: ResponsibilityMatrixSummary | null;
  members: ResponsibilityMember[];
  cells: ResponsibilityCell[];
  rows: RowOption[];
  stakeholders: StakeholderOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newFramework, setNewFramework] = useState<ResponsibilityFrameworkCode>(
    RESPONSIBILITY_FRAMEWORKS[0].code,
  );
  const [newRowKind, setNewRowKind] = useState<ResponsibilityRowKind>(
    RESPONSIBILITY_FRAMEWORKS[0].defaultRowKind,
  );
  const [toAdd, setToAdd] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [history, setHistory] = useState<{
    matrixId: number | null;
    undo: ResponsibilityStep[];
    redo: ResponsibilityStep[];
  }>({ matrixId: null, undo: [], redo: [] });

  const framework = selected ? responsibilityFramework(selected.frameworkCode) : null;
  const grid = useMemo(
    () => (framework ? new ResponsibilityGrid(framework, cells) : null),
    [framework, cells],
  );
  const names = useMemo(
    () =>
      new Map([
        ...stakeholders.map((s) => [s.stakeholderId, s.name] as const),
        ...members.map((m) => [m.stakeholderId, m.name] as const),
      ]),
    [stakeholders, members],
  );
  const nameOf = (stakeholderId: number) => names.get(stakeholderId) ?? String(stakeholderId);
  const memberIds = new Set(members.map((m) => m.stakeholderId));
  const addable = stakeholders.filter((s) => !memberIds.has(s.stakeholderId));
  const abbrev = (code: string) => framework?.roles.find((r) => r.code === code)?.abbrev ?? code;

  const refresh = () => startTransition(() => router.refresh());
  const { enqueue, saving } = useSaveQueue((error) => {
    setNotice(error.message);
    refresh();
  });
  const busy = pending || saving;
  const fullscreen = useFullscreen();

  function run<T>(task: () => Promise<ActionResult<T>>, after?: (data: T) => void) {
    setNotice(null);
    enqueue({
      send: task,
      done: (data) => {
        after?.(data);
        refresh();
      },
    });
  }

  function refOf(rowId: number): ResponsibilityRowRef {
    return selected?.rowKind === "Decision"
      ? { kind: "Decision", decisionId: rowId }
      : { kind: "WbsItem", keyDeliverableId: rowId };
  }

  function setCell(row: ResponsibilityRowRef, stakeholderId: number, roleCode: string | null) {
    if (!framework || !grid) return;
    const role = framework.roles.find((r) => r.code === roleCode);
    const holderIds = role?.onePerRow ? grid.holdersOf(row, role.code, stakeholderId) : [];
    const change = {
      row,
      stakeholderId,
      roleCode,
      expectedRoleCode: grid.roleAt(row, stakeholderId),
      holderIds,
    };
    if (role && holderIds.length > 0) {
      setAsk({ kind: "move", change, roleLabel: role.label, holders: holderIds.map(nameOf) });
      return;
    }
    sendCell(change);
  }

  function sendCell(change: CellChange) {
    if (!selected) return;
    const { holderIds, ...cell } = change;
    const after = remember(change);
    run(
      () =>
        setResponsibilityCellAction({
          projectId,
          matrixId: selected.id,
          ...cell,
          moveSingle: holderIds.length > 0,
        }),
      after,
    );
  }

  function confirmFor(a: Ask | null) {
    switch (a?.kind) {
      case "move":
        return {
          title: t.moveSingleTitle(a.roleLabel),
          body: t.moveSinglePrompt(a.roleLabel, a.holders),
          confirmLabel: t.move,
          onConfirm: () => sendCell(a.change),
        };
      case "remove":
        return {
          title: t.removeTitle(a.name),
          body: t.removeBody,
          confirmLabel: t.removeAction,
          onConfirm: () => run(() => removeResponsibilityMemberAction(member(a.stakeholderId))),
        };
      case "delete":
        return {
          title: t.deleteTitle(a.matrix.name),
          body: t.deleteBody,
          confirmLabel: t.delete,
          onConfirm: () =>
            run(
              () =>
                deleteResponsibilityMatrixAction({
                  projectId,
                  matrixId: a.matrix.id,
                  rowVer: a.matrix.rowVer,
                }),
              () => router.push("?"),
            ),
        };
      default:
        return null;
    }
  }

  function rename(matrix: ResponsibilityMatrixSummary) {
    const name = renameTo.trim();
    setAsk(null);
    if (!name || name === matrix.name) return;
    run(() =>
      renameResponsibilityMatrixAction({
        projectId,
        matrixId: matrix.id,
        name,
        rowVer: matrix.rowVer,
      }),
    );
  }

  const ownHistory = selected !== null && history.matrixId === selected.id;
  const undoSteps = ownHistory ? history.undo : [];
  const redoSteps = ownHistory ? history.redo : [];
  const now: MatrixNow | null = grid && {
    grid,
    rows: rows.map((r) => refOf(r.id)),
    memberIds: members.map((m) => m.stakeholderId),
  };

  function remember(change: CellChange) {
    if (!grid || !selected) return undefined;
    const matrixId = selected.id;
    const { row, stakeholderId, roleCode, holderIds } = change;
    const step = setBack(grid, row, stakeholderId, roleCode, holderIds, newKey());
    if (!step) return undefined;
    return () =>
      setHistory((h) => ({
        matrixId,
        undo: pushUndo(h.matrixId === matrixId ? h.undo : [], step),
        redo: [],
      }));
  }

  function replay(which: HistoryKey) {
    if (!selected || !now || busy) return;
    const matrixId = selected.id;
    const [source, other] = which === "undo" ? [undoSteps, redoSteps] : [redoSteps, undoSteps];
    const { step, rest, dropped } = (which === "undo" ? takeUndo : takeRedo)(source, now);
    const back = step && stepBack(step, newKey());
    const others = pushUndo(other, back);
    setNotice(dropped > 0 ? t.undoDropped(dropped) : null);
    setHistory(
      which === "undo"
        ? { matrixId, undo: rest, redo: others }
        : { matrixId, undo: others, redo: rest },
    );
    if (!step || !back) return;
    enqueue({
      send: async (): Promise<ActionResult<null>> => {
        for (const write of writesOf(step)) {
          const result = await setResponsibilityCellAction({
            projectId,
            matrixId,
            ...write,
            moveSingle: false,
          });
          if (!result.ok) return result;
        }
        return { ok: true, data: null };
      },
      done: refresh,
      failed: () =>
        setHistory((h) =>
          which === "undo"
            ? { ...h, redo: dropUndo(h.redo, back.key) }
            : { ...h, undo: dropUndo(h.undo, back.key) },
        ),
    });
  }

  function onHistoryKey(e: KeyboardEvent<HTMLDivElement>) {
    const which = historyKeyOf(e);
    if (!which || !canEdit || ask || !e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    replay(which);
  }

  const confirm = confirmFor(ask);

  function member(stakeholderId: number) {
    return { projectId, matrixId: selected!.id, stakeholderId, rowVer: selected!.rowVer };
  }

  return (
    <div
      className={
        fullscreen.active
          ? "fixed inset-0 z-(--z-fullscreen) space-y-4 overflow-auto bg-surface p-4"
          : "space-y-4"
      }
      onKeyDown={onHistoryKey}
    >
      <div className="flex flex-wrap items-end gap-2">
        {matrices.length > 0 && (
          <label className="flex flex-col text-sm">
            {t.matrix}
            <select
              className="rounded-md border px-2 py-1"
              value={selected?.id ?? ""}
              onChange={(e) => router.push(`?m=${e.target.value}`)}
            >
              {matrices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && canEdit && (
          <Button
            variant="secondary"
            size="compact"
            disabled={busy}
            onClick={() => {
              setRenameTo(selected.name);
              setAsk({ kind: "rename", matrix: selected });
            }}
          >
            {t.rename}
          </Button>
        )}
        {selected && canDelete && (
          <Button
            variant="secondary"
            size="compact"
            disabled={busy}
            onClick={() => setAsk({ kind: "delete", matrix: selected })}
          >
            {t.delete}
          </Button>
        )}
        {canCreate && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              run(
                () =>
                  createResponsibilityMatrixAction({
                    projectId,
                    name,
                    frameworkCode: newFramework,
                    rowKind: newRowKind,
                  }),
                (created) => {
                  setNewName("");
                  router.push(`?m=${created.id}`);
                },
              );
            }}
          >
            <label className="flex flex-col text-sm">
              {t.name}
              <input
                className="rounded-md border px-2 py-1"
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              {t.framework}
              <select
                className="rounded-md border px-2 py-1"
                value={newFramework}
                onChange={(e) => {
                  const code = e.target.value as ResponsibilityFrameworkCode;
                  setNewFramework(code);
                  setNewRowKind(responsibilityFramework(code).defaultRowKind);
                }}
              >
                {RESPONSIBILITY_FRAMEWORKS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              {t.rowKind}
              <select
                className="rounded-md border px-2 py-1"
                value={newRowKind}
                onChange={(e) => setNewRowKind(e.target.value as ResponsibilityRowKind)}
              >
                {ROW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t.rowKinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="compact" disabled={busy || !newName.trim()}>
              {t.create}
            </Button>
          </form>
        )}
      </div>

      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}

      {!selected || !framework || !grid ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t.legend}: {framework.roles.map((r) => `${r.abbrev} = ${r.label}`).join(" · ")}
            </p>
            <div className="flex items-center gap-2">
              {canEdit && now && (
                <>
                  <Button
                    variant="secondary"
                    size="compact"
                    aria-keyshortcuts="Control+Z"
                    disabled={busy || !canUndo(undoSteps, now)}
                    onClick={() => replay("undo")}
                  >
                    {t.undo}
                  </Button>
                  <Button
                    variant="secondary"
                    size="compact"
                    aria-keyshortcuts="Control+Y Control+Shift+Z"
                    disabled={busy || !canRedo(redoSteps, now)}
                    onClick={() => replay("redo")}
                  >
                    {t.redo}
                  </Button>
                </>
              )}
              <ResponsibilityCsvButton
                framework={framework}
                corner={t.rowKinds[selected.rowKind]}
                members={members}
                rows={rows.map((r) => ({ ref: refOf(r.id), label: r.label }))}
                grid={grid}
              />
              {fullscreen.supported && (
                <Button
                  variant="secondary"
                  size="compact"
                  aria-pressed={fullscreen.active}
                  data-testid="responsibility-fullscreen"
                  onClick={() => void fullscreen.toggle()}
                >
                  {messages.keyDeliverables.wbs.fullscreen}
                </Button>
              )}
              {saving && (
                <span
                  role="status"
                  data-testid="responsibility-saving"
                  className="text-sm text-ink-muted"
                >
                  {messages.feedback.savingState}
                </span>
              )}
            </div>
          </div>

          {canEdit && addable.length > 0 && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col text-sm">
                {t.addMember}
                <select
                  className="rounded-md border px-2 py-1"
                  value={toAdd}
                  onChange={(e) => setToAdd(e.target.value)}
                >
                  <option value="" />
                  {addable.map((s) => (
                    <option key={s.stakeholderId} value={s.stakeholderId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="compact"
                disabled={busy || !toAdd}
                onClick={() =>
                  run(
                    () => addResponsibilityMemberAction(member(Number(toAdd))),
                    () => setToAdd(""),
                  )
                }
              >
                {t.add}
              </Button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noRows}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">{t.rowKinds[selected.rowKind]}</th>
                    {members.map((m, i) => (
                      <th key={m.stakeholderId} className="px-2 py-1 text-left align-bottom">
                        <div>{m.name}</div>
                        {canEdit && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="compact"
                              aria-label={t.moveLeft(m.name)}
                              disabled={busy || i === 0}
                              onClick={() =>
                                run(() =>
                                  moveResponsibilityMemberAction({
                                    ...member(m.stakeholderId),
                                    position: i - 1,
                                  }),
                                )
                              }
                            >
                              ‹
                            </Button>
                            <Button
                              variant="ghost"
                              size="compact"
                              aria-label={t.moveRight(m.name)}
                              disabled={busy || i === members.length - 1}
                              onClick={() =>
                                run(() =>
                                  moveResponsibilityMemberAction({
                                    ...member(m.stakeholderId),
                                    position: i + 1,
                                  }),
                                )
                              }
                            >
                              ›
                            </Button>
                            <Button
                              variant="ghost"
                              size="compact"
                              aria-label={t.remove(m.name)}
                              disabled={busy}
                              onClick={() =>
                                setAsk({
                                  kind: "remove",
                                  stakeholderId: m.stakeholderId,
                                  name: m.name,
                                })
                              }
                            >
                              ×
                            </Button>
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-left">{t.checks}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ref = refOf(r.id);
                    const flags = grid.flagsFor(ref);
                    const hints = grid.hintsFor(ref);
                    return (
                      <tr key={rowKey(ref)} className="border-t">
                        <th className="px-2 py-1 text-left font-normal">{r.label}</th>
                        {members.map((m) => (
                          <td key={m.stakeholderId} className="px-2 py-1">
                            <select
                              className="rounded-md border px-1"
                              aria-label={t.cellLabel(r.label, m.name)}
                              value={grid.roleAt(ref, m.stakeholderId) ?? ""}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                setCell(ref, m.stakeholderId, e.target.value || null)
                              }
                            >
                              <option value="">—</option>
                              {framework.roles.map((role) => (
                                <option key={role.code} value={role.code} title={role.label}>
                                  {role.abbrev}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                        <td className="px-2 py-1 text-xs">
                          {flags.missing.length > 0 && (
                            <div className="text-destructive">
                              {t.missing}: {flags.missing.map(abbrev).join(", ")}
                            </div>
                          )}
                          {flags.duplicated.length > 0 && (
                            <div className="text-destructive">
                              {t.duplicated}: {flags.duplicated.map(abbrev).join(", ")}
                            </div>
                          )}
                          {hints.map((h) => (
                            <div key={h.stakeholderId} className="text-muted-foreground">
                              {t.notMember}: {names.get(h.stakeholderId) ?? h.stakeholderId} (
                              {abbrev(h.roleCode)})
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setAsk(null)}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => {
            setAsk(null);
            confirm.onConfirm();
          }}
        />
      )}

      <Dialog
        open={ask?.kind === "rename"}
        onOpenChange={(open) => !open && setAsk(null)}
        title={t.renameTitle}
      >
        {ask?.kind === "rename" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename(ask.matrix);
            }}
          >
            <label className="flex flex-col text-sm">
              {t.name}
              <input
                className="rounded-md border px-2 py-1"
                value={renameTo}
                maxLength={100}
                autoFocus
                onChange={(e) => setRenameTo(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAsk(null)}>
                {messages.actions.cancel}
              </Button>
              <Button type="submit" disabled={!renameTo.trim()}>
                {messages.actions.save}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
