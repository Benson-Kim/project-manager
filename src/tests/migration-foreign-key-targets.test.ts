import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: a foreign key naming a table that no migration creates is only discovered when the
 * migration is applied — "Foreign key references invalid table" (error 1767) — so the whole
 * db-apply step dies on a server nobody has locally. Nothing else here reads a migration's object
 * names: tsc, vitest, eslint and prettier all pass over a typo like `app.[User]`, which does not
 * exist in this schema (every user FK points at `auth.[User]`).
 *
 * Written after exactly that defect reached a migration, caught only by grepping for a second
 * occurrence of the reference and finding none.
 */
const MIGRATIONS = "db/migrations";

/** Blanks out string literals and comments, so neither can contribute a false match. */
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

/** "[app].[Board]" and "app.Board" are the same table. */
const normalise = (name: string) => name.replace(/[[\]]/g, "").toLowerCase();

const QUALIFIED = String.raw`\[?\w+\]?\.\[?\w+\]?`;

const files = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: scrub(readFileSync(join(MIGRATIONS, name), "utf8")) }));

/** Every table the migrations create, in the order they are applied. */
const created = new Set<string>();
for (const { sql } of files) {
  for (const m of sql.matchAll(new RegExp(String.raw`CREATE\s+TABLE\s+(${QUALIFIED})`, "gi"))) {
    created.add(normalise(m[1]!));
  }
  // A table can also be introduced by a rename.
  for (const m of sql.matchAll(/EXEC\s+sp_rename\s+N?'[^']*'\s*,\s*N?'(\w+)'/gi)) {
    created.add(normalise(`app.${m[1]!}`));
  }
}

interface Reference {
  file: string;
  target: string;
}

const references: Reference[] = files.flatMap(({ name, sql }) =>
  [...sql.matchAll(new RegExp(String.raw`REFERENCES\s+(${QUALIFIED})`, "gi"))].map((m) => ({
    file: name,
    target: normalise(m[1]!),
  })),
);

describe("every foreign key names a table the migrations create (SQL Server error 1767)", () => {
  it("parses the migrations", () => {
    expect(created.size).toBeGreaterThanOrEqual(20);
    expect(references.length).toBeGreaterThanOrEqual(30);
  });

  it.each([...new Set(references.map((r) => `${r.file} -> ${r.target}`))].map((l) => [l] as const))(
    "%s",
    (label) => {
      const target = label.split(" -> ")[1]!;
      expect(created.has(target), `no migration creates ${target}`).toBe(true);
    },
  );

  it("knows the user table is auth.User, so a reference to app.User cannot pass", () => {
    expect(created.has("auth.user")).toBe(true);
    expect(created.has("app.user")).toBe(false);
  });
});
