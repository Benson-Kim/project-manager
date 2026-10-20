import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import { MAX_WBS_DEPTH } from "@/modules/key-deliverables/schemas/wbs";

function sql(path: string): string {
  return readFileSync(path, "utf8");
}

const PROCS = "db/procs/key-deliverable";
const REQUIREMENTS = "db/procs/key-deliverable-requirement";

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
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule", "Rename", "SetStatus"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(
        /FROM app\.Project WITH \(UPDLOCK, HOLDLOCK\)/,
      );
    }
  });

  it("locks the project before changing a requirement, so the stamp follows commit order", () => {
    for (const proc of ["Create", "Update", "Move", "Delete"]) {
      expect(sql(`${REQUIREMENTS}/usp_KeyDeliverableRequirement_${proc}.sql`), proc).toMatch(
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

  it("rolls up only the changed item's branch, and a move also the branch it left", () => {
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(
        /EXEC dbo\.usp_KeyDeliverable_RollUp\s+@ProjectId = @\w+, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @(Id|KeyDeliverableId);/,
      );
    }
    expect(sql(`${PROCS}/usp_KeyDeliverable_Move.sql`)).toMatch(
      /@OldParent IS NOT NULL[^\n]*\n\s+EXEC dbo\.usp_KeyDeliverable_RollUp\s[^;]*@FromKeyDeliverableId = @OldParent;/,
    );
    expect(sql(`${PROCS}/usp_KeyDeliverable_RollUp.sql`)).toContain(
      "WHERE (up.Lvl = 0 OR up.IsDeleted = 0) AND up.Lvl < 50",
    );
  });

  it("keeps an item, its sub-items and its parents ending on or after their requested dates", () => {
    const reschedule = sql(`${PROCS}/usp_KeyDeliverable_Reschedule.sql`);
    expect(reschedule).toContain("Deadline cannot be before RequestedDate");
    expect(reschedule).toContain("A sub-item would end before its requested date");
    expect(sql(`${PROCS}/usp_KeyDeliverable_RollUp.sql`)).toMatch(
      /WHERE c\.NewEnd < kd\.RequestedDate\s+AND \(c\.OldEnd IS NULL OR c\.OldEnd >= kd\.RequestedDate\)\)\s+THROW 50004, N'VALIDATION:A parent would end before its requested date'/,
    );
  });

  it("gives an app from before the breakdown only the rows it can read", () => {
    const gantt = sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`);
    expect(gantt).toMatch(/@WithProjectRow\s+BIT\s+= 0/);
    expect(gantt).toContain("kd.KeyDeliverableId IS NOT NULL OR @WithProjectRow = 1");
    expect(sql(`${PROCS}/usp_KeyDeliverable_Update.sql`)).toMatch(/@ColorSet\s+BIT\s+= 0/);
  });

  it("stamps a read with the project's newest RowVer, which every write moves forward", () => {
    const gantt = sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`);
    expect(gantt).not.toContain("MIN_ACTIVE_ROWVERSION");
    expect(gantt).toMatch(
      /DECLARE @Stamp BIGINT =\s+ISNULL\(\(SELECT MAX\(CAST\(RowVer AS BIGINT\)\) FROM app\.KeyDeliverable WHERE ProjectId = @ProjectId\), 0\);/,
    );
    expect(gantt.indexOf("@Stamp BIGINT")).toBeLessThan(
      gantt.indexOf("SELECT kd.KeyDeliverableId"),
    );
    // Requirement writes move it too (ADR-0034).
    expect(gantt).toContain("IF @RequirementStamp > @Stamp SET @Stamp = @RequirementStamp;");
    expect(gantt.indexOf("@RequirementStamp BIGINT")).toBeLessThan(
      gantt.indexOf("SELECT kd.KeyDeliverableId"),
    );
  });

  it("returns each item's requirements with null fields kept, and deletes them with the item", () => {
    expect(sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`)).toMatch(
      /FOR JSON PATH, INCLUDE_NULL_VALUES\s+\) AS RequirementsJson/,
    );
    expect(sql(`${PROCS}/usp_KeyDeliverable_Delete.sql`)).toContain(
      "N'Delete', N'app.KeyDeliverableRequirement'",
    );
  });

  it("returns the project the item belongs to, for the editor to read back", () => {
    for (const proc of ["Delete", "Move", "Reschedule", "Rename", "SetStatus"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(/AS ProjectId;/);
    }
    for (const proc of ["Create", "Update", "Move", "Delete"]) {
      expect(sql(`${REQUIREMENTS}/usp_KeyDeliverableRequirement_${proc}.sql`), proc).toMatch(
        /AS ProjectId;/,
      );
    }
  });
});
