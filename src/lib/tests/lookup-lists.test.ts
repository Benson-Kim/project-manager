import { describe, expect, it } from "vitest";
import {
  groupLookupRows,
  listChoice,
  listChoices,
  listValue,
  saveLookupListInput,
  type LookupList,
  type LookupOptionRow,
} from "../lookup-lists";

const row = (overrides: Partial<LookupOptionRow> = {}): LookupOptionRow => ({
  ListKey: "key-deliverable.status",
  ListRowVer: 41,
  LookupOptionId: 1,
  Label: "Pending",
  SortOrder: 1,
  IsLocked: false,
  ...overrides,
});

const status: LookupList = {
  key: "key-deliverable.status",
  rowVer: 41,
  options: [
    { id: 1, label: "Pending", locked: false },
    { id: 2, label: "Completed", locked: true },
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
      options: [{ id: 9, label: "Low", locked: false }],
    });
  });

  it("keeps an empty list (one row with NULL option columns) so its RowVer is known", () => {
    const lists = groupLookupRows([
      row({ LookupOptionId: null, Label: null, SortOrder: null, IsLocked: null }),
    ]);
    expect(lists["key-deliverable.status"]).toEqual({
      key: "key-deliverable.status",
      rowVer: 41,
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
      { id: 3, label: "Good" },
      { id: null, label: "Great" },
    ]);
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
});
