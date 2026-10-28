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

/**
 * The write sets of a folder, read out of the folder itself so a new proc joins them by
 * existing. Every assertion that loops one of these also names the procs the set must *at
 * least* contain, so a filter that matched nothing cannot pass by iterating an empty list.
 *
 * This replaced hardcoded verb lists across all five folders, after usp_Board_SetProject was
 * added to db/procs/board/ and passed the whole suite without being read by the lock, RowVer or
 * audit assertions: each listed the verbs that existed when it was written. A guardrail keyed to
 * a list stops covering the codebase the moment someone adds to it, and it does so silently.
 */
const procsIn = (dir: string) =>
  readdirSync(dir).filter((f) => f.startsWith("usp_") && f.endsWith(".sql"));
const procsContaining = (dir: string, text: string) =>
  procsIn(dir).filter((f) => sql(join(dir, f)).includes(text));
/**
 * The procs that take a row version, read off the PARAMETER LIST alone — the slice from
 * CREATE OR ALTER PROCEDURE to its AS — so a header that discusses row versions cannot enrol a
 * proc that never takes one. That is the actual rule ("a proc that accepts a row version guards
 * it and throws 50002"), and it excludes every Create by construction rather than by omission.
 */
const procsTakingRowVer = (dir: string) =>
  procsIn(dir).filter((f) => {
    const src = sql(join(dir, f));
    return src
      .slice(src.indexOf("CREATE OR ALTER PROCEDURE"), src.indexOf("\nAS\n"))
      .includes("@RowVer");
  });

const boardProcs = procsIn(PROCS);
const boardTranWrites = procsContaining(PROCS, "BEGIN TRAN");
const boardRowLocks = procsContaining(PROCS, "FROM app.Board WITH (UPDLOCK, HOLDLOCK)");
const boardRowVerWrites = procsTakingRowVer(PROCS);

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
    // Derived from the folder rather than listed by verb: a hardcoded list stops covering the
    // next proc someone adds, and usp_Board_SetProject — the proc that actually changes
    // ProjectId — was added to this folder and passed a listed version of this test without
    // being read at all.
    expect(boardRowLocks).toEqual(
      expect.arrayContaining(["usp_Board_Update.sql", "usp_Board_Delete.sql"]),
    );
    for (const file of boardRowLocks) {
      const text = sql(join(PROCS, file));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("FROM app.Board WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, file).toBeGreaterThan(0);
      expect(lock, file).toBeGreaterThan(tran);
      expect(assert, file).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    expect(boardRowVerWrites).toEqual(
      expect.arrayContaining(["usp_Board_Update.sql", "usp_Board_Delete.sql"]),
    );
    for (const file of boardRowVerWrites) {
      const text = sql(join(PROCS, file));
      expect(text, file).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, file).toContain("THROW 50002");
    }
  });

  it("audits every write inside its own transaction", () => {
    expect(boardTranWrites).toEqual(
      expect.arrayContaining([
        "usp_Board_Create.sql",
        "usp_Board_Update.sql",
        "usp_Board_Delete.sql",
      ]),
    );
    for (const file of boardTranWrites) {
      const text = sql(join(PROCS, file));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, file).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, file).toBeLessThan(text.indexOf("COMMIT"));
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
const columnProcs = procsIn(PROCS_COLUMN);
const columnRowVerWrites = procsTakingRowVer(PROCS_COLUMN);

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
    expect(columnRowVerWrites).toEqual(
      expect.arrayContaining([
        "usp_BoardColumn_Update.sql",
        "usp_BoardColumn_Move.sql",
        "usp_BoardColumn_Delete.sql",
      ]),
    );
    for (const name of columnRowVerWrites) {
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
const cardProcs = procsIn(PROCS_CARD);
// This folder was the worst case of the listed-verb problem: lock, row version AND audit each read
// a list, so the next card proc — usp_BoardCard_Package, slice B5 — would have been covered by
// none of the three while the suite stayed green.
const cardLocks = procsContaining(PROCS_CARD, "WITH (UPDLOCK, HOLDLOCK)");
const cardAudits = procsContaining(PROCS_CARD, "INSERT INTO audit.AuditLog");
const cardRowVerWrites = procsTakingRowVer(PROCS_CARD);
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
    expect(cardLocks).toEqual(expect.arrayContaining(cardWrites));
    for (const name of cardLocks) {
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
    expect(cardRowVerWrites).toEqual(
      expect.arrayContaining([
        "usp_BoardCard_Update.sql",
        "usp_BoardCard_Move.sql",
        "usp_BoardCard_Delete.sql",
      ]),
    );
    for (const name of cardRowVerWrites) {
      const text = sql(join(PROCS_CARD, name));
      expect(text, name).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, name).toContain("THROW 50002");
    }
  });

  it("audits every card write inside its own transaction", () => {
    expect(cardAudits).toEqual(expect.arrayContaining(cardWrites));
    for (const name of cardAudits) {
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

const PROCS_PHASE = join("db", "procs", "board-phase");
const phaseProcs = procsIn(PROCS_PHASE);
const phaseRowVerWrites = procsTakingRowVer(PROCS_PHASE);

/**
 * Phases group sprints and carry no cards, so their procs are the plainest child-folder shape in
 * the module: reach the board rule through a run-time proc call, lock before asserting, guard the
 * phase's own RowVer (ADR-0038).
 */
describe("board phase SQL guardrails", () => {
  it("has the Create, Update, Move and Delete phase procs", () => {
    expect(phaseProcs.sort()).toEqual([
      "usp_BoardPhase_Create.sql",
      "usp_BoardPhase_Delete.sql",
      "usp_BoardPhase_Move.sql",
      "usp_BoardPhase_Update.sql",
    ]);
  });

  it("asserts access through the board, so a phase cannot define its own rule", () => {
    for (const name of phaseProcs) {
      expect(sql(join(PROCS_PHASE, name)), name).toContain("EXEC dbo.usp_Board_AssertAccess");
    }
  });

  it("locks the board row before asserting access, because a board can change project", () => {
    for (const name of phaseProcs) {
      const text = sql(join(PROCS_PHASE, name));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, name).toBeGreaterThan(0);
      expect(lock, name).toBeGreaterThan(tran);
      expect(assert, name).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    expect(phaseRowVerWrites).toEqual(
      expect.arrayContaining([
        "usp_BoardPhase_Update.sql",
        "usp_BoardPhase_Move.sql",
        "usp_BoardPhase_Delete.sql",
      ]),
    );
    for (const name of phaseRowVerWrites) {
      const text = sql(join(PROCS_PHASE, name));
      expect(text, name).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, name).toContain("THROW 50002");
    }
  });

  it("audits every phase write inside its own transaction", () => {
    for (const name of phaseProcs) {
      const text = sql(join(PROCS_PHASE, name));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, name).toBeLessThan(text.indexOf("COMMIT"));
    }
  });

  it("keeps every phase proc static SQL, so the EXECUTE-only login can run it (ADR-0033)", () => {
    for (const name of phaseProcs) {
      expect(sql(join(PROCS_PHASE, name)), name).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE AS/);
    }
  });

  it("takes no board from the caller: a phase never moves between boards", () => {
    for (const name of ["usp_BoardPhase_Update.sql", "usp_BoardPhase_Move.sql"]) {
      expect(sql(join(PROCS_PHASE, name)), name).not.toContain("@BoardId  ");
    }
  });

  /**
   * A soft delete leaves the row in place, so FK_BoardSprint_Phase (BoardId, BoardPhaseId) would
   * still resolve and a live sprint would read as grouped under a phase nobody can see. Releasing
   * the sprints under the same board lock is what makes the plan's race row true: "no live sprint
   * in a deleted phase".
   */
  it("releases a deleted phase's sprints before the phase goes, in the one transaction", () => {
    const text = sql(join(PROCS_PHASE, "usp_BoardPhase_Delete.sql"));
    const release = text.indexOf("UPDATE app.BoardSprint");
    const remove = text.indexOf("UPDATE app.BoardPhase");
    expect(release).toBeGreaterThan(0);
    expect(remove).toBeGreaterThan(release);
    expect(text.indexOf("COMMIT")).toBeGreaterThan(remove);
    expect(text).toContain("BoardPhaseId = NULL");
  });

  it("deletes a phase as a Manager verb, like every other delete in the module", () => {
    expect(sql(join(PROCS_PHASE, "usp_BoardPhase_Delete.sql"))).toContain(
      "@MinLevel = N'Manager', @Permission = N'boards:delete'",
    );
  });
});

const PROCS_SPRINT = join("db", "procs", "board-sprint");
const sprintProcs = procsIn(PROCS_SPRINT);
const sprintRowVerWrites = procsTakingRowVer(PROCS_SPRINT);

/**
 * A sprint's lifecycle moves planned -> active -> completed and never back, and each step is its
 * own intention because each carries work with it (ADR-0038). These tests hold that shape: the
 * state is not a field on an edit, the one-active rule is checked under the board lock with the
 * filtered unique index behind it, and a completed sprint is read-only.
 */
describe("board sprint SQL guardrails", () => {
  it("has the five sprint procs, the lifecycle steps among them", () => {
    expect(sprintProcs.sort()).toEqual([
      "usp_BoardSprint_Complete.sql",
      "usp_BoardSprint_Create.sql",
      "usp_BoardSprint_Delete.sql",
      "usp_BoardSprint_Start.sql",
      "usp_BoardSprint_Update.sql",
    ]);
  });

  it("asserts access through the board, so a sprint cannot define its own rule", () => {
    for (const name of sprintProcs) {
      expect(sql(join(PROCS_SPRINT, name)), name).toContain("EXEC dbo.usp_Board_AssertAccess");
    }
  });

  it("locks the board row before asserting access, because a board can change project", () => {
    for (const name of sprintProcs) {
      const text = sql(join(PROCS_SPRINT, name));
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
      const assert = text.indexOf("EXEC dbo.usp_Board_AssertAccess");
      expect(tran, name).toBeGreaterThan(0);
      expect(lock, name).toBeGreaterThan(tran);
      expect(assert, name).toBeGreaterThan(lock);
    }
  });

  it("refuses a write made against a row version someone else has moved on from", () => {
    expect(sprintRowVerWrites).toEqual(
      expect.arrayContaining([
        "usp_BoardSprint_Update.sql",
        "usp_BoardSprint_Start.sql",
        "usp_BoardSprint_Complete.sql",
        "usp_BoardSprint_Delete.sql",
      ]),
    );
    for (const name of sprintRowVerWrites) {
      const text = sql(join(PROCS_SPRINT, name));
      expect(text, name).toContain("CAST(RowVer AS BIGINT) = @RowVer");
      expect(text, name).toContain("THROW 50002");
    }
  });

  it("audits every sprint write inside its own transaction", () => {
    for (const name of sprintProcs) {
      const text = sql(join(PROCS_SPRINT, name));
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      expect(audit, name).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
      expect(audit, name).toBeLessThan(text.indexOf("COMMIT"));
    }
  });

  it("keeps every sprint proc static SQL, so the EXECUTE-only login can run it (ADR-0033)", () => {
    for (const name of sprintProcs) {
      expect(sql(join(PROCS_SPRINT, name)), name).not.toMatch(/sp_executesql|EXEC\s*\(|EXECUTE AS/);
    }
  });

  /**
   * The point of splitting Start and Complete out of Update: an edit must not be able to start or
   * finish a sprint as a side effect of renaming it. The state and both stamps are therefore
   * absent from the edit's parameter list, and this fails if any of them is ever added.
   */
  it("takes no state or stamp on an edit: the lifecycle is its own intention", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Update.sql"));
    const params = text.slice(text.indexOf("CREATE OR ALTER PROCEDURE"), text.indexOf("\nAS\n"));
    for (const forbidden of ["@State", "@StartedAtUtc", "@CompletedAtUtc"]) {
      expect(params, forbidden).not.toContain(forbidden);
    }
  });

  it("creates every sprint planned, so nothing is born already running", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Create.sql"));
    expect(text).toContain("'planned'");
    const params = text.slice(text.indexOf("CREATE OR ALTER PROCEDURE"), text.indexOf("\nAS\n"));
    expect(params).not.toContain("@State");
  });

  /**
   * The index is the backstop, not the check: under the board lock the proc always sees a
   * committed active sprint, so the plan's race row holds — "exactly 1 active; the rest 50007,
   * never 2601". 2601 maps to INTERNAL, which is the outcome this ordering avoids.
   */
  it("checks for a running sprint under the lock, before the unique index could fire", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Start.sql"));
    const lock = text.indexOf("WITH (UPDLOCK, HOLDLOCK)");
    const check = text.indexOf("[State] = 'active'");
    const write = text.indexOf("UPDATE app.BoardSprint");
    expect(check).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(check);
    expect(text).toContain("THROW 50007");
    expect(sql(MIGRATION)).toContain("UQ_BoardSprint_Active");
  });

  it("starts only a planned sprint, and says so apart from the already-running case", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Start.sql"));
    expect(text).toContain("Only a planned sprint can be started");
    expect(text).toContain("@State <> 'planned'");
  });

  /**
   * Starting or completing a sprint changes which cards every column counts, so a column can end
   * up over its limit. The plan is explicit that this is allowed and that the column then takes
   * nothing new — so neither proc may consult the work-in-progress check and refuse the
   * transition. A board whose sprint cannot be closed is worse than a column reading "6 / 5".
   */
  it("never blocks a lifecycle step on a work-in-progress limit", () => {
    for (const name of ["usp_BoardSprint_Start.sql", "usp_BoardSprint_Complete.sql"]) {
      // The call, not the name: both headers explain at length why they do not make this check.
      expect(sql(join(PROCS_SPRINT, name)), name).not.toContain("EXEC dbo.usp_Board_AssertRoom");
    }
  });

  it("keeps a completed sprint read-only, and refuses to delete it at all", () => {
    expect(sql(join(PROCS_SPRINT, "usp_BoardSprint_Update.sql"))).toContain("@State = 'completed'");
    const del = sql(join(PROCS_SPRINT, "usp_BoardSprint_Delete.sql"));
    expect(del).toContain("@State = 'active'");
    expect(del).toContain("@State = 'completed'");
  });

  /**
   * What makes the completed sprint an honest record: only cards in a done column stay in it, and
   * the state change commits in the same transaction as the moves.
   */
  it("moves the unfinished cards out before the sprint closes, in one transaction", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Complete.sql"));
    const move = text.indexOf("UPDATE c SET");
    const close = text.indexOf("UPDATE app.BoardSprint");
    expect(move).toBeGreaterThan(text.indexOf("BEGIN TRAN"));
    expect(close).toBeGreaterThan(move);
    expect(text.indexOf("COMMIT")).toBeGreaterThan(close);
    // Unfinished is decided by the column's category, and only those cards move.
    expect(text).toContain("col.Category <> 'done'");
    expect(text).toContain("col.Category = 'done'");
    // A card changes sprint, never column: the two axes stay independent. Asserted on the SET
    // list alone, because the statement joins app.BoardColumn to read the category.
    const setList = text.slice(move, text.indexOf("FROM app.BoardCard c", move));
    expect(setList).toContain("BoardSprintId = @UnfinishedToSprintId");
    expect(setList).not.toContain("BoardColumnId");
  });

  it("sends a deleted planned sprint's cards to the backlog, keeping their columns", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Delete.sql"));
    const backlog = text.indexOf("BoardSprintId = NULL");
    const remove = text.indexOf("UPDATE app.BoardSprint SET");
    expect(backlog).toBeGreaterThan(0);
    expect(remove).toBeGreaterThan(backlog);
    expect(text).not.toContain("BoardColumnId =");
  });

  it("runs the lifecycle as Contributor and deletes as Manager", () => {
    for (const name of ["usp_BoardSprint_Start.sql", "usp_BoardSprint_Complete.sql"]) {
      expect(sql(join(PROCS_SPRINT, name)), name).toContain(
        "@MinLevel = N'Contributor', @Permission = N'boards:update'",
      );
    }
    expect(sql(join(PROCS_SPRINT, "usp_BoardSprint_Delete.sql"))).toContain(
      "@MinLevel = N'Manager', @Permission = N'boards:delete'",
    );
  });

  it("takes unfinished cards only into a planned sprint of the same board", () => {
    const text = sql(join(PROCS_SPRINT, "usp_BoardSprint_Complete.sql"));
    expect(text).toContain("That sprint is not on this board");
    expect(text).toContain("[State] = 'planned'");
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

  /**
   * 50007 has exactly two throwers, and each has to be argued for. AssertRoom means "this column
   * is full"; usp_BoardSprint_Start means "another sprint of this board is already running". They
   * share the code because both are a limit of this board that the user can see and act on, and
   * the client picks the sentence from the intention invoked (messages.boards.columnFull against
   * messages.boards.sprintAlreadyActive).
   *
   * This list was widened from one entry to two deliberately when slice B3 landed Start — the
   * single-thrower assertion existed to force exactly that argument. A third thrower needs the
   * same one; a general refusal is 50004, not this.
   */
  it("has exactly the two registered throwers of LIMIT_REACHED", () => {
    expect(assertRoom).toContain("THROW 50007");
    const files = [PROCS, PROCS_CARD, PROCS_COLUMN, PROCS_PHASE, PROCS_SPRINT]
      .flatMap((dir) =>
        readdirSync(dir)
          .filter((f) => f.endsWith(".sql"))
          .map((f) => [dir, f] as const),
      )
      .filter(([dir, f]) => sql(join(dir, f)).includes("THROW 50007"))
      .map(([, f]) => f)
      .sort();
    expect(files).toEqual(["usp_BoardSprint_Start.sql", "usp_Board_AssertRoom.sql"]);
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

/**
 * Linking a board to a project (ADR-0038 decisions 23 and 24). The whole point of the proc is that
 * it answers to two projects at once, so each half of that is pinned here: the access pair in
 * src/tests/proc-access-levels.test.ts CROSS_SCOPE, the SQL shape below.
 */
describe("board project linking guardrails", () => {
  const setProject = sql(join(PROCS, "usp_Board_SetProject.sql"));
  const params = setProject.slice(
    setProject.indexOf("CREATE OR ALTER PROCEDURE"),
    setProject.indexOf("AS\nBEGIN"),
  );

  it("asks the board for a delete and the target project for a create, in that order", () => {
    const board = setProject.indexOf("EXEC dbo.usp_Board_AssertAccess");
    const project = setProject.indexOf("EXEC dbo.usp_Project_AssertAccess");
    expect(board).toBeGreaterThan(0);
    expect(project).toBeGreaterThan(board);
    // Unlinking asks no project for permission, so the project-side check must allow a NULL id;
    // without this the board-side Manager could never move a board out to standalone.
    expect(setProject).toContain("@AllowProjectless = 1");
  });

  it("changes project only through its own intention, never as a field on an edit", () => {
    const update = sql(join(PROCS, "usp_Board_Update.sql"));
    const updateParams = update.slice(
      update.indexOf("CREATE OR ALTER PROCEDURE"),
      update.indexOf("AS\nBEGIN"),
    );
    expect(updateParams).not.toContain("@ProjectId");
    expect(params).toContain("@ProjectId");
  });

  it("refuses a foreign requirement as a precondition, not as a limit", () => {
    // 50007 means a limit the user can see and plan around, and it has exactly two throwers
    // (usp_Board_AssertRoom and usp_BoardSprint_Start). A board holding another project's
    // requirements is a precondition the user can clear, so it is 50004 VALIDATION. A third
    // 50007 thrower would have to argue its case in the test above that enumerates them.
    // On the THROW statements, not the file: this proc's own header explains why it is not 50007,
    // and a well-documented proc contains every number its guardrail forbids (LESSONS §38).
    const thrown = [...setProject.matchAll(/THROW\s+(\d+)/g)].map(([, code]) => code);
    expect(thrown).toContain("50004");
    expect(thrown).not.toContain("50007");
    // Nor is it the work-in-progress rule's business: moving a board moves no card between columns.
    expect(setProject).not.toContain("EXEC dbo.usp_Board_AssertRoom");
  });

  it("compares each requirement with the project the board is moving to", () => {
    // Against @ProjectId, the target — not the board's current project, which is what the row
    // still holds at this point in the transaction.
    expect(setProject).toMatch(/JOIN app\.Requirement r ON r\.RequirementId = c\.RequirementId/);
    expect(setProject).toMatch(/r\.ProjectId <> @ProjectId/);
    expect(setProject).toContain("c.IsDeleted = 0");
  });

  it("takes no cards when a board is unlinked, because standalone boards may mix projects", () => {
    // The read procs redact a requirement the reader cannot reach (decision 14), which is what
    // makes a mixed standalone board legitimate. So the scan runs only for a project target.
    const guard = setProject.indexOf("IF @ProjectId IS NOT NULL");
    const scan = setProject.indexOf("INSERT INTO @Foreign");
    expect(guard).toBeGreaterThan(0);
    expect(scan).toBeGreaterThan(guard);
  });

  it("removes a card only on the caller's say-so, and audits each one it removes", () => {
    expect(params).toContain("@RemoveForeignCards BIT = 0");
    expect(setProject).toMatch(/@RemovedCards > 0 AND @RemoveForeignCards = 0/);
    const audit = setProject.indexOf("N'Delete', N'app.BoardCard'");
    expect(audit).toBeGreaterThan(setProject.indexOf("BEGIN TRAN"));
    expect(audit).toBeLessThan(setProject.indexOf("COMMIT"));
    // The snapshot is captured before the update, so BeforeJson is the card as it stood.
    expect(setProject.indexOf("INSERT INTO @Foreign")).toBeLessThan(
      setProject.indexOf("UPDATE app.BoardCard"),
    );
  });

  it("reports how many cards the move cost", () => {
    expect(setProject).toContain("@RemovedCards AS RemovedCards");
  });
});
