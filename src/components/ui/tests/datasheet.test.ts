import { describe, expect, it, vi } from "vitest";
import type { LookupLists } from "@/lib/lookup-lists";
import {
  cellChoices,
  emptyDraft,
  formCellSaver,
  formText,
  hasDraft,
  invalidFields,
  isCellChanged,
  isEditableTarget,
  type CellEditor,
} from "../data-view/datasheet";

interface Row {
  Id: number;
  Status: string | null;
  RowVer: number;
}

const lists: LookupLists = {
  "key-deliverable.status": {
    key: "key-deliverable.status",
    rowVer: 3,
    options: [
      { id: 1, label: "Pending", locked: false },
      { id: 2, label: "Completed", locked: true },
    ],
  },
  "daily-activity.status": {
    key: "daily-activity.status",
    rowVer: 4,
    options: [{ id: 10, label: "Not Started", locked: false }],
  },
};

const status: CellEditor<Row> = {
  kind: "select",
  field: "status",
  list: "key-deliverable.status",
  value: (r) => r.Status ?? "",
  placeholder: "[Select status…]",
};

describe("datasheet helpers (ADR-0023)", () => {
  it("leaves keys typed into controls to the control, not to row navigation", () => {
    for (const tagName of ["INPUT", "select", "TEXTAREA", "BUTTON"]) {
      expect(isEditableTarget({ tagName })).toBe(true);
    }
    expect(isEditableTarget({ tagName: "TR" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("offers a list's live options, keeping the row's retired value visible", () => {
    expect(cellChoices(status, lists).map((c) => c.value)).toEqual(["Pending", "Completed"]);
    expect(cellChoices(status, lists, { value: "Legacy", label: null }).at(-1)).toEqual({
      value: "Legacy",
      label: "Legacy",
    });
  });

  it("uses option ids for id-bound lists", () => {
    const byId: CellEditor<Row> = { ...status, list: "daily-activity.status" };
    expect(cellChoices(byId, lists)).toEqual([{ value: "10", label: "Not Started" }]);
  });

  it("offers fixed choices when the select is not a managed list", () => {
    const fixed: CellEditor<Row> = {
      ...status,
      list: undefined,
      choices: [{ value: "on", label: "Yes" }],
    };
    expect(cellChoices(fixed, lists, { value: "x", label: "Other" })).toEqual([
      { value: "on", label: "Yes" },
      { value: "x", label: "Other" },
    ]);
  });

  it("saves a cell only when its value changed (text ignores surrounding spaces)", () => {
    expect(isCellChanged("text", "Alpha", " Alpha ")).toBe(false);
    expect(isCellChanged("text", "Alpha", "Beta")).toBe(true);
    expect(isCellChanged("select", "Pending", "Pending")).toBe(false);
    expect(isCellChanged("date", "2026-10-08", "")).toBe(true);
  });

  it("drafts the new-entry row by form field and knows when it holds something", () => {
    const draft = emptyDraft([status, { ...status, field: "priority" }]);
    expect(draft).toEqual({ status: "", priority: "" });
    expect(hasDraft(draft)).toBe(false);
    expect(hasDraft({ ...draft, status: "Pending" })).toBe(true);
    expect(hasDraft({ ...draft, status: "   " })).toBe(false);
  });

  it("marks the fields a failed action names", () => {
    expect([...invalidFields({ keyRequirement: ["Enter the requirement"] })]).toEqual([
      "keyRequirement",
    ]);
    expect(invalidFields(undefined).size).toBe(0);
  });

  it("writes row values as form strings", () => {
    expect(formText(null)).toBe("");
    expect(formText(undefined)).toBe("");
    expect(formText(12)).toBe("12");
    expect(formText("x")).toBe("x");
  });

  it("saves a cell as the row's form values with one field replaced", async () => {
    const update = vi.fn().mockResolvedValue({ ok: true, data: { Id: 1, RowVer: 9 } });
    const save = formCellSaver<Row, { Id: number; RowVer: number }>(
      (r) => ({ id: String(r.Id), rowVer: String(r.RowVer), status: r.Status ?? "" }),
      update,
    );
    const result = await save({ Id: 1, Status: "Pending", RowVer: 8 }, "status", "Completed");
    expect(update).toHaveBeenCalledWith({ id: "1", rowVer: "8", status: "Completed" });
    expect(result).toEqual({ ok: true, data: { Id: 1, RowVer: 9 } });
  });

  it("passes a failed save through unchanged", async () => {
    const failure = { ok: false, error: { code: "CONFLICT", message: "Reload" } } as const;
    const save = formCellSaver<Row, Row>(() => ({}), vi.fn().mockResolvedValue(failure));
    expect(await save({ Id: 1, Status: null, RowVer: 1 }, "status", "x")).toBe(failure);
  });
});
