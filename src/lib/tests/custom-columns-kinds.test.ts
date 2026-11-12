import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  CHECKLIST_KINDS,
  COLUMN_KINDS,
  cellInputValue,
  customCellColumnId,
  customCellField,
  isCalendarDate,
  isWebAddress,
  newColumnSchema,
  normaliseWebAddress,
  parseCellValue,
} from "@/lib/custom-columns/kinds";

describe("column kinds (ADR-0066)", () => {
  it("dates are real calendar days written YYYY-MM-DD", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("01/12/2026")).toBe(false);
    expect(parseCellValue("date", " 2026-12-01 ")).toEqual({ ok: true, value: "2026-12-01" });
    expect(parseCellValue("date", "2026-12-32").ok).toBe(false);
  });

  it("blank empties every kind", () => {
    for (const kind of COLUMN_KINDS)
      expect(parseCellValue(kind, "  ")).toEqual({ ok: true, value: null });
  });

  it("text is capped at 2,000 characters", () => {
    expect(parseCellValue("text", "x".repeat(2000)).ok).toBe(true);
    expect(parseCellValue("text", "x".repeat(2001)).ok).toBe(false);
  });

  it("links are http or https addresses only", () => {
    expect(parseCellValue("document", "https://example.com/spec?v=2")).toEqual({
      ok: true,
      value: "https://example.com/spec?v=2",
    });
    expect(parseCellValue("document", "example.com/spec")).toEqual({
      ok: true,
      value: "https://example.com/spec",
    });
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "ftp://example.com/a",
      "https://a b.example",
      'https://example.com/"onmouseover=',
      "https://",
      `https://example.com/${"a".repeat(2048)}`,
    ]) {
      expect(parseCellValue("document", bad).ok, bad).toBe(false);
    }
    expect(isWebAddress("http://localhost:3000/x")).toBe(true);
    expect(normaliseWebAddress("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("a sign-off is on or off", () => {
    expect(parseCellValue("action", "1")).toEqual({ ok: true, value: "1" });
    expect(parseCellValue("action", "yes").ok).toBe(false);
  });

  it("a new column needs a name, and a button needs its action", () => {
    expect(newColumnSchema.safeParse({ name: " Due ", kind: "date" }).data).toEqual({
      name: "Due",
      kind: "date",
    });
    expect(newColumnSchema.safeParse({ name: "", kind: "date" }).success).toBe(false);
    expect(newColumnSchema.safeParse({ name: "x".repeat(81), kind: "text" }).success).toBe(false);
    expect(newColumnSchema.safeParse({ name: "Go", kind: "action" }).success).toBe(false);
    expect(
      newColumnSchema.safeParse({ name: "Go", kind: "text", actionKind: "todo" }).success,
    ).toBe(false);
    expect(newColumnSchema.safeParse({ name: "Go", kind: "number" }).success).toBe(false);
    expect(
      newColumnSchema.safeParse({ name: "Go", kind: "action", actionKind: "signoff" }).success,
    ).toBe(true);
  });

  it("datasheet fields name the column they edit", () => {
    expect(customCellField(12)).toBe("cell:12");
    expect(customCellColumnId("cell:12")).toBe(12);
    expect(customCellColumnId("title")).toBeNull();
    expect(cellInputValue("date", { date: "2026-12-01" })).toBe("2026-12-01");
    expect(cellInputValue("action", { signedAt: "2026-12-01T10:00:00Z" })).toBe("1");
    expect(cellInputValue("text", undefined)).toBe("");
  });

  it("the kinds and actions match the migration's CHECK lists, so the two cannot drift", () => {
    const migration = readFileSync("db/migrations/073_checklists.sql", "utf8");
    const list = (pattern: RegExp) =>
      [...(pattern.exec(migration)?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(list(/CK_ChecklistColumn_Kind CHECK \(Kind IN \(([^)]*)\)/)).toEqual(
      [...CHECKLIST_KINDS].sort(),
    );
    expect(list(/ActionKind IN \(([^)]*)\)/)).toEqual([...ACTION_KINDS].sort());
  });
});
