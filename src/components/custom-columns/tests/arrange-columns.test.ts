import { describe, expect, it, vi } from "vitest";
import type { RegisterColumn } from "@/lib/custom-columns/register";
import { arrangeColumns, customCellSaver, type CellRow, type SetCell } from "../arrange-columns";

const col = (key: string, header = key) => ({ key, header });
const label = (ColumnKey: string, Label: string) => ({ ColumnKey, Label, RowVer: 1 });
const keys = (columns: readonly { key: string }[]) => columns.map((column) => column.key);

describe("arrangeColumns", () => {
  const columns = [col("Title"), col("Status"), col("Reorder")];
  const extra = [col("cell:1", "Owner"), col("cell:2", "Due")];

  it("shows a renamed header and keeps the built-in header of every other column", () => {
    const shown = arrangeColumns(columns, [label("Status", "Stage")], [], undefined);
    expect(shown.map((column) => column.header)).toEqual(["Title", "Stage", "Reorder"]);
  });

  it("puts the added columns in front of the column named by before", () => {
    expect(keys(arrangeColumns(columns, [], extra, "Reorder"))).toEqual(["Title", "Status", "cell:1", "cell:2", "Reorder"]);
  });

  it("puts the added columns last without before or when that column is not shown", () => {
    expect(keys(arrangeColumns(columns, [], extra))).toEqual(["Title", "Status", "Reorder", "cell:1", "cell:2"]);
    expect(keys(arrangeColumns(columns, [], extra, "Missing"))).toEqual(["Title", "Status", "Reorder", "cell:1", "cell:2"]);
  });

  it("leaves the columns it was given unchanged", () => {
    arrangeColumns(columns, [label("Title", "Name")], extra, "Status");
    expect(columns[0].header).toBe("Title");
  });
});

describe("customCellSaver", () => {
  type Row = CellRow & { Id: number; Title: string };
  const row: Row = { Id: 42, Title: "Plan", RowVer: 3, CustomCells: [] };
  const added = [{ ColumnId: 7, Name: "Owner", Kind: "text", SortOrder: 1, RowVer: 1, HasValues: false, Options: [] }] as RegisterColumn[];
  const saved = { RowVer: 4, CustomCells: [{ columnId: 7, text: "Ann" }] };

  const saver = (setCell: SetCell) => {
    const fallback = vi.fn(async () => ({ ok: true as const, data: { Title: "fallback" } }));
    const onSaved = vi.fn();
    const save = customCellSaver<Row>({ added, setCell, rowId: (r) => r.Id, fallback, onSaved });
    return { save, fallback, onSaved };
  };

  it("sends an added column's cell to setCell and answers the row's new version and cells", async () => {
    const setCell = vi.fn<SetCell>(async () => ({ ok: true, data: saved }));
    const { save, fallback, onSaved } = saver(setCell);
    await expect(save(row, "cell:7", "Ann")).resolves.toEqual({ ok: true, data: saved });
    expect(setCell).toHaveBeenCalledWith({ rowId: 42, columnId: 7, kind: "text", value: "Ann", rowVer: 3 });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("sends a built-in field to the fallback saver", async () => {
    const setCell = vi.fn<SetCell>();
    const { save, fallback, onSaved } = saver(setCell);
    await expect(save(row, "Title", "New")).resolves.toEqual({ ok: true, data: { Title: "fallback" } });
    expect(fallback).toHaveBeenCalledWith(row, "Title", "New");
    expect(setCell).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("sends a cell of a column that is no longer there to the fallback saver", async () => {
    const setCell = vi.fn<SetCell>();
    const { save, fallback } = saver(setCell);
    await save(row, "cell:9", "x");
    expect(fallback).toHaveBeenCalledWith(row, "cell:9", "x");
    expect(setCell).not.toHaveBeenCalled();
  });

  it("answers a failed write as it came and does not report a save", async () => {
    const failure = { ok: false as const, error: { code: "CONFLICT" as const, message: "Changed by someone else" } };
    const setCell = vi.fn<SetCell>(async () => failure);
    const { save, onSaved } = saver(setCell);
    await expect(save(row, "cell:7", "Ann")).resolves.toBe(failure);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
