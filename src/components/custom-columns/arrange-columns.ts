import type { DatasheetConfig } from "@/components/ui/data-view/datasheet";
import type { ActionResult } from "@/lib/action";
import { customCellColumnId } from "@/lib/custom-columns/kinds";
import type {
  ColumnLabel,
  RegisterCell,
  RegisterCellResult,
  RegisterColumn,
  SetRegisterCellInput,
} from "@/lib/custom-columns/register";

export type CellRow = { RowVer: number; CustomCells: readonly RegisterCell[] };
export type SaveCell<Row> = DatasheetConfig<Row>["saveCell"];
export type SetCell = (input: SetRegisterCellInput) => Promise<ActionResult<RegisterCellResult>>;

/** The built-in columns under their renamed headers, with the added ones in front of `before`, or last
 * when there is no such column. */
export function arrangeColumns<Column extends { key: string; header: string }>(
  columns: readonly Column[],
  labels: readonly ColumnLabel[],
  extra: readonly Column[],
  before?: string,
): Column[] {
  const names = new Map(labels.map((label) => [label.ColumnKey, label.Label]));
  const named = columns.map((column) => ({
    ...column,
    header: names.get(column.key) ?? column.header,
  }));
  const at = before === undefined ? -1 : named.findIndex((column) => column.key === before);
  return at < 0 ? [...named, ...extra] : [...named.slice(0, at), ...extra, ...named.slice(at)];
}

/** A datasheet saver that sends an added column's cell to `setCell` and every other field to `fallback`. */
export function customCellSaver<Row extends CellRow>({
  added,
  setCell,
  rowId,
  fallback,
  onSaved,
}: {
  added: readonly RegisterColumn[];
  setCell: SetCell;
  rowId: (row: Row) => number;
  fallback: SaveCell<Row>;
  onSaved: () => void;
}): SaveCell<Row> {
  const kindOf = new Map(added.map((column) => [column.ColumnId, column.Kind]));
  return async (row, field, value) => {
    const columnId = customCellColumnId(field);
    const kind = columnId === null ? undefined : kindOf.get(columnId);
    if (columnId === null || !kind) return fallback(row, field, value);
    const result = await setCell({ rowId: rowId(row), columnId, kind, value, rowVer: row.RowVer });
    if (!result.ok) return result;
    onSaved();
    return { ok: true, data: result.data as Partial<CellRow> as Partial<Row> };
  };
}
