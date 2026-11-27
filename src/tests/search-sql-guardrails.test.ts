import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stripComments = (sql: string) =>
  sql
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "");

const globalProc = stripComments(readFileSync("db/procs/search/usp_Search_Global.sql", "utf8"));
const stakeholderList = stripComments(
  readFileSync("db/procs/stakeholder/usp_Stakeholder_List.sql", "utf8"),
);
const supplierList = stripComments(readFileSync("db/procs/supplier/usp_Supplier_List.sql", "utf8"));

describe("global search SQL guardrails (ADR-0073)", () => {
  it("resolves actor role from auth.User before checking inputs or touching project tables", () => {
    const actorCall = globalProc.search(
      /EXEC\s+dbo\.usp_User_GetActorRole\s+@UserId\s*=\s*@ActorUserId\s*,\s*@Role\s*=\s*@ActorRole\s+OUTPUT/,
    );
    const searchCheck = globalProc.search(/LEN\(@Search\)\s*<\s*2/);
    const firstQuery = globalProc.search(/\bFROM\s+app\./);
    expect(actorCall).toBeGreaterThan(-1);
    expect(searchCheck).toBeGreaterThan(actorCall);
    expect(firstQuery).toBeGreaterThan(searchCheck);
  });

  it("enforces minimum 2-char @Search and escapes wildcards into @Escaped NVARCHAR(200)", () => {
    expect(globalProc).toMatch(/LEN\(@Search\)\s*<\s*2\s+THROW\s+50004\b/s);
    expect(globalProc).toContain("DECLARE @Escaped NVARCHAR(200) =");
    expect(globalProc).toContain(
      "REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\\', N'\\\\'), N'%', N'\\%'), N'_', N'\\_'), N'[', N'\\[')",
    );
    const likeLines = globalProc.match(/^.*\bLIKE\b[^\n]*$/gm) ?? [];
    expect(likeLines.length).toBeGreaterThanOrEqual(15);
    for (const line of likeLines) {
      expect(line).toContain("@Escaped");
      expect(line).toContain("ESCAPE N'\\'");
    }
  });

  it("clamps @TopPerKind, uses TOP (@TopPerKind) per branch, and has zero dynamic SQL", () => {
    expect(globalProc).toMatch(/WHEN\s+@TopPerKind\s*>\s*50\s+THEN\s+50/);
    const topMatches = globalProc.match(/SELECT\s+TOP\s+\(@TopPerKind\)/g) ?? [];
    expect(topMatches).toHaveLength(3);
    expect(globalProc).not.toMatch(/sp_executesql|\bEXEC(UTE)?\s*\(/i);
  });

  it("validates @Kinds against the closed allowlist and rejects empty/unknown tokens", () => {
    expect(globalProc).toContain("STRING_SPLIT(@Kinds, N',')");
    expect(globalProc).toContain("WHERE Kind NOT IN (N'keyword', N'stakeholder', N'supplier')");
    expect(globalProc).toMatch(/THROW\s+50004,\s*N'VALIDATION:/);
  });

  it("enforces access control and p.IsDeleted = 0 on every UNION ALL branch", () => {
    // Keyword branch: LEFT JOIN app.Project + AllowProjectless = 1 + (ProjectId IS NULL OR p.IsDeleted = 0)
    expect(globalProc).toMatch(
      /FROM\s+app\.Keyword\s+AS\s+k\s+LEFT\s+JOIN\s+app\.Project\s+AS\s+p\s+ON\s+p\.ProjectId\s*=\s*k\.ProjectId\s+CROSS\s+APPLY\s+dbo\.ufn_AccessLevel_Resolve\(@ActorRole,\s*@ActorUserId,\s*k\.ProjectId,\s*1\)/,
    );
    expect(globalProc).toMatch(
      /WHERE\s+@IncludeKeyword\s*=\s*1\s+AND\s+k\.IsDeleted\s*=\s*0\s+AND\s+\(k\.ProjectId\s+IS\s+NULL\s+OR\s+p\.IsDeleted\s*=\s*0\)\s+AND\s+acc\.AccessLevel\s+IS\s+NOT\s+NULL/,
    );

    // Stakeholder branch: INNER JOIN app.Project with p.IsDeleted = 0 + AllowProjectless = 0
    expect(globalProc).toMatch(
      /FROM\s+app\.Stakeholder\s+AS\s+s\s+INNER\s+JOIN\s+app\.Project\s+AS\s+p\s+ON\s+p\.ProjectId\s*=\s*s\.ProjectId\s+AND\s+p\.IsDeleted\s*=\s*0\s+CROSS\s+APPLY\s+dbo\.ufn_AccessLevel_Resolve\(@ActorRole,\s*@ActorUserId,\s*p\.ProjectId,\s*0\)/,
    );
    expect(globalProc).toMatch(
      /WHERE\s+@IncludeStakeholder\s*=\s*1\s+AND\s+s\.IsDeleted\s*=\s*0\s+AND\s+acc\.AccessLevel\s+IS\s+NOT\s+NULL/,
    );

    // Supplier branch: INNER JOIN app.Project with p.IsDeleted = 0 + AllowProjectless = 0
    expect(globalProc).toMatch(
      /FROM\s+app\.Supplier\s+AS\s+sp\s+INNER\s+JOIN\s+app\.Project\s+AS\s+p\s+ON\s+p\.ProjectId\s*=\s*sp\.ProjectId\s+AND\s+p\.IsDeleted\s*=\s*0\s+CROSS\s+APPLY\s+dbo\.ufn_AccessLevel_Resolve\(@ActorRole,\s*@ActorUserId,\s*p\.ProjectId,\s*0\)/,
    );
    expect(globalProc).toMatch(
      /WHERE\s+@IncludeSupplier\s*=\s*1\s+AND\s+sp\.IsDeleted\s*=\s*0\s+AND\s+acc\.AccessLevel\s+IS\s+NOT\s+NULL/,
    );
  });

  it("keeps widened searchable columns in lockstep with usp_Stakeholder_List and usp_Supplier_List", () => {
    for (const col of [
      "[FirstName]",
      "[LastName]",
      "[ProjectRole]",
      "[DepartmentOrganization]",
      "[EmailAddress]",
    ]) {
      expect(globalProc).toContain(col);
      expect(stakeholderList).toContain(`${col} LIKE N'%' + @Escaped + N'%' ESCAPE N'\\'`);
    }
    expect(stakeholderList).toMatch(
      /CONCAT\(\[FirstName\],\s*CASE\s+WHEN\s+\[LastName\]\s+IS\s+NOT\s+NULL\s+AND\s+\[LastName\]\s*<>\s*N''\s+THEN\s+N' '\s*\+\s*\[LastName\]\s+ELSE\s+N''\s+END\)\s+LIKE\s+N'%'\s*\+\s*@Escaped\s*\+\s*N'%'\s+ESCAPE\s+N'\\'/,
    );

    for (const col of ["[SupplierName]", "[ContactPerson]", "[EmailAddress]", "[City]"]) {
      expect(globalProc).toContain(col);
      expect(supplierList).toContain(`s.${col} LIKE N'%' + @Escaped + N'%' ESCAPE N'\\'`);
    }
  });
});
