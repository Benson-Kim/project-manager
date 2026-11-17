import { describe, expect, it } from "vitest";
import "@/lib/rich-text/sanitize";
import { setItemDetailsInput } from "../schemas/checklist";

const base = {
  itemId: 7,
  startDate: "2026-11-16",
  dueDate: "2026-11-20",
  assigneeStakeholderId: 3,
  priority: "High",
  notes: "<p>Bring the plans</p>",
  rowVer: "1",
};

describe("setItemDetailsInput", () => {
  it("accepts a full set of details", () => {
    expect(setItemDetailsInput.parse(base)).toMatchObject({ itemId: 7, priority: "High" });
  });

  it("clears every field with nulls and turns a blank priority into null", () => {
    const parsed = setItemDetailsInput.parse({
      ...base,
      startDate: null,
      dueDate: null,
      assigneeStakeholderId: null,
      priority: "  ",
      notes: null,
    });
    expect(parsed).toMatchObject({ startDate: null, dueDate: null, priority: null, notes: null });
  });

  it("refuses a date that does not exist or is not yyyy-mm-dd", () => {
    expect(setItemDetailsInput.safeParse({ ...base, dueDate: "2026-02-30" }).success).toBe(false);
    expect(setItemDetailsInput.safeParse({ ...base, startDate: "16/11/2026" }).success).toBe(false);
  });

  it("refuses a start date after the due date", () => {
    const result = setItemDetailsInput.safeParse({ ...base, startDate: "2026-11-21" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["dueDate"]);
  });

  it("refuses a priority over 255 characters and unknown keys", () => {
    expect(setItemDetailsInput.safeParse({ ...base, priority: "x".repeat(256) }).success).toBe(
      false,
    );
    expect(setItemDetailsInput.safeParse({ ...base, projectId: 1 }).success).toBe(false);
  });

  it("strips script from the notes and treats empty notes as none", () => {
    const parsed = setItemDetailsInput.parse({
      ...base,
      notes: "<p>ok</p><script>alert(1)</script>",
    });
    expect(parsed.notes).not.toContain("script");
    expect(setItemDetailsInput.parse({ ...base, notes: "<p></p>" }).notes).toBeNull();
  });
});
