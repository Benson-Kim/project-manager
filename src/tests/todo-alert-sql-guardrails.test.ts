import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function sql(path: string): string {
  return readFileSync(path, "utf8");
}

describe("todo alert SQL review guardrails", () => {
  it("checks the parent to-do's access before creating or updating an alert (ADR-0021)", () => {
    const create = sql("db/procs/todo-alert/usp_TodoAlert_Create.sql");
    const update = sql("db/procs/todo-alert/usp_TodoAlert_Update.sql");
    const rule = sql("db/procs/todo-item/usp_TodoItem_AssertAccess.sql");

    expect(create).toContain("EXEC dbo.usp_TodoItem_AssertAccess");
    expect(update).toContain("EXEC dbo.usp_TodoAlert_AssertAccess");
    expect(update).toContain("TodoItemId cannot be changed");
    // The shared rule: owners act on their own to-dos; anyone else needs Manager.
    expect(rule).toContain("@OwnerUserId = CreatedBy");
    expect(rule).toContain("FORBIDDEN_ROW");
  });

  it("pushes an alert only to a recipient who can still read the to-do (ADR-0021)", () => {
    const push = sql("db/procs/alert-subscription/usp_TodoAlert_ListPushDeliveries.sql");

    expect(push).toContain("ON r.RoleId = u.RoleId");
    expect(push).toContain(
      "CROSS APPLY dbo.ufn_TodoItem_AccessLevel(r.Name, s.UserId, t.ProjectId, t.CreatedBy) AS acc",
    );
    expect(push).toContain("AND acc.AccessLevel IS NOT NULL");
  });

  it("records push deliveries per alert, subscription and local day", () => {
    const push = sql("db/procs/alert-subscription/usp_TodoAlert_ListPushDeliveries.sql");
    const record = sql("db/procs/alert-subscription/usp_AlertSubscription_RecordDelivery.sql");
    const migration = sql("db/migrations/088_todo_alert_delivery.sql");

    expect(push).toContain("@LocalNow DATETIME2 = NULL");
    expect(push).toContain("FROM app.TodoAlertDelivery AS d");
    expect(push).not.toContain("LastPushSentAtUtc");
    expect(record).toContain("INSERT INTO app.TodoAlertDelivery");
    expect(migration).toContain("PRIMARY KEY (TodoAlertId, AlertSubscriptionId, AlertDate)");
  });

  it("caps the active push subscriptions per user", () => {
    const upsert = sql("db/procs/alert-subscription/usp_AlertSubscription_Upsert.sql");

    expect(upsert).toContain("DECLARE @MaxPerUser INT = 10;");
    expect(upsert).toContain("k.rn > @MaxPerUser");
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
