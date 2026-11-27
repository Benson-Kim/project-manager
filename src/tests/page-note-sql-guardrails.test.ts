import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stripComments = (sql: string) =>
  sql
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "");

const DIR = "db/procs/page-note";
const PROCS = new Map(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f.replace(/\.sql$/, ""), stripComments(readFileSync(join(DIR, f), "utf8"))]),
);

const sql = (name: string) => {
  const s = PROCS.get(name);
  if (!s) throw new Error(`missing ${name}`);
  return s;
};

describe("page-note SQL guardrails (ADR-0074)", () => {
  it("contains all expected page-note procs", () => {
    expect([...PROCS.keys()].sort()).toEqual([
      "usp_PageNote_AssertAccess",
      "usp_PageNote_Create",
      "usp_PageNote_Delete",
      "usp_PageNote_GetById",
      "usp_PageNote_ListForLocation",
      "usp_PageNote_Update",
    ]);
  });

  it("never builds dynamic SQL", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/sp_executesql|\bEXEC(UTE)?\s*\(/i);
    }
  });

  it("resolves live endpoints, enforces ADR-0040 50001 and keeps every note personal", () => {
    const assertProc = sql("usp_PageNote_AssertAccess");
    expect(assertProc).toMatch(
      /EXEC\s+dbo\.usp_User_GetActorRole\s+@UserId\s*=\s*@ActorUserId\s*,\s*@Role\s*=\s*@ActorRole\s+OUTPUT/,
    );
    expect(assertProc).toContain("dbo.ufn_CrossLink_ResolveEndpoint");
    const creatorCheck = assertProc.search(
      /IF\s+@CreatedBy\s+IS\s+NOT\s+NULL\s+AND\s+@CreatedBy\s*<>\s*@ActorUserId\s+THROW\s+50001\b/i,
    );
    expect(creatorCheck).toBeGreaterThan(-1);
    expect(creatorCheck).toBeLessThan(assertProc.indexOf("FROM dbo.ufn_CrossLink_ResolveEndpoint"));
    expect(assertProc).toMatch(/IF\s+@Found\s*=\s*0\s+OR\s+@Level\s+IS\s+NULL\s+BEGIN\b/i);
    expect(assertProc).toMatch(
      /IF\s+@AllowOrphan\s*=\s*1\s+AND\s+@CreatedBy\s*=\s*@ActorUserId\s+AND\s+NOT\s+EXISTS/i,
    );
    expect(assertProc).toMatch(/THROW\s+50001,\s*N'NOT_FOUND:Page note target not found'/);
    expect(assertProc).toContain("dbo.usp_Permission_Require");
  });

  it("caps ListForLocation at TOP (200) and lists only the actor's own notes", () => {
    const list = sql("usp_PageNote_ListForLocation");
    expect(list).toContain("SELECT TOP (200)");
    expect(list).toContain("dbo.ufn_CrossLink_ResolveEndpoint");
    expect(list).toContain("pn.CreatedBy = @ActorUserId");
    expect(list).toContain("res.AccessLevel IS NOT NULL");
  });

  it("enforces sp_getapplock caps (20 / 500), RowVer, and AuditLog on writes", () => {
    const create = sql("usp_PageNote_Create");
    expect(create).toContain("sp_getapplock");
    expect(create).toMatch(/@LocCount\s*>=\s*20/);
    expect(create).toMatch(/@ProjCount\s*>=\s*500/);
    expect(create).not.toMatch(/IF\s+@LiveProjectId\s+IS\s+NOT\s+NULL/);
    expect(create).toContain("Your personal pages have reached the page note limit");
    expect(create).toContain("THROW 50007");
    expect(create).toContain("INSERT INTO audit.AuditLog");

    const del = sql("usp_PageNote_Delete");
    expect(del).toMatch(/@MinLevel\s*=\s*N'Viewer'/);
    expect(del).toMatch(/@AllowOrphan\s*=\s*1/);
    expect(del).toMatch(/@CreatedBy\s*=\s*@CreatedBy/);

    for (const name of ["usp_PageNote_Update", "usp_PageNote_Delete"]) {
      const text = sql(name);
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.search(/FROM app\.PageNote\s+WITH\s*\(UPDLOCK,\s*HOLDLOCK\)/);
      const assertCall = text.indexOf("EXEC dbo.usp_PageNote_AssertAccess");
      const rowVerCheck = text.indexOf("@CurrentVer <> @RowVer");
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      const commit = text.lastIndexOf("COMMIT;");
      expect(tran, name).toBeGreaterThan(-1);
      expect(lock, name).toBeGreaterThan(tran);
      expect(assertCall, name).toBeGreaterThan(lock);
      expect(rowVerCheck, name).toBeGreaterThan(assertCall);
      expect(text, name).toContain("AND CAST(RowVer AS BIGINT) = @RowVer");
      expect(audit, name).toBeGreaterThan(rowVerCheck);
      expect(audit, name).toBeLessThan(commit);
    }
  });

  it("keeps the anchor-key hyphen first in the LIKE class so it is not read as a range", () => {
    const sources = [
      "db/procs/cross-link/usp_CrossLink_Create.sql",
      "db/procs/page-note/usp_PageNote_Create.sql",
      "db/migrations/097_cross_links_and_page_notes.sql",
    ];
    for (const path of sources) {
      const text = readFileSync(join(process.cwd(), path), "utf8");
      expect(text, path).toContain("[^-a-z0-9:_]");
      expect(text, path).not.toContain("_-]");
    }
  });
});
