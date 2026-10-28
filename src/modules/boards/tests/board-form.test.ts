import "@/lib/rich-text/sanitize";
import { describe, expect, it } from "vitest";
import { boardFormSchema } from "../schemas/board-form";
import { createBoardInput, setBoardProjectInput } from "../schemas/board";
import { createBoardCardInput, updateBoardCardInput } from "../schemas/board-card";
import { createBoardColumnInput } from "../schemas/board-column";
import { createBoardSprintInput } from "../schemas/board-sprint";
import { defaultBoardColumns } from "../schemas/board-rules";

describe("board FormData boundary", () => {
  it("validates the same board contract and keeps only explicit input fields", () => {
    const schema = boardFormSchema(createBoardInput, { columns: defaultBoardColumns() });
    expect(
      schema.parse({ name: " Delivery ", projectId: "2", description: "", createdBy: "99" }),
    ).toEqual({ name: "Delivery", projectId: 2, description: "", columns: defaultBoardColumns() });
    expect(schema.safeParse({ name: "", projectId: "" }).success).toBe(false);
    for (const malformed of [null, [], 42, "bad"])
      expect(schema.safeParse(malformed).success).toBe(false);
  });
  it("normalizes optional card fields without clearing omitted required update fields", () => {
    const schema = boardFormSchema(updateBoardCardInput, { boardCardId: 11, rowVer: 41 });
    expect(
      schema.parse({
        title: "",
        notes: "",
        assigneeUserId: "",
        dueDate: "",
        storyPoints: "0",
        color: "",
      }),
    ).toMatchObject({
      title: null,
      assigneeUserId: null,
      dueDate: null,
      storyPoints: 0,
      color: null,
    });
    expect(schema.safeParse({ title: "Renamed" }).success).toBe(false);
  });
  it("rejects invalid colours, points and dates before an action runs", () => {
    const schema = boardFormSchema(createBoardCardInput, { boardId: 3, boardColumnId: 4 });
    for (const change of [
      { color: "injected" },
      { storyPoints: "-1" },
      { storyPoints: "1000" },
      { dueDate: "not-a-date" },
      { title: "" },
    ]) {
      expect(schema.safeParse({ title: "Task", ...change }).success).toBe(false);
    }
    expect(schema.parse({ title: "Task", dueDate: "2026-10-28" }).dueDate).toEqual(
      new Date("2026-10-28T00:00:00Z"),
    );
  });
  it("refuses invalid category, limit and required sprint dates", () => {
    const column = boardFormSchema(createBoardColumnInput, { boardId: 3 });
    expect(column.parse({ name: "Ready", category: "todo", wipLimit: "" }).wipLimit).toBeNull();
    for (const change of [{ category: "archive" }, { wipLimit: "0" }, { wipLimit: "bad" }])
      expect(
        column.safeParse({ name: "Ready", category: "todo", wipLimit: "1", ...change }).success,
      ).toBe(false);
    const sprint = boardFormSchema(createBoardSprintInput, { boardId: 3 });
    expect(sprint.safeParse({ name: "Sprint", startDate: "", endDate: "" }).success).toBe(false);
  });
  it("requires explicit confirmation before deleting other-project cards on relink", () => {
    const schema = boardFormSchema(setBoardProjectInput, {
      boardId: 3,
      rowVer: 41,
      removeForeignCards: false,
    });
    expect(schema.parse({ projectId: "" })).toMatchObject({
      projectId: null,
      removeForeignCards: false,
    });
    expect(schema.parse({ projectId: "2", removeForeignCards: "on" }).removeForeignCards).toBe(
      true,
    );
  });
});
