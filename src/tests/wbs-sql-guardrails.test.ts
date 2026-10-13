import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import { MAX_WBS_DEPTH } from "@/modules/key-deliverables/schemas/wbs";

function sql(path: string): string {
  return readFileSync(path, "utf8");
}

const PROCS = "db/procs/key-deliverable";

/** The work breakdown's rules live in the procs and again in the editor (ADR-0027). */
describe("work breakdown SQL guardrails", () => {
  it("allows the same number of levels in the editor and in the database", () => {
    const placement = sql(`${PROCS}/usp_KeyDeliverable_AssertPlacement.sql`);
    expect(placement).toContain(`DECLARE @MaxDepth INT = ${MAX_WBS_DEPTH};`);
    expect(MAX_WBS_DEPTH).toBeGreaterThanOrEqual(5);
  });

  it("allows the same bar colours as the app's palette", () => {
    const migration = sql("db/migrations/032_key_deliverable_wbs.sql");
    const list = OPTION_COLORS.map((c) => `'${c}'`).join(", ");
    expect(migration).toContain(`CHECK (Color IN (${list}))`);
  });

  it("locks the project before changing its breakdown, so two changes cannot make a loop", () => {
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(
        /FROM app\.Project WITH \(UPDLOCK, HOLDLOCK\)/,
      );
    }
  });

  it("checks a new place (same project, not under itself, not too deep) inside the transaction", () => {
    for (const proc of ["Create", "Move"]) {
      const text = sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`);
      const tran = text.indexOf("BEGIN TRAN");
      expect(tran, proc).toBeGreaterThan(0);
      expect(text.indexOf("EXEC dbo.usp_KeyDeliverable_AssertPlacement"), proc).toBeGreaterThan(
        tran,
      );
    }
  });

  it("rolls parent dates up after every change that can move them", () => {
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toContain(
        "EXEC dbo.usp_KeyDeliverable_RollUp",
      );
    }
  });

  it("gives an app from before the breakdown only the rows it can read", () => {
    const gantt = sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`);
    expect(gantt).toMatch(/@WithProjectRow\s+BIT\s+= 0/);
    expect(gantt).toContain("kd.KeyDeliverableId IS NOT NULL OR @WithProjectRow = 1");
    expect(sql(`${PROCS}/usp_KeyDeliverable_Update.sql`)).toMatch(/@ColorSet\s+BIT\s+= 0/);
  });

  it("returns the project the item belongs to, for the editor to read back", () => {
    for (const proc of ["Delete", "Move", "Reschedule", "Rename"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(/AS ProjectId;/);
    }
  });
});
