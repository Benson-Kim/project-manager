import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: SQL Server refuses a column-level CHECK that names a second column — "Column CHECK
 * constraint for column 'IsMet' references another column" (error 8141). It is raised when the
 * migration is applied, not when it is written, so the whole apply step dies on a server nobody
 * has locally. A constraint spanning two columns goes in the table-level list after the columns.
 *
 * Both shapes that carry a column definition are read: the CREATE TABLE body, and the
 * `ALTER TABLE … ADD` list every migration after the initial schema uses. In an ADD list only the
 * constraints juxtaposed with a column belong to it; anything after a comma is table-level.
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
type ColumnList = { table: string; columns: Column[]; altered: boolean };

const TABLE = String.raw`[A-Za-z0-9_.[\]]+`;

/** Schema-qualified name without its brackets, so one table is one key. */
function tableKey(name: string): string {
  return name.replace(/[[\]]/g, "").toLowerCase();
}

/**
 * The comma-separated items of a definition list that starts at `from`. A CREATE TABLE body opens
 * at depth 1 and ends on the bracket that closes it; an ADD list sits at depth 0 and ends at its
 * statement terminator.
 */
function listItems(sql: string, from: number, baseDepth: number): string[] {
  const out: string[] = [];
  let item = "";
  let depth = baseDepth;
  for (let i = from; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    if (depth < baseDepth) break;
    const ends = c === ";" || (c === "\n" && /^\s*GO\b/i.test(sql.slice(i + 1, i + 8)));
    if (depth === baseDepth && ends) break;
    if (c === "," && depth === baseDepth) {
      out.push(item);
      item = "";
    } else item += c;
  }
  out.push(item);
  return out;
}

/** The column definitions among a list's items; a table-level constraint is not one. */
function columnDefs(items: string[]): Column[] {
  return items
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
}

/** Every CREATE TABLE body and ALTER … ADD list in one script. */
function columnLists(scrubbed: string): ColumnList[] {
  const out: ColumnList[] = [];
  const create = new RegExp(String.raw`CREATE\s+TABLE\s+(${TABLE})\s*\(`, "gi");
  for (let m = create.exec(scrubbed); m; m = create.exec(scrubbed))
    out.push({
      table: m[1]!,
      columns: columnDefs(listItems(scrubbed, m.index + m[0].length, 1)),
      altered: false,
    });
  const alter = new RegExp(String.raw`ALTER\s+TABLE\s+(${TABLE})\s+ADD\s+`, "gi");
  for (let m = alter.exec(scrubbed); m; m = alter.exec(scrubbed))
    out.push({
      table: m[1]!,
      columns: columnDefs(listItems(scrubbed, m.index + m[0].length, 0)),
      altered: true,
    });
  return out;
}

type Registry = Map<string, Set<string>>;

/** Adds a script's columns to what each table is known to hold. */
function register(sql: string, known: Registry): void {
  for (const { table, columns } of columnLists(scrub(sql))) {
    const set = known.get(tableKey(table)) ?? new Set<string>();
    for (const col of columns) set.add(col.name);
    known.set(tableKey(table), set);
  }
}

/**
 * Every column-level CHECK in one script, with the other columns of its table that it names. A
 * CREATE TABLE check is read against the columns beside it; an ADD check against every column the
 * table is known to have, because that is what the server compares it to.
 */
function inlineChecks(sql: string, known: Registry) {
  return columnLists(scrub(sql)).flatMap(({ table, columns, altered }) =>
    columns
      .filter((col) => col.check !== null)
      .map((col) => {
        const siblings = altered
          ? [...(known.get(tableKey(table)) ?? new Set<string>())]
          : columns.map((c) => c.name);
        return {
          table,
          column: col.name,
          shape: altered ? "ADD" : "CREATE",
          others: siblings
            .filter((name) => name !== col.name)
            .filter((name) => new RegExp(String.raw`\b${name}\b`, "i").test(col.check as string)),
        };
      }),
  );
}

describe("a column CHECK never references a second column (SQL Server error 8141)", () => {
  const files = migrations().map((path) => ({ path, sql: readFileSync(path, "utf8") }));
  const known: Registry = new Map();
  for (const { sql } of files) register(sql, known);
  const checks = files.flatMap(({ path, sql }) =>
    inlineChecks(sql, known).map((check) => ({ path, ...check })),
  );

  it("parses the migrations' tables", () => {
    expect(known.size).toBeGreaterThanOrEqual(16);
    expect(checks.filter((c) => c.shape === "CREATE").length).toBeGreaterThanOrEqual(10);
  });

  it.each(checks.map((c) => [`${c.path} ${c.table}.${c.column} (${c.shape})`, c] as const))(
    "%s",
    (_label, { others }) => {
      expect(others, `move this CHECK to the table-level constraint list`).toEqual([]);
    },
  );
});

/** The parser is the whole guardrail, so it is held to the shapes it has to tell apart. */
describe("the 8141 parser tells a column CHECK from a table-level one", () => {
  const CREATED = `CREATE TABLE app.Fixture (
    FixtureId INT IDENTITY(1,1) NOT NULL,
    Kind NVARCHAR(4) NOT NULL CONSTRAINT CK_Fixture_Kind CHECK (Kind IN ('BR','FR')),
    CONSTRAINT PK_Fixture PRIMARY KEY (FixtureId)
  );`;

  function findings(sql: string) {
    const known: Registry = new Map();
    register(CREATED, known);
    register(sql, known);
    return inlineChecks(sql, known);
  }

  it("passes a column CHECK that names only its own column", () => {
    expect(findings(CREATED).map((c) => c.others)).toEqual([[]]);
  });

  it("catches the CREATE TABLE shape that failed migration 036", () => {
    const sql = `CREATE TABLE app.Fixture2 (
      Kind NVARCHAR(4) NOT NULL,
      IsMet BIT NULL CONSTRAINT CK_Fixture2_Met CHECK (Kind <> 'BR' OR IsMet IS NULL)
    );`;
    expect(findings(sql)).toMatchObject([{ column: "ismet", others: ["kind"] }]);
  });

  it("catches the same mistake in an ALTER TABLE … ADD list", () => {
    const sql = `ALTER TABLE app.Fixture ADD IsMet BIT NULL
      CONSTRAINT CK_Fixture_Met CHECK (Kind <> 'BR' OR IsMet IS NULL);`;
    expect(findings(sql)).toMatchObject([{ column: "ismet", shape: "ADD", others: ["kind"] }]);
  });

  it("leaves an ADD list's table-level constraint alone", () => {
    // The comma ends the column definition, so this CHECK is table-level and may span columns.
    const sql = `ALTER TABLE app.Fixture ADD IsMet BIT NULL CONSTRAINT DF_Fixture_Met DEFAULT (0),
      CONSTRAINT CK_Fixture_Met CHECK (Kind <> 'BR' OR IsMet IS NULL);`;
    expect(findings(sql)).toEqual([]);
  });

  it("stops an ADD list at a batch separator, not at the next statement", () => {
    const sql = `ALTER TABLE app.Fixture ADD Note NVARCHAR(50) NULL
GO
ALTER TABLE app.Fixture ADD CONSTRAINT CK_Other CHECK (Kind <> 'BR' OR Note IS NULL);`;
    expect(findings(sql)).toEqual([]);
  });
});
