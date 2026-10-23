import { describe, expect, it } from "vitest";
import "@/lib/rich-text/sanitize";
import {
  NOTE_REORDER_MAX,
  NOTE_TITLE_MAX,
  createNoteSchema,
  createNoteTabSchema,
  deleteNoteSchema,
  deleteNoteTabSchema,
  reorderNoteTabsSchema,
  updateNoteSchema,
  updateNoteTabSchema,
} from "../schemas/note";

describe("note schemas", () => {
  it("createNote trims the title and coerces the project id from a string", () => {
    expect(createNoteSchema.parse({ projectId: "2", title: "  Plan  " })).toEqual({
      projectId: 2,
      title: "Plan",
    });
  });

  it("createNote rejects a blank title and one over the maximum", () => {
    expect(createNoteSchema.safeParse({ projectId: "2", title: "   " }).success).toBe(false);
    expect(createNoteSchema.safeParse({ projectId: "2", title: "" }).success).toBe(false);
    const atMax = "a".repeat(NOTE_TITLE_MAX);
    expect(createNoteSchema.safeParse({ projectId: "2", title: atMax }).success).toBe(true);
    expect(createNoteSchema.safeParse({ projectId: "2", title: atMax + "a" }).success).toBe(false);
    expect(NOTE_TITLE_MAX).toBe(255);
  });

  it("createNote rejects a non-positive or non-numeric project id", () => {
    expect(createNoteSchema.safeParse({ projectId: "abc", title: "x" }).success).toBe(false);
    expect(createNoteSchema.safeParse({ projectId: "0", title: "x" }).success).toBe(false);
  });

  it("updateNote and deleteNote coerce ids and rowVer from FormData strings", () => {
    expect(updateNoteSchema.parse({ noteId: "4", title: " T ", rowVer: "42" })).toEqual({
      noteId: 4,
      title: "T",
      rowVer: 42,
    });
    expect(deleteNoteSchema.parse({ noteId: "4", rowVer: "42" })).toEqual({
      noteId: 4,
      rowVer: 42,
    });
    expect(updateNoteSchema.safeParse({ noteId: "4", title: "T" }).success).toBe(false);
  });

  it("createNoteTab trims and requires a title", () => {
    expect(createNoteTabSchema.parse({ noteId: "4", title: " Page " })).toEqual({
      noteId: 4,
      title: "Page",
    });
    expect(createNoteTabSchema.safeParse({ noteId: "4", title: " " }).success).toBe(false);
    expect(
      createNoteTabSchema.safeParse({ noteId: "4", title: "a".repeat(NOTE_TITLE_MAX + 1) }).success,
    ).toBe(false);
  });

  it("updateNoteTab turns empty content into null and keeps real content", () => {
    const empty = updateNoteTabSchema.parse({
      noteTabId: "9",
      title: "P",
      content: "",
      rowVer: "7",
    });
    expect(empty.content).toBeNull();
    expect(empty.noteTabId).toBe(9);
    expect(empty.rowVer).toBe(7);
    const full = updateNoteTabSchema.parse({
      noteTabId: "9",
      title: "P",
      content: "<p>Hello</p>",
      rowVer: "7",
    });
    expect(full.content).toContain("Hello");
  });

  it("updateNoteTab strips scripts from the content", () => {
    const parsed = updateNoteTabSchema.parse({
      noteTabId: "9",
      title: "P",
      content: "<p>ok</p><script>alert(1)</script>",
      rowVer: "7",
    });
    expect(parsed.content).not.toContain("<script");
  });

  it("deleteNoteTab coerces its numbers", () => {
    expect(deleteNoteTabSchema.parse({ noteTabId: "9", rowVer: "7" })).toEqual({
      noteTabId: 9,
      rowVer: 7,
    });
  });

  it("reorder accepts a unique order and coerces its numbers", () => {
    const parsed = reorderNoteTabsSchema.parse({
      noteId: "4",
      order: [
        { id: "9", rowVer: "7" },
        { id: "10", rowVer: "8" },
      ],
    });
    expect(parsed.noteId).toBe(4);
    expect(parsed.order).toEqual([
      { id: 9, rowVer: 7 },
      { id: 10, rowVer: 8 },
    ]);
  });

  it("reorder rejects duplicate ids", () => {
    const result = reorderNoteTabsSchema.safeParse({
      noteId: 4,
      order: [
        { id: 9, rowVer: 7 },
        { id: 9, rowVer: 8 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("reorder rejects more entries than the maximum", () => {
    const order = Array.from({ length: NOTE_REORDER_MAX + 1 }, (_, i) => ({
      id: i + 1,
      rowVer: 1,
    }));
    expect(reorderNoteTabsSchema.safeParse({ noteId: 4, order }).success).toBe(false);
    expect(
      reorderNoteTabsSchema.safeParse({ noteId: 4, order: order.slice(0, NOTE_REORDER_MAX) })
        .success,
    ).toBe(true);
    expect(NOTE_REORDER_MAX).toBe(500);
  });
});
