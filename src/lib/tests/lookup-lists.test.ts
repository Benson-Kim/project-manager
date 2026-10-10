import { describe, expect, it } from "vitest";
import {
  groupLookupRows,
  listChoice,
  listChoices,
  listValue,
  optionColor,
  saveLookupListInput,
  type LookupList,
  type LookupOptionRow,
} from "../lookup-lists";

const row = (overrides: Partial<LookupOptionRow> = {}): LookupOptionRow => ({
  ListKey: "key-deliverable.status",
  ListRowVer: 41,
  ListTintRows: false,
  LookupOptionId: 1,
  Label: "Pending",
  SortOrder: 1,
  IsLocked: false,
  Color: null,
  ...overrides,
});

const status: LookupList = {
  key: "key-deliverable.status",
  rowVer: 41,
  tintRows: false,
  options: [
    { id: 1, label: "Pending", locked: false, color: null },
    { id: 2, label: "Completed", locked: true, color: null },
  ],
};

describe("lookup lists (ADR-0022)", () => {
  it("groups proc rows into ordered lists with their RowVer", () => {
    const lists = groupLookupRows([
      row(),
      row({ LookupOptionId: 2, Label: "Completed", SortOrder: 2, IsLocked: true }),
      row({ ListKey: "key-deliverable.priority", ListRowVer: 7, LookupOptionId: 9, Label: "Low" }),
    ]);
    expect(lists["key-deliverable.status"]).toEqual(status);
    expect(lists["key-deliverable.priority"]).toEqual({
      key: "key-deliverable.priority",
      rowVer: 7,
      tintRows: false,
      options: [{ id: 9, label: "Low", locked: false, color: null }],
    });
  });

  it("keeps an empty list (one row with NULL option columns) so its RowVer is known", () => {
    const lists = groupLookupRows([
      row({ LookupOptionId: null, Label: null, SortOrder: null, IsLocked: null }),
    ]);
    expect(lists["key-deliverable.status"]).toEqual({
      key: "key-deliverable.status",
      rowVer: 41,
      tintRows: false,
      options: [],
    });
  });

  it("validates a save: labels trimmed, required, at most 50 characters", () => {
    const parsed = saveLookupListInput.parse({
      listKey: "supplier.rating",
      rowVer: "12",
      options: [
        { id: 3, label: "  Good " },
        { id: null, label: "Great" },
      ],
    });
    expect(parsed.rowVer).toBe(12);
    expect(parsed.options).toEqual([
      { id: 3, label: "Good", color: null },
      { id: null, label: "Great", color: null },
    ]);
    // Colours come from the palette only (migration 020).
    expect(
      saveLookupListInput.safeParse({
        listKey: "supplier.rating",
        rowVer: 1,
        options: [{ id: null, label: "Great", color: "pink" }],
      }).success,
    ).toBe(false);
    const blank = saveLookupListInput.safeParse({
      listKey: "supplier.rating",
      rowVer: 1,
      options: [{ id: null, label: "  " }],
    });
    expect(blank.success).toBe(false);
    const long = saveLookupListInput.safeParse({
      listKey: "supplier.rating",
      rowVer: 1,
      options: [{ id: null, label: "x".repeat(51) }],
    });
    expect(long.success).toBe(false);
  });

  it("rejects names that repeat ignoring case, on the repeated option", () => {
    const result = saveLookupListInput.safeParse({
      listKey: "supplier.rating",
      rowVer: 1,
      options: [
        { id: 1, label: "Good" },
        { id: null, label: "good" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["options", 1, "label"]);
  });

  it("rejects an unknown list", () => {
    expect(saveLookupListInput.safeParse({ listKey: "nope", rowVer: 1, options: [] }).success).toBe(
      false,
    );
  });

  it("offers the live options, plus a record's retired value so it never shows blank", () => {
    expect(listChoices(status, false)).toEqual([
      { value: "Pending", label: "Pending" },
      { value: "Completed", label: "Completed" },
    ]);
    expect(listChoices(status, false, { value: "Legacy", label: null })).toContainEqual({
      value: "Legacy",
      label: "Legacy",
    });
    expect(listChoices(status, false, { value: "Pending", label: null })).toHaveLength(2);
  });

  it("uses option ids as values for id-bound lists, labelling a retired one", () => {
    expect(listChoices(status, true, { value: "77", label: "Old status" })).toEqual([
      { value: "1", label: "Pending" },
      { value: "2", label: "Completed" },
      { value: "77", label: "Old status" },
    ]);
  });

  it("parses list-bound form fields: '' means no choice, the proc checks the rest", () => {
    expect(listChoice.parse("")).toBeNull();
    expect(listChoice.parse(undefined)).toBeNull();
    expect(listChoice.parse(" High ")).toBe("High");
    expect(listChoice.safeParse("x".repeat(51)).success).toBe(false);
    expect(listValue.parse("Anything the list may hold")).toBe("Anything the list may hold");
  });
  it("reads a value's colour: by label, or by option id for id-bound lists (migration 020)", () => {
    const priority: LookupList = {
      key: "todo-item.priority",
      rowVer: 1,
      tintRows: true,
      options: [
        { id: 5, label: "High", locked: false, color: "orange" },
        { id: 6, label: "Low", locked: false, color: null },
      ],
    };
    expect(optionColor(priority, "High")).toBe("orange");
    expect(optionColor(priority, "Low")).toBeNull();
    expect(optionColor(priority, "Retired")).toBeNull();
    expect(optionColor(priority, null)).toBeNull();
    expect(optionColor(undefined, "High")).toBeNull();
    const byId: LookupList = {
      key: "daily-activity.status",
      rowVer: 1,
      tintRows: false,
      options: [{ id: 10, label: "Completed", locked: false, color: "green" }],
    };
    expect(optionColor(byId, "10")).toBe("green");
    expect(optionColor(byId, "Completed")).toBeNull();
  });

  it("groups each option's colour and the list's row colouring", () => {
    const lists = groupLookupRows([row({ ListTintRows: true, Color: "red" })]);
    expect(lists["key-deliverable.status"]).toMatchObject({
      tintRows: true,
      options: [{ id: 1, color: "red" }],
    });
  });
});
