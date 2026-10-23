import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLUMN_CATEGORIES,
  MAX_BOARD_COLUMNS,
  SPRINT_STATES,
} from "@/modules/boards/schemas/board-rules";

const PROCS = join("db", "procs", "board");
const MIGRATION = join("db", "migrations", "037_boards.sql");

const sql = (path: string) => readFileSync(path, "utf8");
const boardProcs = readdirSync(PROCS).filter((f) => f.startsWith("usp_") && f.endsWith(".sql"));

/** The board's rules live in the schema, the procs and the contracts at once (ADR-0038). */
describe("board SQL guardrails", () => {
  it("finds the board procs", () => {
    expect(boardProcs.length).toBeGreaterThanOrEqual(7);
  });

  it("allows the same column categories in the database and the contracts", () => {
    const list = COLUMN_CATEGORIES.map((c) => `'${c}'`).join(", ");
    expect(sql(MIGRATION)).toContain(`CHECK (Category IN (${list}))`);
  });

  it("allows the same sprint states in the database and the contracts", () => {
    const list = SPRINT_STATES.map((s) => `'${s}'`).join(", ");
    expect(sql(MIGRATION)).toContain(`CHECK ([State] IN (${list}))`);
  });

  it("refuses more starting columns than the contracts allow", () => {
    expect(sql(join(PROCS, "usp_Board_Create.sql"))).toContain(`> ${MAX_BOARD_COLUMNS}`);
  });

  it("keeps at most one active sprint per board in the database, not only in a proc", () => {
    expect(sql(MIGRATION)).toMatch(
      /CREATE UNIQUE INDEX UQ_BoardSprint_Active ON app\.BoardSprint \(BoardId\)\s+WHERE \[State\] = 'active' AND IsDeleted = 0/,
    );
  });

  it("stops a child naming another board's row, in the database", () => {
    const migration = sql(MIGRATION);
    for (const unique of [
      "UQ_BoardColumn_Board UNIQUE (BoardId, BoardColumnId)",
      "UQ_BoardPhase_Board UNIQUE (BoardId, BoardPhaseId)",
      "UQ_BoardSprint_Board UNIQUE (BoardId, BoardSprintId)",
    ]) {
      expect(migration, unique).toContain(unique);
    }
    expect(migration).toMatch(
      /FOREIGN KEY \(BoardId, BoardPhaseId\)\s+REFERENCES app\.BoardPhase \(BoardId, BoardPhaseId\)/,
    );
  });

  it("locks the board row before asserting access, because a board can change project", () => {
    for (const verb of ["Update", "Delete"]) {
      const text = sql(join(PROCS, `usp_Board_${verb}.sql`));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("FROM app.Board WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, verb).toBeGreaterThan(0);
      expect(lock, verb).toBeGreaterThan(tran);
      expect(assert, verb).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    for (const verb of ["Update", "Delete"]) {
      const text = sql(join(PROCS, `usp_Board_${verb}.sql`));
      expect(text, verb).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, verb).toContain("THROW 50002");
    }
  });

  it("audits every write inside its own transaction", () => {
    for (const verb of ["Create", "Update", "Delete"]) {
      const text = sql(join(PROCS, `usp_Board_${verb}.sql`));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, verb).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, verb).toBeLessThan(text.indexOf("COMMIT"));
    }
  });

  it("takes the board's project from the row, never from the caller", () => {
    const text = sql(join(PROCS, "usp_Board_AssertAccess.sql"));
    const params = text.slice(text.indexOf("CREATE OR ALTER PROCEDURE"), text.indexOf("AS\nBEGIN"));
    expect(params).not.toContain("@ProjectId");
    expect(text).toContain("SELECT @ProjectId = b.ProjectId");
  });

  it("hides a board whose project was deleted, since deleting a project does not cascade", () => {
    for (const proc of ["usp_Board_AssertAccess", "usp_Board_List", "usp_Board_ListOptions"]) {
      expect(sql(join(PROCS, `${proc}.sql`)), proc).toContain("p.IsDeleted = 0");
    }
  });

  it("escapes the LIKE pattern before it reaches a predicate (docs/STANDARDS.md 2.3)", () => {
    const chain = String.raw`REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[')`;
    let searchers = 0;
    for (const name of boardProcs) {
      const text = sql(join(PROCS, name));
      const predicates = (text.match(/^.*\bLIKE\b[^\n]*@Search\b[^\n]*$/gm) ?? []).filter(
        (line) => !line.trim().startsWith("--"),
      );
      if (predicates.length === 0) continue;
      searchers += 1;
      expect(text, name).toContain(chain);
      for (const predicate of predicates) {
        expect(predicate, name).toContain(String.raw`ESCAPE N'\'`);
      }
    }
    expect(searchers).toBeGreaterThanOrEqual(2);
  });

  it("keeps every board proc static SQL, so the EXECUTE-only login can run it (ADR-0033)", () => {
    for (const name of readdirSync(PROCS)) {
      expect(sql(join(PROCS, name)), name).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE AS/);
    }
  });

  it("uses the board's access function only inside its own folder, whichever applier runs", () => {
    const folders = readdirSync(join("db", "procs")).filter(
      (f) => f !== "board" && statSync(join("db", "procs", f)).isDirectory(),
    );
    for (const folder of folders) {
      for (const file of readdirSync(join("db", "procs", folder))) {
        if (!file.endsWith(".sql")) continue;
        expect(sql(join("db", "procs", folder, file)), file).not.toContain("ufn_Board_AccessLevel");
      }
    }
  });

  it("checks every value from the columns payload before a CHECK constraint can fire", () => {
    const text = sql(join(PROCS, "usp_Board_Create.sql"));
    expect(text).toContain("WHERE [type] <> 5");
    expect(text).toContain("TRY_CAST(WipLimit AS INT)");
    expect(text.lastIndexOf("THROW 50004")).toBeLessThan(text.indexOf("INSERT INTO app.Board"));
  });
});

const PROCS_COLUMN = join("db", "procs", "board-column");
const columnProcs = readdirSync(PROCS_COLUMN).filter(
  (f) => f.startsWith("usp_") && f.endsWith(".sql"),
);

/**
 * Column procs live outside db/procs/board/, so they reach the board rule through a run-time proc
 * call (dbo.usp_Board_AssertAccess), never the board access function directly, and they take the
 * same lock-then-assert order the board procs do (ADR-0038).
 */
describe("board column SQL guardrails", () => {
  it("has the Create, Update and Move column procs", () => {
    expect(columnProcs.sort()).toEqual([
      "usp_BoardColumn_Create.sql",
      "usp_BoardColumn_Move.sql",
      "usp_BoardColumn_Update.sql",
    ]);
  });

  it("asserts access through the board, so a column cannot define its own rule", () => {
    for (const name of columnProcs) {
      const text = sql(join(PROCS_COLUMN, name));
      expect(text, name).toContain("EXEC dbo.usp_Board_AssertAccess");
    }
  });

  it("locks the board row before asserting access, because a board can change project", () => {
    for (const name of columnProcs) {
      const text = sql(join(PROCS_COLUMN, name));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, name).toBeGreaterThan(0);
      expect(lock, name).toBeGreaterThan(tran);
      expect(assert, name).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    for (const name of ["usp_BoardColumn_Update.sql", "usp_BoardColumn_Move.sql"]) {
      const text = sql(join(PROCS_COLUMN, name));
      expect(text, name).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, name).toContain("THROW 50002");
    }
  });

  it("audits every column write inside its own transaction", () => {
    for (const name of columnProcs) {
      const text = sql(join(PROCS_COLUMN, name));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, name).toBeLessThan(text.indexOf("COMMIT"));
    }
  });

  it("keeps every column proc static SQL, so the EXECUTE-only login can run it (ADR-0033)", () => {
    for (const name of columnProcs) {
      expect(sql(join(PROCS_COLUMN, name)), name).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE AS/);
    }
  });
});
