import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: SQL Server refuses a column-level CHECK that names a second column — "Column CHECK
 * constraint for column 'IsMet' references another column" (error 8141). It is raised when the
 * migration is applied, not when it is written, so the whole apply step dies on a server nobody
 * has locally. A constraint spanning two columns goes in the table-level list after the columns.
 */
function migrations(): string[] {
  return readdirSync("db/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join("db/migrations", name));
}

/**
 * Blanks out string literals and comments in one pass. Both have to go before any comma or
 * bracket is counted: a comma in a comment would otherwise end a column, and an apostrophe in
 * one would open a literal that never closes.
 */
function scrub(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      out += "\n";
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 1;
      out += " ";
    } else if (sql[i] === "'") {
      for (i += 1; i < sql.length; i += 1) {
        if (sql[i] !== "'") continue;
        if (sql[i + 1] !== "'") break;
        i += 1;
      }
      out += "''";
    } else out += sql[i];
  }
  return out;
}

type Column = { name: string; check: string | null };

/** The depth-1 items of each CREATE TABLE body, split into columns and table-level constraints. */
function createTables(sql: string): { table: string; columns: Column[] }[] {
  const out: { table: string; columns: Column[] }[] = [];
  const head = /CREATE\s+TABLE\s+([A-Za-z0-9_.[\]]+)\s*\(/gi;
  for (let m = head.exec(sql); m; m = head.exec(sql)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const items: string[] = [];
    let item = "";
    for (; i < sql.length && depth > 0; i += 1) {
      const c = sql[i];
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      if (depth === 0) break;
      if (c === "," && depth === 1) {
        items.push(item);
        item = "";
      } else item += c;
    }
    items.push(item);

    const columns = items
      .map((raw) => raw.trim())
      .filter((text) => text.length > 0)
      .filter(
        (text) =>
          !/^(CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|INDEX)\b/i.test(text),
      )
      .map((text) => ({
        name: (text.match(/^\[?([A-Za-z_][A-Za-z0-9_]*)\]?/)?.[1] ?? "").toLowerCase(),
        check: text.match(/\bCHECK\s*\(([\s\S]*)\)/i)?.[1] ?? null,
      }))
      .filter((col) => col.name.length > 0);

    out.push({ table: m[1], columns });
  }
  return out;
}

describe("a column CHECK never references a second column (SQL Server error 8141)", () => {
  const files = migrations().map((path) => ({
    path,
    tables: createTables(scrub(readFileSync(path, "utf8"))),
  }));
  const inlineChecks = files.flatMap(({ path, tables }) =>
    tables.flatMap(({ table, columns }) =>
      columns
        .filter((col) => col.check !== null)
        .map((col) => ({ path, table, column: col.name, check: col.check as string, columns })),
    ),
  );

  it("parses the migrations' tables", () => {
    expect(files.filter((f) => f.tables.length > 0).length).toBeGreaterThanOrEqual(16);
    expect(inlineChecks.length).toBeGreaterThanOrEqual(10);
  });

  it.each(inlineChecks.map((c) => [`${c.path} ${c.table}.${c.column}`, c] as const))(
    "%s",
    (_label, { column, check, columns }) => {
      const others = columns
        .map((col) => col.name)
        .filter((name) => name !== column)
        .filter((name) => new RegExp(String.raw`\b${name}\b`, "i").test(check));
      expect(others, `move this CHECK to the table-level constraint list`).toEqual([]);
    },
  );
});
