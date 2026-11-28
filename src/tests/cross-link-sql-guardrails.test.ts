import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stripComments = (sql: string) =>
  sql
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "");

const DIR = "db/procs/cross-link";
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

describe("cross-link SQL guardrails (ADR-0074)", () => {
  it("contains all expected cross-link database objects", () => {
    expect([...PROCS.keys()].sort()).toEqual([
      "ufn_CrossLink_ResolveEndpoint",
      "usp_CrossLink_AssertAccess",
      "usp_CrossLink_Create",
      "usp_CrossLink_Delete",
      "usp_CrossLink_GetById",
      "usp_CrossLink_ListForLocation",
      "usp_CrossLink_Update",
    ]);
  });

  it("never builds dynamic SQL", () => {
    for (const [name, text] of PROCS) {
      expect(text, name).not.toMatch(/sp_executesql|\bEXEC(UTE)?\s*\(/i);
    }
  });

  it("keeps links personal to their creator and enforces ADR-0040 50001 non-disclosure", () => {
    const assertProc = sql("usp_CrossLink_AssertAccess");
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
    expect(assertProc).toMatch(/THROW\s+50001,\s*N'NOT_FOUND:Cross-link target not found'/);
    expect(assertProc).toContain("dbo.usp_Permission_Require");
  });

  it("resolves live projects, IsDeleted = 0, and entity-specific rules in ufn_CrossLink_ResolveEndpoint", () => {
    const fn = sql("ufn_CrossLink_ResolveEndpoint");
    expect(fn).toContain("dbo.ufn_TodoItem_AccessLevel");
    expect(fn).toContain("dbo.ufn_Board_AccessLevel");
    expect(fn).toContain("dbo.ufn_AccessLevel_Resolve");
    expect(fn).not.toContain("IsArchived");
    expect(fn).toContain("p.IsDeleted = 0");
  });

  it("filters ListForLocation across both live ends with TOP (200) and zero existence leak", () => {
    const list = sql("usp_CrossLink_ListForLocation");
    expect(list).toMatch(
      /EXEC\s+dbo\.usp_User_GetActorRole\s+@UserId\s*=\s*@ActorUserId\s*,\s*@Role\s*=\s*@ActorRole\s+OUTPUT/,
    );
    expect(list).toContain("SELECT TOP (200)");
    expect(list).toContain("cl.CreatedBy = @ActorUserId");
    expect(list).toContain("resA.AccessLevel IS NOT NULL");
    expect(list).toContain("resB.AccessLevel IS NOT NULL");
  });

  it("enforces ordered sp_getapplock caps (25 / 500), RowVer, and AuditLog on writes", () => {
    const create = sql("usp_CrossLink_Create");
    expect(create).toContain("sp_getapplock");
    expect(create).toMatch(/@CountEndA\s*>=\s*25/);
    expect(create).toMatch(/@CountEndB\s*>=\s*25/);
    expect(create).toMatch(/@CountProjA\s*>=\s*500/);
    expect(create).toMatch(/@CountProjB\s*>=\s*500/);
    expect(create).toContain("THROW 50007");
    expect(create).toContain("INSERT INTO audit.AuditLog");

    const del = sql("usp_CrossLink_Delete");
    expect(del).not.toMatch(/@MinLevel\s*=\s*N'(Contributor|Manager)'/);
    expect(del.match(/@AllowOrphan\s*=\s*1/g)).toHaveLength(2);
    expect(del.match(/@CreatedBy\s*=\s*@CreatedBy/g)).toHaveLength(2);

    for (const name of ["usp_CrossLink_Update", "usp_CrossLink_Delete"]) {
      const text = sql(name);
      const tran = text.indexOf("BEGIN TRAN");
      const lock = text.search(/FROM app\.CrossLink\s+WITH\s*\(UPDLOCK,\s*HOLDLOCK\)/);
      const firstAssert = text.indexOf("EXEC dbo.usp_CrossLink_AssertAccess");
      const rowVerCheck = text.indexOf("@CurrentVer <> @RowVer");
      const audit = text.indexOf("INSERT INTO audit.AuditLog");
      const commit = text.lastIndexOf("COMMIT;");
      expect(tran, name).toBeGreaterThan(-1);
      expect(lock, name).toBeGreaterThan(tran);
      expect(firstAssert, name).toBeGreaterThan(lock);
      // AssertAccess must run before RowVer check so non-members cannot probe RowVer existence.
      expect(rowVerCheck, name).toBeGreaterThan(firstAssert);
      expect(text, name).toContain("AND CAST(RowVer AS BIGINT) = @RowVer");
      expect(audit, name).toBeGreaterThan(rowVerCheck);
      expect(audit, name).toBeLessThan(commit);
    }
  });
});
