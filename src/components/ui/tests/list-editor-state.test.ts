import { describe, expect, it } from "vitest";
import type { LookupList } from "@/lib/lookup-lists";
import {
  addOption,
  editorOptions,
  isChanged,
  moveOption,
  optionErrors,
  removeOption,
  renameOption,
  toSaveInput,
} from "../data-view/list-editor-state";

const list: LookupList = {
  key: "key-deliverable.status",
  rowVer: 5,
  options: [
    { id: 1, label: "Pending", locked: false },
    { id: 2, label: "Completed", locked: true },
    { id: 3, label: "On Hold", locked: true },
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
    expect(added[3]).toEqual({ key: "n0", id: null, label: "Blocked", locked: false });
    expect(addOption(options, "   ", "n1")).toBe(options);
  });

  it("builds the save input in display order", () => {
    expect(toSaveInput(list.key, list.rowVer, moveOption(options, 1, -1))).toEqual({
      listKey: "key-deliverable.status",
      rowVer: 5,
      options: [
        { id: 2, label: "Completed" },
        { id: 1, label: "Pending" },
        { id: 3, label: "On Hold" },
      ],
    });
  });

  it("reports per-option errors with the save schema's messages", () => {
    expect(optionErrors(list.key, 5, options)).toEqual({});
    const errors = optionErrors(list.key, 5, [
      ...renameOption(options, 0, ""),
      { key: "n0", id: null, label: "completed", locked: false },
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
