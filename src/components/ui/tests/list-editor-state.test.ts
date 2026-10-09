import { describe, expect, it } from "vitest";
import type { LookupList } from "@/lib/lookup-lists";
import {
  addOption,
  editorOptions,
  isChanged,
  moveOption,
  optionErrors,
  removeOption,
  recolorOption,
  renameOption,
  toSaveInput,
} from "../data-view/list-editor-state";

const list: LookupList = {
  key: "key-deliverable.status",
  rowVer: 5,
  tintRows: false,
  options: [
    { id: 1, label: "Pending", locked: false, color: null },
    { id: 2, label: "Completed", locked: true, color: null },
    { id: 3, label: "On Hold", locked: true, color: null },
  ],
};

describe("dropdown list editor state (ADR-0022)", () => {
  const options = editorOptions(list);

  it("starts from the list's options with stable keys", () => {
    expect(options.map((o) => o.key)).toEqual(["o1", "o2", "o3"]);
    expect(editorOptions(undefined)).toEqual([]);
  });

  it("renames unlocked options only", () => {
    expect(renameOption(options, 0, "Waiting")[0].label).toBe("Waiting");
    expect(renameOption(options, 1, "Done")[1].label).toBe("Completed");
  });

  it("moves an option up or down and ignores moves past either end", () => {
    expect(moveOption(options, 2, -1).map((o) => o.id)).toEqual([1, 3, 2]);
    expect(moveOption(options, 0, 1).map((o) => o.id)).toEqual([2, 1, 3]);
    expect(moveOption(options, 0, -1)).toBe(options);
    expect(moveOption(options, 2, 1)).toBe(options);
  });

  it("removes unlocked options and keeps locked ones", () => {
    expect(removeOption(options, 0).map((o) => o.id)).toEqual([2, 3]);
    expect(removeOption(options, 1)).toBe(options);
  });

  it("adds trimmed new options and ignores blanks", () => {
    const added = addOption(options, "  Blocked ", "n0");
    expect(added[3]).toEqual({ key: "n0", id: null, label: "Blocked", locked: false, color: null });
    expect(addOption(options, "   ", "n1")).toBe(options);
  });

  it("builds the save input in display order", () => {
    expect(toSaveInput(list.key, list.rowVer, moveOption(options, 1, -1))).toEqual({
      listKey: "key-deliverable.status",
      rowVer: 5,
      tintRows: undefined,
      options: [
        { id: 2, label: "Completed", color: null },
        { id: 1, label: "Pending", color: null },
        { id: 3, label: "On Hold", color: null },
      ],
    });
  });

  it("recolours any option (locked too) and sends colours and row colouring", () => {
    const red = recolorOption(options, 1, "red");
    expect(red[1]).toMatchObject({ label: "Completed", locked: true, color: "red" });
    expect(toSaveInput(list.key, 5, red, true)).toMatchObject({
      tintRows: true,
      options: [
        { id: 1, color: null },
        { id: 2, color: "red" },
        { id: 3, color: null },
      ],
    });
  });

  it("counts a colour or the row-colouring switch as a change", () => {
    expect(isChanged(list, recolorOption(options, 0, "green"))).toBe(true);
    expect(isChanged(list, options, true)).toBe(true);
    expect(isChanged(list, options, false)).toBe(false);
  });

  it("reports per-option errors with the save schema's messages", () => {
    expect(optionErrors(list.key, 5, options)).toEqual({});
    const errors = optionErrors(list.key, 5, [
      ...renameOption(options, 0, ""),
      { key: "n0", id: null, label: "completed", locked: false, color: null },
    ]);
    expect(Object.keys(errors)).toEqual(["0", "3"]);
  });

  it("knows when there is something to save", () => {
    expect(isChanged(list, options)).toBe(false);
    expect(isChanged(list, moveOption(options, 0, 1))).toBe(true);
    expect(isChanged(list, renameOption(options, 0, "Waiting"))).toBe(true);
    expect(isChanged(list, removeOption(options, 0))).toBe(true);
    expect(isChanged(list, renameOption(options, 0, " Pending "))).toBe(false);
  });
});
