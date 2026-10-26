import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import { MAX_WBS_DEPTH } from "@/modules/key-deliverables/schemas/wbs";
import {
  DEPENDENCY_TYPES,
  LAG_MAX_DAYS,
  LAG_MIN_DAYS,
  MAX_CASCADE_ROUNDS,
} from "@/modules/key-deliverables/schemas/wbs-dependencies";

function sql(path: string): string {
  return readFileSync(path, "utf8");
}

const PROCS = "db/procs/key-deliverable";

/** A proc's parameter list alone: what callers may send, as opposed to its local DECLAREs. */
function params(proc: string): string {
  const from = proc.indexOf("CREATE OR ALTER PROCEDURE");
  const to = proc.indexOf("\nAS\n", from);
  return proc.slice(from, to === -1 ? undefined : to);
}
const REQUIREMENTS = "db/procs/requirement";
const LINKS = "db/procs/key-deliverable-dependency";

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
    for (const proc of [
      "Create",
      "Update",
      "Delete",
      "Move",
      "Reschedule",
      "Rename",
      "SetStatus",
      "SetMilestone",
    ]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(
        /FROM app\.Project WITH \(UPDLOCK, HOLDLOCK\)/,
      );
    }
  });

  it("locks the project before changing a requirement, so the stamp follows commit order", () => {
    for (const proc of ["Create", "Update", "Move", "Unallocate", "Delete"]) {
      expect(sql(`${REQUIREMENTS}/usp_Requirement_${proc}.sql`), proc).toMatch(
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
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule", "SetMilestone"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toContain(
        "EXEC dbo.usp_KeyDeliverable_RollUp",
      );
    }
  });

  it("rolls up only the changed item's branch, and a move also the branch it left", () => {
    for (const proc of ["Create", "Update", "Delete", "Move", "Reschedule", "SetMilestone"]) {
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
    // A register edit or an allocation change moves it too (ADR-0037): a three-part stamp.
    expect(gantt).toContain("IF @RequirementStamp > @Stamp SET @Stamp = @RequirementStamp;");
    expect(gantt).toContain("IF @AllocationStamp > @Stamp SET @Stamp = @AllocationStamp;");
    expect(gantt).toMatch(
      /DECLARE @RequirementStamp BIGINT =\s+ISNULL\(\(SELECT MAX\(CAST\(RowVer AS BIGINT\)\) FROM app\.Requirement WHERE ProjectId = @ProjectId\), 0\);/,
    );
    expect(gantt).toMatch(
      /DECLARE @AllocationStamp BIGINT =\s+ISNULL\(\(SELECT MAX\(CAST\(RowVer AS BIGINT\)\) FROM app\.RequirementDeliverable WHERE ProjectId = @ProjectId\), 0\);/,
    );
    expect(gantt.indexOf("@RequirementStamp BIGINT")).toBeLessThan(
      gantt.indexOf("SELECT kd.KeyDeliverableId"),
    );
    expect(gantt.indexOf("@AllocationStamp BIGINT")).toBeLessThan(
      gantt.indexOf("SELECT kd.KeyDeliverableId"),
    );
  });

  it("keeps allocations' null fields, and a deliverable delete unallocates but keeps requirements", () => {
    expect(sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`)).toMatch(
      /FOR JSON PATH, INCLUDE_NULL_VALUES\s+\) AS RequirementsJson/,
    );
    const del = sql(`${PROCS}/usp_KeyDeliverable_Delete.sql`);
    expect(del).toContain("N'Unallocate', N'app.RequirementDeliverable'");
    expect(del).not.toContain("app.KeyDeliverableRequirement");
    expect(del).not.toContain("N'Delete', N'app.Requirement'");
  });

  /**
   * Milestones (ADR-0046). A milestone is a date: one day, and no sub-items. The one-day half is a
   * CHECK; the leaf half spans rows, so it is taken under the project lock in two procs. Every
   * write path that could break either one is pinned here, because none of it can run locally.
   */
  it("declares the one-day rule as a table-level CHECK, so the apply cannot die on error 8141", () => {
    const migration = sql("db/migrations/043_key_deliverable_milestone.sql");
    expect(migration).toMatch(
      /ALTER TABLE app\.KeyDeliverable ADD CONSTRAINT CK_KeyDeliverable_Milestone_OneDay\s+CHECK \(/,
    );
    // The column and the constraint are added by separate statements: a column CHECK naming
    // StartDate and Deadline would be error 8141 (migration 036's lesson).
    expect(migration).toMatch(
      /ADD \[IsMilestone\] BIT NOT NULL\s+CONSTRAINT DF_\w+ DEFAULT \(0\);/,
    );
    expect(migration).toContain("CAST([Deadline] AS DATE) = CAST(StartDate AS DATE)");
    // Existing rows default to a task, so the constraint cannot fail on apply.
    expect(migration).toContain("DEFAULT (0)");
  });

  it("lets no item sit under a milestone, and no item with sub-items become one", () => {
    expect(sql(`${PROCS}/usp_KeyDeliverable_AssertPlacement.sql`)).toContain(
      "N'VALIDATION:A milestone is a date, so it takes no sub-items'",
    );
    const set = sql(`${PROCS}/usp_KeyDeliverable_SetMilestone.sql`);
    expect(set).toContain("N'VALIDATION:An item with sub-items cannot become a milestone'");
    // The leaf check is an aggregate one, so it must sit after the lock, not before it.
    const lock = set.indexOf("FROM app.Project WITH (UPDLOCK, HOLDLOCK)");
    expect(lock).toBeGreaterThan(0);
    expect(set.indexOf("An item with sub-items cannot become a milestone")).toBeGreaterThan(lock);
  });

  it("keeps a milestone one day on every path that writes its dates", () => {
    // Created as the date it already is, never reinterpreted.
    expect(sql(`${PROCS}/usp_KeyDeliverable_Create.sql`)).toContain(
      "N'VALIDATION:A milestone spans one day'",
    );
    // Dragged, not stretched.
    expect(sql(`${PROCS}/usp_KeyDeliverable_Reschedule.sql`)).toContain(
      "N'VALIDATION:A milestone is one day, so it can be moved, not stretched'",
    );
    // The details sheet sends one date; the proc derives the end from it.
    const update = sql(`${PROCS}/usp_KeyDeliverable_Update.sql`);
    expect(update).toMatch(/ELSE IF @IsMilestone = 1\b/);
    expect(update).toContain("SET @Deadline = @StartDate;");
  });

  it("changes the flag only through its own proc, never on a details-sheet save", () => {
    // Update reads IsMilestone into a local to derive the end, and reports it, but it is not a
    // parameter and is never written: the flag cannot ride along on a form save.
    const update = sql(`${PROCS}/usp_KeyDeliverable_Update.sql`);
    expect(params(update)).not.toMatch(/@IsMilestone/);
    expect(update).not.toMatch(/\[IsMilestone\]\s*=\s*@IsMilestone/);
    // Only Create (as the date it is) and SetMilestone (the conversion) take the flag.
    expect(params(sql(`${PROCS}/usp_KeyDeliverable_Create.sql`))).toMatch(
      /@IsMilestone\s+BIT\s+= 0/,
    );
    const set = sql(`${PROCS}/usp_KeyDeliverable_SetMilestone.sql`);
    expect(params(set)).toMatch(/@IsMilestone\s+BIT,/);
    expect(set).toMatch(/\[IsMilestone\] = @IsMilestone/);
    // RowVer concurrency and an audit row, like every other write to the item.
    expect(set).toContain("N'CONFLICT:KeyDeliverable was modified by someone else'");
    expect(set).toContain("INSERT INTO audit.AuditLog");
  });

  it("reports the flag on every read the app parses, so the editor can draw a diamond", () => {
    for (const proc of ["GanttData", "List", "GetById", "Create", "Update"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(/kd\.\[IsMilestone\]/);
    }
  });

  /** Dependencies (ADR-0046 decisions 5-10): the rule lives in the proc and again in the editor. */
  it("allows the same four dependency types in the editor and in the database", () => {
    const migration = sql("db/migrations/044_key_deliverable_dependency.sql");
    const list = DEPENDENCY_TYPES.map((type) => `'${type}'`).join(", ");
    expect(migration).toContain(`CHECK (DependencyType IN (${list}))`);
  });

  it("bounds the lag the same way in the editor and in the database", () => {
    const migration = sql("db/migrations/044_key_deliverable_dependency.sql");
    expect(migration).toContain(`CHECK (LagDays BETWEEN ${LAG_MIN_DAYS} AND ${LAG_MAX_DAYS})`);
    for (const proc of ["Link", "Relink"]) {
      expect(sql(`${LINKS}/usp_KeyDeliverableDependency_${proc}.sql`), proc).toContain(
        `@LagDays NOT BETWEEN ${LAG_MIN_DAYS} AND ${LAG_MAX_DAYS}`,
      );
    }
  });

  it("gives up after the same number of rounds in the editor and in the scheduler", () => {
    expect(sql(`${PROCS}/usp_KeyDeliverable_CascadeDependencies.sql`)).toContain(
      `DECLARE @MaxRounds INT = ${MAX_CASCADE_ROUNDS};`,
    );
  });

  it("holds the four row-spanning link rules under the project lock, where no constraint can", () => {
    const linkProc = sql(`${LINKS}/usp_KeyDeliverableDependency_Link.sql`);
    const lock = linkProc.indexOf("FROM app.Project WITH (UPDLOCK, HOLDLOCK)");
    expect(lock).toBeGreaterThan(0);
    for (const refusal of [
      "N'VALIDATION:These items are already linked'",
      "N'VALIDATION:An item cannot depend on its own sub-item or summary'",
      "N'VALIDATION:That would make a loop of dependencies'",
      "N'VALIDATION:Both items must be in the same project'",
    ]) {
      expect(linkProc.indexOf(refusal), refusal).toBeGreaterThan(lock);
    }
    // A self-link needs no lock: it is true of the request alone, and a CHECK backs it up.
    expect(linkProc).toContain("N'VALIDATION:An item cannot depend on itself'");
  });

  it("locks the project before changing a link, so the stamp follows commit order", () => {
    for (const proc of ["Link", "Relink", "Unlink"]) {
      expect(sql(`${LINKS}/usp_KeyDeliverableDependency_${proc}.sql`), proc).toMatch(
        /FROM app\.Project WITH \(UPDLOCK, HOLDLOCK\)/,
      );
    }
  });

  it("reschedules after every change that can move a date later, and only those", () => {
    const cascade = "EXEC dbo.usp_KeyDeliverable_CascadeDependencies";
    for (const proc of ["Create", "Update", "Move", "Reschedule"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toContain(cascade);
    }
    for (const proc of ["Link", "Relink"]) {
      expect(sql(`${LINKS}/usp_KeyDeliverableDependency_${proc}.sql`), proc).toContain(cascade);
    }
    // A delete and a conversion to a milestone only ever shorten a span, and the cascade never
    // pulls an item earlier (decision 7), so neither has anything to reschedule.
    for (const proc of ["Delete", "SetMilestone"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).not.toContain(cascade);
    }
    expect(sql(`${LINKS}/usp_KeyDeliverableDependency_Unlink.sql`)).not.toContain(cascade);
  });

  it("runs the scheduler after the roll-up it adds to, never instead of it", () => {
    for (const proc of ["Create", "Update", "Move", "Reschedule"]) {
      const text = sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`);
      expect(text.indexOf("EXEC dbo.usp_KeyDeliverable_RollUp"), proc).toBeGreaterThan(0);
      expect(text.indexOf("EXEC dbo.usp_KeyDeliverable_CascadeDependencies"), proc).toBeGreaterThan(
        text.indexOf("EXEC dbo.usp_KeyDeliverable_RollUp"),
      );
    }
  });

  it("refuses to reschedule outside the caller's transaction, where it has no lock", () => {
    // It writes rows it holds no RowVer for, so the project lock is the only thing serializing it.
    expect(sql(`${PROCS}/usp_KeyDeliverable_CascadeDependencies.sql`)).toMatch(
      /IF @@TRANCOUNT = 0\s*\n\s*THROW 50004/,
    );
  });

  it("never calls the scheduler or the roll-up from the application", () => {
    // Both move rows without a RowVer and assume the caller already holds the project lock, so only
    // the write procs may call them; src/tests/proc-access-levels.test.ts exempts them from
    // asserting access for that reason. execProc takes a proc name as a quoted string, which is
    // what this looks for — the pure modules name both in prose, to say what they mirror.
    const app = readdirSync("src/modules/key-deliverables", { recursive: true })
      .filter((name): name is string => typeof name === "string" && /\.tsx?$/.test(name))
      .map((name) => sql(`src/modules/key-deliverables/${name}`))
      .join("\n");
    for (const proc of ["CascadeDependencies", "RollUp"]) {
      expect(app, proc).not.toContain(`"usp_KeyDeliverable_${proc}"`);
    }
  });

  it("takes a deleted item's links with it, at either end", () => {
    const del = sql(`${PROCS}/usp_KeyDeliverable_Delete.sql`);
    expect(del).toContain("app.KeyDeliverableDependency");
    expect(del).toMatch(/d\.PredecessorId IN \(SELECT KeyDeliverableId FROM @Branch\)/);
    expect(del).toMatch(/d\.SuccessorId\s+IN \(SELECT KeyDeliverableId FROM @Branch\)/);
  });

  it("folds the link table into the Gantt freshness stamp", () => {
    const gantt = sql(`${PROCS}/usp_KeyDeliverable_GanttData.sql`);
    expect(gantt).toContain("FROM app.KeyDeliverableDependency WHERE ProjectId = @ProjectId");
    expect(gantt).toContain("IF @DependencyStamp > @Stamp SET @Stamp = @DependencyStamp;");
    expect(gantt).toContain("AS PredecessorsJson");
  });

  it("returns the project the item belongs to, for the editor to read back", () => {
    for (const proc of ["Delete", "Move", "Reschedule", "Rename", "SetStatus", "SetMilestone"]) {
      expect(sql(`${PROCS}/usp_KeyDeliverable_${proc}.sql`), proc).toMatch(/AS ProjectId;/);
    }
    // Create and Update answer through GetById; Move, Unallocate and Delete return the project id.
    for (const proc of ["Move", "Unallocate", "Delete"]) {
      expect(sql(`${REQUIREMENTS}/usp_Requirement_${proc}.sql`), proc).toMatch(/AS ProjectId;/);
    }
  });
});
