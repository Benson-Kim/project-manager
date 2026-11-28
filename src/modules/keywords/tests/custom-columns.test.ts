import { describe, expect, it } from "vitest";
import { labelInputsFor } from "@/lib/custom-columns/register";
import { KEYWORD_BUILT_IN_COLUMNS, keywordColumnSchema } from "../schemas/columns";
import { keywordListRowSchema } from "../schemas/keyword";
import { SUPPLIER_BUILT_IN_COLUMNS } from "@/modules/suppliers/schemas/columns";
import { supplierListRowSchema } from "@/modules/suppliers/schemas/supplier";

const access = {
  ActorAccess: null,
  ActorGrants: null,
  ActorRevokes: null,
  TotalCount: 1,
  RowVer: 7,
};
const cells = JSON.stringify([{ columnId: 3, text: "Open" }]);

describe("keyword and supplier added columns", () => {
  it("reads a keyword row's added cells, and none when the list spans projects", () => {
    const row = {
      ...access,
      KeywordId: 1,
      ProjectId: 2,
      Keyword: "SLA",
      Definition: null,
      CreatedAtUtc: new Date(),
      UpdatedAtUtc: null,
    };
    expect(keywordListRowSchema.parse({ ...row, CustomCellsJson: cells }).CustomCells).toEqual([
      { columnId: 3, text: "Open" },
    ]);
    expect(keywordListRowSchema.parse({ ...row, CustomCellsJson: null }).CustomCells).toEqual([]);
  });

  it("reads a supplier row's added cells", () => {
    const parsed = supplierListRowSchema.safeParse({ ...access, CustomCellsJson: cells });
    expect(
      parsed.success ? parsed.data.CustomCells : parsed.error.issues.map((i) => i.path[0]),
    ).not.toContain("CustomCellsJson");
  });

  it("renames only the list's own columns", () => {
    const keyword = labelInputsFor(KEYWORD_BUILT_IN_COLUMNS).set;
    expect(
      keyword.safeParse({ projectId: 2, columnKey: "Definition", label: "Meaning", rowVer: null })
        .success,
    ).toBe(true);
    expect(
      keyword.safeParse({ projectId: 2, columnKey: "SupplierName", label: "x", rowVer: null })
        .success,
    ).toBe(false);
    const supplier = labelInputsFor(SUPPLIER_BUILT_IN_COLUMNS).set;
    expect(
      supplier.safeParse({ projectId: 2, columnKey: "Rating", label: "Score", rowVer: null })
        .success,
    ).toBe(true);
  });

  it("maps a keyword column's own id to ColumnId", () => {
    const column = keywordColumnSchema.parse({
      KeywordColumnId: 9,
      Name: "Status",
      Kind: "text",
      SortOrder: 1,
      RowVer: 1,
    });
    expect(column).toMatchObject({ ColumnId: 9, Options: [], HasValues: false });
  });
});
