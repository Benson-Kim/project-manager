import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OPTION_COLORS } from "@/lib/lookup-lists";
import {
  COLUMN_CATEGORIES,
  MAX_BOARD_COLUMNS,
  SORT_KEY_GAP,
  SPRINT_STATES,
  STORY_POINTS_MAX,
} from "@/modules/boards/schemas/board-rules";

const PROCS = join("db", "procs", "board");
const MIGRATION = join("db", "migrations", "037_boards.sql");
const CARD_MIGRATION = join("db", "migrations", "038_board_cards.sql");

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

  it("uses the board's own functions only inside its own folder, whichever applier runs", () => {
    const folders = readdirSync(join("db", "procs")).filter(
      (f) => f !== "board" && statSync(join("db", "procs", f)).isDirectory(),
    );
    for (const folder of folders) {
      for (const file of readdirSync(join("db", "procs", folder))) {
        if (!file.endsWith(".sql")) continue;
        const text = sql(join("db", "procs", folder, file));
        // The two appliers create these folders in opposite orders (LESSONS §33), so a function
        // from board/ may not be named outside it; a proc call resolves at run time and may.
        expect(text, file).not.toContain("ufn_Board_AccessLevel");
        expect(text, file).not.toContain("ufn_Board_CardsInScope");
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
  it("has the Create, Update, Move and Delete column procs", () => {
    expect(columnProcs.sort()).toEqual([
      "usp_BoardColumn_Create.sql",
      "usp_BoardColumn_Delete.sql",
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
    for (const name of [
      "usp_BoardColumn_Update.sql",
      "usp_BoardColumn_Move.sql",
      "usp_BoardColumn_Delete.sql",
    ]) {
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

  it("will not delete a column without reflowing its cards into one that has room", () => {
    const text = sql(join(PROCS_COLUMN, "usp_BoardColumn_Delete.sql"));
    // Sized with @Adding = 0 (never throws), then the target is asked for room for all of them.
    expect(text).toContain("@Adding = 0");
    expect(text).toContain("@InScope = @Moving OUTPUT");
    expect(text).toContain("@Adding = @Moving");
    // The reflow happens before the column goes, inside the one transaction.
    const reflow = text.indexOf("UPDATE app.BoardCard");
    const remove = text.indexOf("UPDATE app.BoardColumn");
    expect(reflow).toBeGreaterThan(0);
    expect(remove).toBeGreaterThan(reflow);
    expect(text.indexOf("COMMIT")).toBeGreaterThan(remove);
  });

  it("never lets a board lose its last column", () => {
    expect(sql(join(PROCS_COLUMN, "usp_BoardColumn_Delete.sql"))).toContain(
      "A board keeps at least one column",
    );
  });
});

const PROCS_CARD = join("db", "procs", "board-card");
const cardProcs = readdirSync(PROCS_CARD).filter((f) => f.startsWith("usp_") && f.endsWith(".sql"));
const cardWrites = [
  "usp_BoardCard_Create.sql",
  "usp_BoardCard_Update.sql",
  "usp_BoardCard_Move.sql",
  "usp_BoardCard_Delete.sql",
];

/**
 * The card table and its procs (ADR-0038, migration 038). The cards are where the board's
 * invariants actually bite: cross-board ids, one total order, one requirement per board, and the
 * work-in-progress limit that two people can race for.
 */
describe("board card schema guardrails", () => {
  it("allows the same card colours in the database and the contracts", () => {
    const list = OPTION_COLORS.map((c) => `'${c}'`).join(", ");
    expect(sql(CARD_MIGRATION)).toContain(`CHECK (Color IN (${list}))`);
  });

  it("allows the same story-point range in the database and the contracts", () => {
    expect(sql(CARD_MIGRATION)).toContain(`CHECK (StoryPoints BETWEEN 0 AND ${STORY_POINTS_MAX})`);
  });

  it("stops a card naming another board's column or sprint, in the database", () => {
    const migration = sql(CARD_MIGRATION);
    expect(migration).toMatch(
      /FOREIGN KEY \(BoardId, BoardColumnId\)\s+REFERENCES app\.BoardColumn \(BoardId, BoardColumnId\)/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(BoardId, BoardSprintId\)\s+REFERENCES app\.BoardSprint \(BoardId, BoardSprintId\)/,
    );
  });

  it("keeps a card's content rule table-level, where SQL Server accepts it (error 8141)", () => {
    const migration = sql(CARD_MIGRATION);
    expect(migration).toContain(
      "CONSTRAINT CK_BoardCard_Content CHECK (Title IS NOT NULL OR RequirementId IS NOT NULL)",
    );
    // Table-level means it sits after the last column, not on one of them.
    expect(migration.indexOf("CONSTRAINT CK_BoardCard_Content")).toBeGreaterThan(
      migration.indexOf("RowVer         ROWVERSION"),
    );
  });

  it("keeps one requirement per board and one total order, in the database", () => {
    const migration = sql(CARD_MIGRATION);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX UQ_BoardCard_Requirement ON app\.BoardCard \(BoardId, RequirementId\)\s+WHERE RequirementId IS NOT NULL AND IsDeleted = 0/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX UQ_BoardCard_SortKey ON app\.BoardCard \(BoardId, SortKey\)\s+WHERE IsDeleted = 0/,
    );
  });

  it("points the requirement at the register's table, which is why this is migration 038", () => {
    expect(sql(CARD_MIGRATION)).toContain("REFERENCES app.Requirement (RequirementId)");
  });
});

describe("board card SQL guardrails", () => {
  it("has the card procs and their two internal helpers", () => {
    expect(cardProcs.sort()).toEqual([
      "usp_BoardCard_AssertAssignee.sql",
      "usp_BoardCard_Create.sql",
      "usp_BoardCard_Delete.sql",
      "usp_BoardCard_GetById.sql",
      "usp_BoardCard_Move.sql",
      "usp_BoardCard_Update.sql",
    ]);
  });

  it("asserts access through the board, so a card cannot define its own rule", () => {
    for (const name of cardProcs) {
      if (name === "usp_BoardCard_AssertAssignee.sql") continue;
      expect(sql(join(PROCS_CARD, name)), name).toContain("EXEC dbo.usp_Board_AssertAccess");
    }
  });

  it("locks the board row before asserting access, because a board can change project", () => {
    for (const name of cardWrites) {
      const text = sql(join(PROCS_CARD, name));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, name).toBeGreaterThan(0);
      expect(lock, name).toBeGreaterThan(tran);
      expect(assert, name).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    for (const name of [
      "usp_BoardCard_Update.sql",
      "usp_BoardCard_Move.sql",
      "usp_BoardCard_Delete.sql",
    ]) {
      const text = sql(join(PROCS_CARD, name));
      expect(text, name).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, name).toContain("THROW 50002");
    }
  });

  it("audits every card write inside its own transaction", () => {
    for (const name of cardWrites) {
      const text = sql(join(PROCS_CARD, name));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, name).toBeLessThan(text.indexOf("COMMIT"));
    }
  });

  it("checks the work-in-progress limit on exactly the writes that can fill a column", () => {
    // Create puts a card in a column; Move puts one in another column. An edit cannot.
    for (const name of ["usp_BoardCard_Create.sql", "usp_BoardCard_Move.sql"]) {
      const text = sql(join(PROCS_CARD, name));
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      const room = text.indexOf("EXEC dbo.usp_Board_AssertRoom");
      expect(room, name).toBeGreaterThan(assert);
      expect(room, name).toBeLessThan(text.indexOf("COMMIT"));
    }
    expect(sql(join(PROCS_CARD, "usp_BoardCard_Update.sql"))).not.toContain("usp_Board_AssertRoom");
  });

  it("does not count the moving card against the limit it is already inside", () => {
    expect(sql(join(PROCS_CARD, "usp_BoardCard_Move.sql"))).toContain(
      "@ExcludeCardId = @BoardCardId",
    );
  });

  it("never takes a column, sprint, board, requirement or rank from an edit", () => {
    const text = sql(join(PROCS_CARD, "usp_BoardCard_Update.sql"));
    const params = text.slice(text.indexOf("CREATE OR ALTER PROCEDURE"), text.indexOf("AS\nBEGIN"));
    for (const forbidden of [
      "@BoardId",
      "@BoardColumnId",
      "@BoardSprintId",
      "@RequirementId",
      "@SortKey",
      "@CreatedBy",
    ]) {
      expect(params, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps every card proc static SQL, so the EXECUTE-only login can run it (ADR-0033)", () => {
    for (const name of readdirSync(PROCS_CARD)) {
      expect(sql(join(PROCS_CARD, name)), name).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE AS/);
    }
  });

  it("ranks cards with the gap the contracts name, so moves renumber as rarely as intended", () => {
    for (const name of ["usp_BoardCard_Create.sql", "usp_BoardCard_Move.sql"]) {
      expect(sql(join(PROCS_CARD, name)), name).toContain(String(SORT_KEY_GAP));
    }
  });

  it("renumbers a board in one statement, so the unique rank never raises 2601 as INTERNAL", () => {
    const text = sql(join(PROCS_CARD, "usp_BoardCard_Move.sql"));
    expect(text).toContain("UPDATE ordered SET SortKey = Position * @Gap;");
    // No WHERE on the renumber: a partial rewrite could collide with the rows it left alone.
    expect(text).not.toMatch(/UPDATE ordered SET SortKey = Position \* @Gap\s+WHERE/);
  });

  it("redacts a restricted requirement before saying it was removed, in both read procs", () => {
    for (const path of [
      join(PROCS, "usp_Board_GetBoard.sql"),
      join(PROCS_CARD, "usp_BoardCard_GetById.sql"),
    ]) {
      const text = sql(path);
      const restricted = text.indexOf("THEN 'restricted'");
      const removed = text.indexOf("THEN 'removed'");
      expect(restricted, path).toBeGreaterThan(0);
      // Whichever is tested first wins the CASE, and 'restricted' must: a reader with no access
      // is never told whether the requirement still exists.
      expect(restricted, path).toBeLessThan(removed);
    }
  });

  it("never matches a restricted requirement's text in a search", () => {
    const text = sql(join(PROCS, "usp_Board_GetBoard.sql"));
    const search = text.slice(text.indexOf("AND (@Search IS NULL"));
    // The requirement half of the search is gated on the reader's access to its project.
    expect(search).toContain("ra.AccessLevel IS NOT NULL");
  });
});

/**
 * The work-in-progress rule is one rule. It decides what a column's count means, what the limit is
 * measured against, and which cards the board draws — so it lives in one function that both the
 * check and the read call. These tests fail if a second copy appears.
 */
describe("the work-in-progress rule has one definition", () => {
  const assertRoom = sql(join(PROCS, "usp_Board_AssertRoom.sql"));

  it("counts through the shared scope function rather than its own predicate", () => {
    expect(assertRoom).toContain("FROM dbo.ufn_Board_CardsInScope(@BoardId)");
    expect(assertRoom).not.toContain("[State] = 'active'");
  });

  it("is the one proc that throws LIMIT_REACHED, and it is registered", () => {
    expect(assertRoom).toContain("THROW 50007");
    const throwers = readdirSync(PROCS)
      .concat(readdirSync(PROCS_CARD))
      .filter((f) => f.endsWith(".sql"));
    const files = throwers.filter((f) => {
      const dir = f.startsWith("usp_BoardCard") ? PROCS_CARD : PROCS;
      return sql(join(dir, f)).includes("THROW 50007");
    });
    expect(files).toEqual(["usp_Board_AssertRoom.sql"]);
  });

  it("refuses to run outside the caller's transaction, where no board lock is held", () => {
    for (const path of [
      join(PROCS, "usp_Board_AssertRoom.sql"),
      join(PROCS_CARD, "usp_BoardCard_AssertAssignee.sql"),
    ]) {
      expect(sql(path), path).toContain("IF @@TRANCOUNT = 0");
    }
  });

  it("reads the board's scope through the same function the board view draws from", () => {
    expect(sql(join(PROCS, "usp_Board_GetBoard.sql"))).toContain(
      "dbo.ufn_Board_CardsInScope(@BoardId)",
    );
  });

  it("is never called from the application: the helpers are the procs' own", () => {
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) sources.push(path);
      }
    };
    walk("src");
    for (const path of sources) {
      if (path.endsWith(join("src", "tests", "board-sql-guardrails.test.ts"))) continue;
      if (path.endsWith(join("src", "tests", "proc-access-levels.test.ts"))) continue;
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toContain("usp_Board_AssertRoom");
      expect(text, path).not.toContain("usp_BoardCard_AssertAssignee");
    }
  });
});
