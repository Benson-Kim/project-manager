"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { DataViewColumn } from "@/components/ui/data-view/types";
import { notifySaved } from "@/lib/cross-window";
import type { ColumnLabel, RegisterColumn } from "@/lib/custom-columns/register";
import {
  arrangeColumns,
  customCellSaver,
  type CellRow,
  type SaveCell,
  type SetCell,
} from "./arrange-columns";
import { customColumn } from "./custom-column";

/** A list's columns with its renamed headers and the columns someone added (ADR-0066), and the
 * datasheet saver that sends an added cell to its own action and every other field to `fallback`. */
export function useCustomColumns<Row extends CellRow>({
  columns,
  labels,
  added,
  canEdit,
  rowId,
  setCell,
  fallback,
  before,
}: {
  columns: readonly DataViewColumn<Row>[];
  labels: readonly ColumnLabel[];
  added: readonly RegisterColumn[];
  canEdit: (row: Row) => boolean;
  rowId: (row: Row) => number;
  setCell: SetCell;
  fallback: SaveCell<Row>;
  /** The built-in column the added ones sit in front of; they go last without it. */
  before?: string;
}): { shownColumns: DataViewColumn<Row>[]; saveCell: SaveCell<Row> } {
  const router = useRouter();
  const shownColumns = useMemo(() => {
    const extra = added.map((column) =>
      customColumn<Row>({
        column: {
          id: column.ColumnId,
          name: column.Name,
          kind: column.Kind,
          actionKind: null,
          options: column.Options,
        },
        cell: (row) => row.CustomCells.find((cell) => cell.columnId === column.ColumnId),
        canEdit,
        save: async (row, value) => {
          const result = await setCell({
            rowId: rowId(row),
            columnId: column.ColumnId,
            kind: column.Kind,
            value,
            rowVer: row.RowVer,
          });
          if (result.ok) {
            router.refresh();
            notifySaved();
          }
          return result;
        },
      }),
    );
    return arrangeColumns(columns, labels, extra, before);
  }, [columns, labels, added, canEdit, rowId, setCell, before, router]);
  const saveCell = useMemo(
    () => customCellSaver<Row>({ added, setCell, rowId, fallback, onSaved: notifySaved }),
    [added, fallback, rowId, setCell],
  );
  return { shownColumns, saveCell };
}
