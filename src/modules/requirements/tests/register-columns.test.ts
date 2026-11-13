import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTER_KINDS } from "@/lib/custom-columns/kinds";
import {
  BUILT_IN_COLUMNS_JSON,
  REGISTER_BUILT_IN_COLUMNS,
  choiceFilterParam,
  createRegisterColumnInput,
  parseChoiceFilter,
  registerCellsSchema,
  registerColumnSchema,
  setLabelInput,
  setRegisterCellInput,
} from "../schemas/register-columns";

describe("register columns (ADR-0067)", () => {
  it("a rename names a built-in column by its stable key, with a 1-80 character label", () => {
    expect(
      setLabelInput.safeParse({
        projectId: 3,
        columnKey: "Requirement",
        label: "  Need ",
        rowVer: null,
      }).data,
    ).toEqual({ projectId: 3, columnKey: "Requirement", label: "Need", rowVer: null });
    expect(
      setLabelInput.safeParse({ projectId: 3, columnKey: "Secret", label: "x", rowVer: null })
        .success,
    ).toBe(false);
    for (const label of ["", "   ", "x".repeat(81)]) {
      expect(
        setLabelInput.safeParse({ projectId: 3, columnKey: "Ref", label, rowVer: null }).success,
        JSON.stringify(label),
      ).toBe(false);
    }
  });

  it("the built-in list the procs check against names every column once, by key", () => {
    const keys = REGISTER_BUILT_IN_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(JSON.parse(BUILT_IN_COLUMNS_JSON)).toEqual(REGISTER_BUILT_IN_COLUMNS);
    const view = readFileSync("src/modules/requirements/components/requirements-view.tsx", "utf8");
    for (const key of keys) expect(view, key).toContain(`key: "${key}"`);
  });

  it("a choice list needs 1 to 50 distinct choices; other kinds take none", () => {
    const base = { projectId: 3, name: "Status" };
    expect(
      createRegisterColumnInput.safeParse({ ...base, kind: "choice", choices: ["Open", "Closed"] })
        .success,
    ).toBe(true);
    expect(
      createRegisterColumnInput.safeParse({ ...base, kind: "choice", choices: [] }).success,
    ).toBe(false);
    expect(
      createRegisterColumnInput.safeParse({ ...base, kind: "choice", choices: ["Open", "open"] })
        .success,
    ).toBe(false);
    expect(
      createRegisterColumnInput.safeParse({ ...base, kind: "text", choices: ["A"] }).success,
    ).toBe(false);
    expect(createRegisterColumnInput.safeParse({ ...base, kind: "action" }).success).toBe(false);
  });

  it("a cell value is checked by its column's kind before it reaches the proc", () => {
    const cell = { requirementId: 4, columnId: 7, rowVer: 9 };
    expect(setRegisterCellInput.safeParse({ ...cell, kind: "choice", value: "12" }).data).toEqual({
      ...cell,
      value: "12",
    });
    expect(setRegisterCellInput.safeParse({ ...cell, kind: "choice", value: "Open" }).success).toBe(
      false,
    );
    expect(
      setRegisterCellInput.safeParse({ ...cell, kind: "document", value: "javascript:x" }).success,
    ).toBe(false);
    expect(
      setRegisterCellInput.safeParse({ ...cell, kind: "date", value: "" }).data?.value,
    ).toBeNull();
  });

  it("the filter in the URL is ids only, so renaming a column or a choice keeps it", () => {
    expect(parseChoiceFilter(choiceFilterParam(5, 12))).toEqual({ columnId: 5, optionId: 12 });
    for (const bad of [undefined, "", "5", "5.x", "Status.Open", "5.12.1", "-1.2"]) {
      expect(parseChoiceFilter(bad), String(bad)).toBeNull();
    }
  });

  it("rows and columns parse what the procs write", () => {
    expect(registerCellsSchema.parse(null)).toEqual([]);
    expect(registerCellsSchema.parse('[{"columnId":5,"optionId":12}]')).toEqual([
      { columnId: 5, optionId: 12 },
    ]);
    const column = registerColumnSchema.parse({
      RequirementColumnId: 5,
      Name: "Status",
      Kind: "choice",
      SortOrder: 1,
      RowVer: "40",
      HasValues: true,
      OptionsJson: '[{"id":12,"label":"Open","rowVer":41}]',
    });
    expect(column.Options).toEqual([{ id: 12, label: "Open", rowVer: 41 }]);
  });

  it("the kinds match the migration's CHECK list, so the two cannot drift", () => {
    const migration = readFileSync("db/migrations/074_custom_register_columns.sql", "utf8");
    const listed =
      /CK_RequirementColumn_Kind CHECK \(Kind IN \(([^)]*)\)/.exec(migration)?.[1] ?? "";
    expect([...listed.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual(
      [...REGISTER_KINDS].sort(),
    );
  });
});
