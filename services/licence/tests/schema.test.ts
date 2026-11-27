import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("database setup", () => {
  it("applies the base schema and then every migration to a fresh database", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(read("schema.sql"));
    const migrations = readdirSync(new URL("../migrations/", import.meta.url))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of migrations) db.exec(read(`migrations/${name}`));

    const columns = db.prepare("SELECT name FROM pragma_table_info('licence')").all();
    expect(columns.map((column) => column.name)).toContain("used_ms");
    db.close();
  });
});
