import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: the audit log is read by Admins only, and only read. Both audit procs check the
 * actor's role themselves, GetById before it looks the id up, no proc edits or removes an audit
 * row, and no JSON a proc builds (which is what lands in BeforeJson and AfterJson) carries a
 * password hash. This reads db/procs and fails when one of those slips.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith(".sql") ? [p] : [];
  });
}

/** Proc text without comments or string literals, so neither can hide or fake a match. */
function code(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/N?'(?:[^']|'')*'/g, "''");
}

const procs = walk(join("db", "procs")).map((path) => ({
  path,
  sql: code(readFileSync(path, "utf8")),
}));
const auditProc = (name: string) =>
  readFileSync(join("db", "procs", "audit", `${name}.sql`), "utf8");

const ADMIN_CHECK = /usp_User_GetActorRole[\s\S]*?IF @ActorRole <> N'Admin'\s+THROW 50003/;

/**
 * Each FOR JSON query, from its own SELECT to the FOR JSON clause, nested subqueries included:
 * walking back from FOR JSON, the first SELECT outside any parentheses is the one it belongs to.
 */
function forJsonQueries(sql: string): string[] {
  const queries: string[] = [];
  for (const match of sql.matchAll(/\bFOR\s+JSON\b/gi)) {
    let depth = 0;
    for (let i = match.index - 1; i >= 0; i--) {
      const ch = sql[i];
      if (ch === ")") depth++;
      else if (ch === "(") {
        if (depth === 0) break;
        depth--;
      } else if (
        depth === 0 &&
        /^SELECT\b/i.test(sql.slice(i, i + 7)) &&
        !/\w/.test(sql[i - 1] ?? "")
      ) {
        queries.push(sql.slice(i, match.index));
        break;
      }
    }
  }
  return queries;
}

describe("audit procs check the actor's role themselves", () => {
  it.each(["usp_Audit_List", "usp_Audit_GetById"])("%s refuses anyone but an Admin", (name) => {
    expect(auditProc(name)).toMatch(ADMIN_CHECK);
  });

  it("usp_Audit_GetById checks the role before it looks the id up, so an id tells a User nothing", () => {
    const source = auditProc("usp_Audit_GetById");
    const check = source.search(/IF @ActorRole <> N'Admin'/);
    const lookup = source.search(/IF NOT EXISTS \(SELECT 1 FROM audit\.AuditLog/);
    const notFound = source.search(/THROW 50001, N'NOT_FOUND/);
    expect(check).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(check);
    expect(notFound).toBeGreaterThan(check);
  });
});

describe("audit rows are append-only", () => {
  const TABLE = String.raw`\[?audit\]?\.\[?AuditLog\b\]?`;
  const DIRECT = new RegExp(
    String.raw`\b(?:UPDATE|DELETE(?:\s+FROM)?|TRUNCATE\s+TABLE|MERGE(?:\s+INTO)?)\s+` + TABLE,
    "i",
  );
  // UPDATE a SET ... FROM audit.AuditLog a, and DELETE a FROM audit.AuditLog a.
  const ALIASED = new RegExp(
    String.raw`\b(?:UPDATE|DELETE)\s+\w+\s+(?:SET\b[^;]{0,400}?)?FROM\s+` + TABLE,
    "i",
  );
  const WRITES = [DIRECT, ALIASED];

  it("finds the procs it reads", () => {
    expect(procs.length).toBeGreaterThan(100);
  });

  it("no proc updates, deletes or truncates audit.AuditLog", () => {
    const offenders = procs
      .filter(({ sql }) => WRITES.some((write) => write.test(sql)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("catches both forms of a write", () => {
    expect(DIRECT.test("DELETE FROM audit.AuditLog WHERE 1 = 1")).toBe(true);
    expect(DIRECT.test("UPDATE audit.AuditLog SET Action = ''")).toBe(true);
    expect(DIRECT.test("DELETE [audit].[AuditLog]")).toBe(true);
    expect(ALIASED.test("UPDATE a SET a.Action = '' FROM audit.AuditLog a")).toBe(true);
    expect(ALIASED.test("DELETE a FROM [audit].[AuditLog] a")).toBe(true);
    expect(DIRECT.test("INSERT INTO audit.AuditLog (Action) VALUES ('')")).toBe(false);
  });
});

describe("no JSON a proc builds carries a password hash", () => {
  const queries = procs.flatMap(({ path, sql }) =>
    forJsonQueries(sql).map((query) => ({ path, query })),
  );

  it("finds the FOR JSON queries it checks", () => {
    expect(queries.length).toBeGreaterThan(100);
  });

  it("none names PasswordHash or selects every column of auth.[User]", () => {
    const offenders = queries
      .filter(
        ({ query }) =>
          /PasswordHash/i.test(query) ||
          (/\bauth\.\[?User\]?/i.test(query) && /\bSELECT\s+(?:\w+\.)?\*/i.test(query)),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("reads a query whole, nested subqueries included", () => {
    const [query] = forJsonQueries(
      code(`INSERT INTO audit.AuditLog (AfterJson) VALUES ((SELECT UserId,
        (SELECT PasswordHash FROM auth.[User] FOR JSON PATH) AS Inner
        FROM auth.[User] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));`),
    ).slice(-1);
    expect(query).toMatch(/^SELECT UserId/);
    expect(query).toMatch(/PasswordHash/);
  });
});
