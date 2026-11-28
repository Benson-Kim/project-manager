import { describe, expect, it } from "vitest";
import { nameItems, splitAddOutcome } from "../components/add-to-todo";

type Outcome = "added" | "already" | "undated";

const item = (
  ChecklistItemId: number,
  over: Partial<{ Title: string; Outcome: Outcome }> = {},
) => ({
  ChecklistItemId,
  Title: `Item ${ChecklistItemId}`,
  Outcome: "added" as Outcome,
  ...over,
});

const ids = (items: readonly { ChecklistItemId: number }[]) =>
  items.map((row) => row.ChecklistItemId);

describe("splitAddOutcome", () => {
  it("groups the answer by what the server did with each item, keeping its order", () => {
    const outcome = splitAddOutcome([
      item(1),
      item(2, { Outcome: "already" }),
      item(3, { Outcome: "undated" }),
      item(4),
      item(5, { Outcome: "already" }),
    ]);
    expect(ids(outcome.added)).toEqual([1, 4]);
    expect(ids(outcome.already)).toEqual([2, 5]);
    expect(ids(outcome.undated)).toEqual([3]);
  });

  it("answers empty groups for an empty answer", () => {
    expect(splitAddOutcome([])).toEqual({ added: [], already: [], undated: [] });
  });
});

describe("nameItems", () => {
  it("quotes up to three titles", () => {
    expect(nameItems([item(1), item(2)])).toBe('"Item 1", "Item 2"');
  });

  it("says how many more after the third", () => {
    const items = [item(1), item(2), item(3), item(4), item(5)];
    expect(nameItems(items)).toBe('"Item 1", "Item 2", "Item 3" and 2 more');
  });

  it("names a blank title as untitled", () => {
    expect(nameItems([item(1, { Title: "  " })])).toBe('"Untitled"');
  });
});
