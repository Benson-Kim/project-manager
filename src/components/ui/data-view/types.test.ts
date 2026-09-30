import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";
import { rowSelectionLabel } from "./types";

interface Row {
  id: number;
  name: string;
}

const row: Row = { id: 3, name: "Alpha rollout" };

describe("rowSelectionLabel (issue #25)", () => {
  it("builds the accessible name from getRowLabel via messages.list.selectRow", () => {
    expect(rowSelectionLabel(row, (r) => r.name)).toBe(messages.list.selectRow("Alpha rollout"));
    expect(rowSelectionLabel(row, (r) => r.name)).toBe("Select Alpha rollout");
  });

  it("returns null when getRowLabel is absent so call sites keep their fallback", () => {
    expect(rowSelectionLabel(row, undefined)).toBeNull();
  });
});
