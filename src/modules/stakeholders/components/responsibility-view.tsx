"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DRAG_SOURCE } from "@/components/ui/drag/drag-look";
import { moveBefore } from "@/components/ui/drag/pointer-drag";
import { DROP_MS, usePointerDrag } from "@/components/ui/drag/use-pointer-drag";
import { Select } from "@/components/ui/form/inputs";
import { useFlip } from "@/components/ui/motion/use-flip";
import { SaveDot } from "@/components/ui/save-dot";
import { HistoryButtons } from "@/components/undo/history-buttons";
import { type EditorHistory, useLendHistory } from "@/components/undo/page-history";
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
  setResponsibilityCellsAction,
} from "../actions/responsibility";
import type { StakeholderOption } from "../repository/stakeholder-options";
import { responsibilityFramework } from "../schemas/responsibility-frameworks";
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
  pushUndo,
  putBackRefused,
  setBack,
  stepBack,
  takeRedo,
  takeUndo,
  writesOf,
  type MatrixNow,
  type ResponsibilityStep,
} from "../schemas/responsibility-undo";
import { ResponsibilityCsvButton } from "./responsibility-csv-button";
import { type NewMatrix, ResponsibilityMatrixMenu } from "./responsibility-matrix-menu";
import { MEMBER_LANE, ResponsibilityMemberHeads } from "./responsibility-member-heads";
import { RoleChips, roleTone } from "./role-chips";
import { useLatestReplay } from "./use-latest-replay";
import { useSaveQueue } from "./use-save-queue";

const t = messages.responsibility;

/** The same cell as the diagram's step matrix, so both grids read alike. */
const CELL_BOX = "border-b px-2 py-1 text-left align-top";
const CELL = `${CELL_BOX} border-line`;

const idOf = (m: ResponsibilityMember) => m.stakeholderId;

let lastKey = 0;
const newKey = () => ++lastKey;

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
  | { kind: "remove"; stakeholderId: number; name: string };

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
  canEditAssignees,
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
  /** The assignee role on a WBS row also edits the deliverable's assignees. */
  canEditAssignees: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
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

  function member(stakeholderId: number) {
    return { projectId, matrixId: selected!.id, stakeholderId, rowVer: selected!.rowVer };
  }

  // A moved column stays where it was put until the page comes back with the saved order.
  const [placed, setPlaced] = useState<{
    basis: ResponsibilityMember[];
    order: ResponsibilityMember[];
  } | null>(null);
  const settled = placed?.basis === members ? placed.order : members;

  function moveMember(stakeholderId: number, position: number) {
    const from = settled.findIndex((m) => idOf(m) === stakeholderId);
    const moving = settled[from];
    if (!moving || from === position) return;
    const order = settled.filter((m) => m !== moving);
    order.splice(position, 0, moving);
    setPlaced({ basis: members, order });
    run(() => moveResponsibilityMemberAction({ ...member(stakeholderId), position }));
  }

  const movable = canEdit && !busy && members.length > 1;
  const columns = usePointerDrag({
    enabled: movable,
    axis: "x",
    onDrop: ({ itemId, beforeId }) =>
      moveMember(
        itemId,
        moveBefore(settled, idOf, itemId, beforeId).findIndex((m) => idOf(m) === itemId),
      ),
  });
  const shown = columns.over
    ? moveBefore(settled, idOf, columns.over.itemId, columns.over.beforeId)
    : settled;
  const tableRef = useRef<HTMLDivElement>(null);
  useFlip(tableRef, shown.map(idOf).join(","), {
    attribute: "data-flip-cell",
    duration: DROP_MS,
  });
  const memberCell = (stakeholderId: number, rest = "") =>
    `${CELL_BOX} ${columns.dragging === stakeholderId ? DRAG_SOURCE : `border-line ${rest}`}`;

  function createMatrix(matrix: NewMatrix) {
    run(
      () => createResponsibilityMatrixAction({ projectId, ...matrix }),
      (created) => router.push(`?m=${created.id}`),
    );
  }

  function renameMatrix(matrix: ResponsibilityMatrixSummary, name: string) {
    run(() =>
      renameResponsibilityMatrixAction({
        projectId,
        matrixId: matrix.id,
        name,
        rowVer: matrix.rowVer,
      }),
    );
  }

  function deleteMatrix(matrix: ResponsibilityMatrixSummary) {
    run(
      () =>
        deleteResponsibilityMatrixAction({
          projectId,
          matrixId: matrix.id,
          rowVer: matrix.rowVer,
        }),
      () => router.push("?"),
    );
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
      default:
        return null;
    }
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
      send: () => setResponsibilityCellsAction({ projectId, matrixId, writes: writesOf(step) }),
      done: refresh,
      failed: () =>
        setHistory((h) => (h.matrixId === matrixId ? putBackRefused(h, which, step, back.key) : h)),
    });
  }

  // A step never runs while a question to the user is open.
  const { undo, redo } = useLatestReplay((which) => {
    if (canEdit && !ask) replay(which);
  });
  const editorHistory: EditorHistory | null = now && {
    canUndo: !busy && canUndo(undoSteps, now),
    canRedo: !busy && canRedo(redoSteps, now),
    undo,
    redo,
  };
  useLendHistory(canEdit && editorHistory ? { label: t.historyLabel, ...editorHistory } : null);

  function onHistoryKey(e: KeyboardEvent<HTMLDivElement>) {
    const which = historyKeyOf(e);
    if (!which || !canEdit || ask || !e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    replay(which);
  }

  const confirm = confirmFor(ask);

  return (
    <div
      className={
        fullscreen.active
          ? "fixed inset-0 z-(--z-fullscreen) flex flex-col gap-2 overflow-auto bg-surface p-2"
          : "flex flex-col gap-2"
      }
      onKeyDown={onHistoryKey}
    >
      <div
        role="toolbar"
        aria-label={t.matrix}
        className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1"
      >
        <ResponsibilityMatrixMenu
          matrices={matrices}
          selected={selected}
          can={{ create: canCreate, update: canEdit, delete: canDelete }}
          onCreate={createMatrix}
          onRename={renameMatrix}
          onDelete={deleteMatrix}
        />
        {selected && canEdit && addable.length > 0 ? (
          <div className="w-56">
            <Select
              aria-label={t.addMember}
              data-testid="responsibility-add-member"
              value=""
              disabled={busy}
              onChange={(event) => {
                const stakeholderId = Number(event.target.value);
                if (stakeholderId) run(() => addResponsibilityMemberAction(member(stakeholderId)));
              }}
            >
              <option value="">{t.addPersonPlaceholder}</option>
              {addable.map((s) => (
                <option key={s.stakeholderId} value={s.stakeholderId}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {selected && framework && grid ? (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {canEdit ? (
              <SaveDot
                pending={saving}
                label={messages.feedback.savingState}
                testId="responsibility-saving"
                status={saving ? "saving" : "saved"}
              />
            ) : null}
            {canEdit && editorHistory ? (
              <HistoryButtons history={editorHistory} labels={t} testId="responsibility" />
            ) : null}
            <ResponsibilityCsvButton
              framework={framework}
              corner={t.rowKinds[selected.rowKind]}
              members={members}
              rows={rows.map((r) => ({ ref: refOf(r.id), label: r.label }))}
              grid={grid}
            />
            {fullscreen.supported ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                aria-pressed={fullscreen.active}
                data-testid="responsibility-fullscreen"
                onClick={() => void fullscreen.toggle()}
              >
                {messages.keyDeliverables.wbs.fullscreen}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {notice ? (
        <p role="alert" className="px-2 text-xs text-danger">
          {notice}
        </p>
      ) : null}

      {!selected || !framework || !grid ? (
        <p className="px-2 text-sm text-ink-muted">{t.empty}</p>
      ) : (
        <>
          <div className="px-2">
            <RoleChips framework={framework} />
          </div>

          {rows.length === 0 ? (
            <p className="px-2 text-sm text-ink-muted">{t.noRows}</p>
          ) : (
            <div ref={tableRef} data-drag-container className="overflow-x-auto px-2">
              <table
                data-testid="responsibility-matrix"
                className="w-full border-collapse text-xs text-ink"
              >
                <thead className="text-ink-muted">
                  <tr data-drag-lane={MEMBER_LANE}>
                    <th scope="col" className={CELL}>
                      {t.rowKinds[selected.rowKind]}
                    </th>
                    <ResponsibilityMemberHeads
                      members={shown}
                      cellClass={(stakeholderId) => memberCell(stakeholderId, "bg-surface")}
                      canEdit={canEdit}
                      movable={movable}
                      busy={busy}
                      drag={columns}
                      onMove={moveMember}
                      onRemove={(m) =>
                        setAsk({ kind: "remove", stakeholderId: m.stakeholderId, name: m.name })
                      }
                    />
                    <th scope="col" className={CELL}>
                      {t.checks}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ref = refOf(r.id);
                    const flags = grid.flagsFor(ref);
                    const hints = grid.hintsFor(ref);
                    return (
                      <tr
                        key={rowKey(ref)}
                        className="transition-colors duration-(--duration-fast) hover:bg-surface-raised"
                      >
                        <th scope="row" className={`${CELL} font-normal`}>
                          {r.label}
                        </th>
                        {shown.map((m) => {
                          const current = grid.roleAt(ref, m.stakeholderId);
                          const assigneeLocked =
                            selected.rowKind === "WbsItem" && !canEditAssignees;
                          const holdsAssignee =
                            assigneeLocked &&
                            framework.roles.some(
                              (role) => role.isAssigneeRole && role.code === current,
                            );
                          return (
                            <td
                              key={m.stakeholderId}
                              data-flip-cell={`${rowKey(ref)}:${m.stakeholderId}`}
                              className={memberCell(m.stakeholderId)}
                            >
                              <Select
                                className={`min-w-20 ${roleTone(framework, current)}`}
                                aria-label={t.cellLabel(r.label, m.name)}
                                value={current ?? ""}
                                disabled={!canEdit || busy || holdsAssignee}
                                onChange={(e) =>
                                  setCell(ref, m.stakeholderId, e.target.value || null)
                                }
                              >
                                <option value="">—</option>
                                {framework.roles.map((role) => (
                                  <option
                                    key={role.code}
                                    value={role.code}
                                    title={role.label}
                                    disabled={assigneeLocked && role.isAssigneeRole}
                                  >
                                    {role.abbrev}
                                  </option>
                                ))}
                              </Select>
                            </td>
                          );
                        })}
                        <td className={CELL}>
                          {flags.missing.length > 0 ? (
                            <div className="text-danger">
                              {t.missing}: {flags.missing.map(abbrev).join(", ")}
                            </div>
                          ) : null}
                          {flags.duplicated.length > 0 ? (
                            <div className="text-danger">
                              {t.duplicated}: {flags.duplicated.map(abbrev).join(", ")}
                            </div>
                          ) : null}
                          {hints.map((h) => (
                            <div key={h.stakeholderId} className="text-ink-muted">
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

      {confirm ? (
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
      ) : null}
    </div>
  );
}
