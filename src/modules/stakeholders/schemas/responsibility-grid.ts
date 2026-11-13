import type { ResponsibilityFramework } from "./responsibility-frameworks";
import {
  cellKey,
  rowFlags,
  type ResponsibilityCell,
  type ResponsibilityRowFlags,
  type ResponsibilityRowRef,
} from "./responsibility-matrix";

export function rowKey(row: ResponsibilityRowRef): string {
  return row.kind === "WbsItem" ? `W:${row.keyDeliverableId}` : `D:${row.decisionId}`;
}

export class ResponsibilityGrid {
  private readonly byCell = new Map<string, ResponsibilityCell>();
  private readonly byRow = new Map<string, ResponsibilityCell[]>();

  constructor(
    private readonly framework: ResponsibilityFramework,
    cells: readonly ResponsibilityCell[],
  ) {
    for (const cell of cells) {
      this.byCell.set(cellKey(cell.row, cell.stakeholderId), cell);
      const key = rowKey(cell.row);
      const onRow = this.byRow.get(key);
      if (onRow) onRow.push(cell);
      else this.byRow.set(key, [cell]);
    }
  }

  roleAt(row: ResponsibilityRowRef, stakeholderId: number): string | null {
    return this.byCell.get(cellKey(row, stakeholderId))?.roleCode ?? null;
  }

  hintsFor(row: ResponsibilityRowRef): ResponsibilityCell[] {
    return this.cellsOn(row).filter((c) => !c.isMember);
  }

  holdersOf(row: ResponsibilityRowRef, roleCode: string, exceptStakeholderId: number): number[] {
    const ids = this.cellsOn(row)
      .filter((c) => c.roleCode === roleCode && c.stakeholderId !== exceptStakeholderId)
      .map((c) => c.stakeholderId);
    return [...new Set(ids)];
  }

  flagsFor(row: ResponsibilityRowRef): ResponsibilityRowFlags {
    return rowFlags(
      this.framework,
      this.cellsOn(row).map((c) => c.roleCode),
    );
  }

  private cellsOn(row: ResponsibilityRowRef): readonly ResponsibilityCell[] {
    return this.byRow.get(rowKey(row)) ?? [];
  }
}
