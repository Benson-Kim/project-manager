import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function sql(path: string): string {
  return readFileSync(path, "utf8");
}

describe("todo alert SQL review guardrails", () => {
  it("checks parent ownership before creating or updating an alert", () => {
    const create = sql("db/procs/todo-alert/usp_TodoAlert_Create.sql");
    const update = sql("db/procs/todo-alert/usp_TodoAlert_Update.sql");

    expect(create).toContain("CreatedBy = @ActorUserId");
    expect(create).toContain("FORBIDDEN_ROW");
    expect(update).toContain("CreatedBy = @ActorUserId");
    expect(update).toContain("TodoItemId cannot be changed");
  });

  it("shifts the intervening range in the correct direction", () => {
    const reorder = sql("db/procs/todo-item/usp_TodoItem_Reorder.sql");

    expect(reorder).toContain("[SortKey]    = [SortKey] + 1");
    expect(reorder).toContain("[SortKey]   < @OldSortKey");
    expect(reorder).toContain("[SortKey]    = [SortKey] - 1");
    expect(reorder).toContain("[SortKey]   > @OldSortKey");
    expect(reorder).toContain("[SortKey]   <= @NewSortKey");
  });

  it("assigns migrated alerts to a real admin account", () => {
    const seed = sql("db/seed/029_migrated_todo_owner.sql");

    expect(seed).toContain("UPDATE app.TodoItem");
    expect(seed).toContain("UPDATE app.TodoAlert");
    expect(seed).toContain("WHERE CreatedBy = 0");
  });
});
