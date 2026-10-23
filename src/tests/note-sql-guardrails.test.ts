import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTE_PAGES_MAX, NOTE_REORDER_MAX } from "@/modules/notes/schemas/note";

const FOLDERS = ["note", "note-tab"];

const PROCS = new Map(
  FOLDERS.flatMap((folder) =>
    readdirSync(join("db/procs", folder))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => [f.replace(/\.sql$/, ""), readFileSync(join("db/procs", folder, f), "utf8")]),
  ),
);

function sql(name: string): string {
  const text = PROCS.get(name);
  if (!text) throw new Error(`missing proc ${name}`);
  return text;
}

function afterBeginTran(name: string, needle: string | RegExp): boolean {
  const text = sql(name);
  const tran = text.indexOf("BEGIN TRAN");
  if (tran < 0) return false;
  const rest = text.slice(tran);
  return typeof needle === "string" ? rest.includes(needle) : needle.test(rest);
}

const NOTE_LOCK = /FROM app\.Note\b[^;]*WITH \(UPDLOCK, HOLDLOCK\)/;

describe("note SQL guardrails", () => {
  it("finds every note proc", () => {
    expect([...PROCS.keys()].sort()).toEqual(
      [
        "usp_Note_Create",
        "usp_Note_Delete",
        "usp_Note_GetById",
        "usp_Note_GetWithTabs",
        "usp_Note_List",
        "usp_Note_Update",
        "usp_NoteTab_Create",
        "usp_NoteTab_Delete",
        "usp_NoteTab_GetById",
        "usp_NoteTab_List",
        "usp_NoteTab_Reorder",
        "usp_NoteTab_Update",
      ].sort(),
    );
  });

  it("asserts project access in every proc", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).toContain("dbo.usp_Project_AssertAccess");
    }
  });

  it("lets every proc reach the project-less shared space (migration 038)", () => {
    for (const [name, text] of PROCS) {
      if (name === "usp_Note_List") continue;
      const assert = text.match(/EXEC dbo\.usp_Project_AssertAccess[^;]*;/)?.[0] ?? "";
      expect(assert, name).toMatch(/@AllowProjectless\s*=\s*1/);
    }
    const list = sql("usp_Note_List");
    expect(list).toMatch(/ufn_AccessLevel_Resolve\(@ActorRole, @ActorUserId, n\.ProjectId, 1\)/);
    expect(list).toContain("AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)");
    expect(list).toContain("AND (@WithoutProject = 0 OR n.ProjectId IS NULL)");
    const migration = readFileSync("db/migrations/038_note_projectless.sql", "utf8");
    expect(migration).toMatch(/ALTER TABLE app\.Note ALTER COLUMN \[ProjectId\] INT NULL/);
    expect(migration).toContain("FOREIGN KEY ([ProjectId]) REFERENCES app.Project(ProjectId)");
  });

  // With @AllowProjectless = 1 a NULL project resolves to the shared space, so a project
  // notebook must never reach a check with NULL: the id comes from the live note row, a missing
  // row stops the proc, and nothing clears Note.ProjectId after create.
  it("checks the project of the live note row, so a project notebook never fails open", () => {
    for (const [name, text] of PROCS) {
      const asserts = text.match(/EXEC dbo\.usp_Project_AssertAccess[^;]*;/g) ?? [];
      expect(asserts, name).toHaveLength(1);
      if (name === "usp_Note_Create" || name === "usp_Note_List") {
        expect(asserts[0], name).toMatch(/@ProjectId = @ProjectId\b/);
        continue;
      }
      expect(asserts[0], name).toMatch(/@ProjectId = @RowProjectId\b/);
      const read =
        /SELECT @RowProjectId = (?:n\.)?ProjectId\b[^;]*;\s*IF @@ROWCOUNT = 0\s+THROW 50001/.exec(
          text,
        );
      expect(read, name).not.toBeNull();
      const statement = read![0].slice(0, read![0].indexOf(";") + 1).replace(/\s+/g, " ");
      const fromNote = / FROM app\.Note WHERE NoteId = @NoteId AND IsDeleted = 0;$/;
      const fromPage =
        / FROM app\.NoteTab AS t JOIN app\.Note AS n ON n\.NoteId = t\.NoteId AND n\.IsDeleted = 0 WHERE t\.NoteTabId = @NoteTabId AND t\.IsDeleted = 0;$/;
      expect(fromNote.test(statement) || fromPage.test(statement), `${name}: ${statement}`).toBe(
        true,
      );
      expect(read!.index, name).toBeLessThan(text.indexOf("EXEC dbo.usp_Project_AssertAccess"));
    }
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/UPDATE app\.Note\b(?:(?!;)[\s\S])*\[?ProjectId\]?\s*=/);
    }
    const migration = readFileSync("db/migrations/038_note_projectless.sql", "utf8");
    expect(migration).not.toMatch(/\bON\s+(?:DELETE|UPDATE)\b/i);
  });

  it("reads need Viewer, writes Contributor with their permission, deletes Manager", () => {
    for (const name of [
      "usp_Note_GetById",
      "usp_Note_GetWithTabs",
      "usp_Note_List",
      "usp_NoteTab_GetById",
      "usp_NoteTab_List",
    ]) {
      expect(sql(name), name).toMatch(/@MinLevel\s*=\s*N'Viewer'/);
    }
    for (const name of [
      "usp_Note_Create",
      "usp_Note_Update",
      "usp_NoteTab_Create",
      "usp_NoteTab_Update",
      "usp_NoteTab_Reorder",
    ]) {
      const text = sql(name);
      expect(text, name).toMatch(/@MinLevel\s*=\s*N'Contributor'/);
      expect(text, name).toMatch(/@Permission\s*=\s*N'notes:(create|update)'/);
    }
    for (const name of ["usp_Note_Delete", "usp_NoteTab_Delete"]) {
      const text = sql(name);
      expect(text, name).toMatch(/@MinLevel\s*=\s*N'Manager'/);
      expect(text, name).toContain("@Permission = N'notes:delete'");
    }
  });

  it("names the permission that matches the verb", () => {
    for (const name of ["usp_Note_Create", "usp_NoteTab_Create"]) {
      expect(sql(name), name).toContain("@Permission = N'notes:create'");
    }
    for (const name of ["usp_Note_Update", "usp_NoteTab_Update", "usp_NoteTab_Reorder"]) {
      expect(sql(name), name).toContain("@Permission = N'notes:update'");
    }
  });

  it("resolves a page's project through its parent note", () => {
    for (const name of [
      "usp_NoteTab_Create",
      "usp_NoteTab_GetById",
      "usp_NoteTab_Update",
      "usp_NoteTab_Delete",
      "usp_NoteTab_Reorder",
    ]) {
      expect(sql(name), name).toMatch(/\b(FROM|JOIN) app\.Note\b/);
    }
  });

  it("soft-deletes a note's pages with the note", () => {
    const text = sql("usp_Note_Delete");
    expect(
      afterBeginTran("usp_Note_Delete", /UPDATE app\.NoteTab\b[\s\S]*?IsDeleted\s*=\s*1/),
    ).toBe(true);
    expect(text).toMatch(/UPDATE app\.Note\b[\s\S]*?IsDeleted\s*=\s*1/);
  });

  it("checks RowVer inside the transaction on every note and page update and delete", () => {
    for (const name of [
      "usp_Note_Update",
      "usp_Note_Delete",
      "usp_NoteTab_Update",
      "usp_NoteTab_Delete",
    ]) {
      expect(afterBeginTran(name, "AND CAST(RowVer AS BIGINT) = @RowVer"), name).toBe(true);
    }
  });

  it("searches titles and plain page text, never raw content, escaping LIKE wildcards", () => {
    const list = sql("usp_Note_List");
    expect(list).toContain("SearchText");
    expect(list).not.toMatch(/\[?Content\]?\s+LIKE/i);
    expect(list).toContain(
      "REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_'), N'[', N'\\[')",
    );
    const likes = list.match(/LIKE N'%'[^\n]*/g) ?? [];
    expect(likes.length).toBeGreaterThanOrEqual(2);
    for (const like of likes) expect(like).toContain("ESCAPE N'\\'");
    const pages = sql("usp_NoteTab_List");
    expect(pages).not.toMatch(/\[?Content\]?\s+LIKE/i);
  });

  it("locks the note row before reordering and validates the order JSON", () => {
    const text = sql("usp_NoteTab_Reorder");
    const tran = text.indexOf("BEGIN TRAN");
    const lock = text.search(NOTE_LOCK);
    expect(tran).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(tran);
    expect(text).toContain("@OrderJson");
    expect(text).toContain("ISJSON(@OrderJson)");
    expect(text).toContain("OPENJSON(@OrderJson)");
    expect(text).toContain("TRY_CAST(");
    expect(text).toMatch(new RegExp(`> ${NOTE_REORDER_MAX}\\b`));
    expect(text).toMatch(/THROW 50004, N'VALIDATION:/);
  });

  it("caps a notebook at the pages a reorder can name, counted under the note lock", () => {
    expect(NOTE_REORDER_MAX).toBe(NOTE_PAGES_MAX);
    expect(
      afterBeginTran(
        "usp_NoteTab_Create",
        new RegExp(
          `WITH \\(UPDLOCK, HOLDLOCK\\)[\\s\\S]*COUNT\\(\\*\\) FROM app\\.NoteTab[^\\n]*>= ${NOTE_PAGES_MAX}\\b`,
        ),
      ),
    ).toBe(true);
    expect(sql("usp_NoteTab_Create")).toContain(
      "THROW 50004, N'VALIDATION:A notebook holds at most",
    );
  });

  it("locks the note before adding or removing one of its pages", () => {
    for (const name of ["usp_NoteTab_Create", "usp_NoteTab_Delete"]) {
      expect(afterBeginTran(name, NOTE_LOCK), name).toBe(true);
    }
  });

  it("builds no SQL from strings", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/sp_executesql|EXEC(UTE)?\s*\(/i);
    }
  });

  it("returns the workspace's pages as JSON with null keys kept", () => {
    expect(sql("usp_Note_GetWithTabs")).toContain(
      "FOR JSON PATH, INCLUDE_NULL_VALUES) AS TabsJson",
    );
  });

  it("adds the page search column in migration 026", () => {
    const migration = readFileSync("db/migrations/026_note_pages.sql", "utf8").replace(/\s+/g, " ");
    expect(migration).toMatch(/SearchText/);
    expect(migration).toMatch(/app\.NoteTab/);
  });
});
