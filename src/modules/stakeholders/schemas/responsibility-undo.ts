import { dropStep, pushStep, takeStep, type Keyed } from "@/lib/undo-stack";
import { rowKey, type ResponsibilityGrid } from "./responsibility-grid";
import type { ResponsibilityRowRef } from "./responsibility-matrix";

export { UNDO_LIMIT } from "@/lib/undo-stack";

/** One cell going from one role to another; null is an empty cell. */
export interface CellChange {
  row: ResponsibilityRowRef;
  stakeholderId: number;
  from: string | null;
  to: string | null;
}

/** Cell changes sent one at a time, in order; a move holds both cells. */
export interface ResponsibilityStep extends Keyed {
  changes: readonly CellChange[];
}

/** One Set call: the cell must still hold `expectedRoleCode`, or the server refuses it. */
export interface CellWrite {
  row: ResponsibilityRowRef;
  stakeholderId: number;
  roleCode: string | null;
  expectedRoleCode: string | null;
}

/** The matrix as the view holds it after its last refresh. */
export interface MatrixNow {
  grid: Pick<ResponsibilityGrid, "roleAt">;
  rows: readonly ResponsibilityRowRef[];
  memberIds: readonly number[];
}

/**
 * The step back from giving a cell `roleCode`, taking it from `holderIds` when the role is one per
 * row. The cell goes back first, so the role is free again when the holders get it back. Null when
 * the cell already holds that role.
 */
export function setBack(
  grid: Pick<ResponsibilityGrid, "roleAt">,
  row: ResponsibilityRowRef,
  stakeholderId: number,
  roleCode: string | null,
  holderIds: readonly number[],
  key: number,
): ResponsibilityStep | null {
  const current = grid.roleAt(row, stakeholderId);
  if (current === roleCode) return null;
  const holders = roleCode === null ? [] : holderIds.filter((id) => id !== stakeholderId);
  return {
    key,
    changes: [
      { row, stakeholderId, from: roleCode, to: current },
      ...holders.map((id) => ({ row, stakeholderId: id, from: null, to: roleCode })),
    ],
  };
}

/** The step that takes `step` back again once it is applied: the same cells, the other way round. */
export function stepBack(step: ResponsibilityStep, key: number): ResponsibilityStep {
  return {
    key,
    changes: [...step.changes].reverse().map((c) => ({ ...c, from: c.to, to: c.from })),
  };
}

export function writesOf(step: ResponsibilityStep): CellWrite[] {
  return step.changes.map((c) => ({
    row: c.row,
    stakeholderId: c.stakeholderId,
    roleCode: c.to,
    expectedRoleCode: c.from,
  }));
}

export const pushUndo = pushStep<ResponsibilityStep>;
export const dropUndo = dropStep<ResponsibilityStep>;

/** A step applies while every row and member is still there and every cell still holds `from`. */
function applies(now: MatrixNow, step: ResponsibilityStep): boolean {
  const rows = new Set(now.rows.map(rowKey));
  return step.changes.every(
    (c) =>
      rows.has(rowKey(c.row)) &&
      now.memberIds.includes(c.stakeholderId) &&
      now.grid.roleAt(c.row, c.stakeholderId) === c.from,
  );
}

export function canUndo(stack: readonly ResponsibilityStep[], now: MatrixNow): boolean {
  return stack.some((step) => applies(now, step));
}

/** The newest step that applies; `dropped` counts the newer ones that no longer do, for a notice. */
export function takeUndo(stack: readonly ResponsibilityStep[], now: MatrixNow) {
  const { step, rest } = takeStep(stack, (s) => applies(now, s));
  return { step, rest, dropped: stack.length - rest.length - (step ? 1 : 0) };
}

export const canRedo = canUndo;
export const takeRedo = takeUndo;
