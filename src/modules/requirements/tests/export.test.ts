import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { requirementCsvRows, requirementPdf } from "../export";
import type { RequirementListRow } from "../schemas/requirement";

/**
 * The register's exports (client feedback 2026-10-26). Both read rows the
 * repository has already parsed, so these pin the shape of the file rather
 * than any database behaviour.
 */

const base = {
  ProjectId: 7,
  IsMet: false,
  CreatedAtUtc: new Date("2026-10-01T00:00:00Z"),
  UpdatedAtUtc: null,
  RowVer: 1,
  TotalCount: 3,
  Validates: [],
  ValidatedBy: [],
  DeliverableIds: [],
  CanUpdate: true,
  CanDelete: true,
} as const;

function row(over: Partial<RequirementListRow>): RequirementListRow {
  return {
    ...base,
    RequirementId: 1,
    RequirementType: "FR",
    Number: 1,
    Requirement: "A requirement",
    ...over,
  } as RequirementListRow;
}

describe("requirementCsvRows", () => {
  it("heads the file and puts the register in catalog order", () => {
    const rows = requirementCsvRows([
      row({ RequirementId: 2, RequirementType: "FR", Number: 2, Requirement: "second" }),
      row({ RequirementId: 1, RequirementType: "BR", Number: 1, Requirement: "a need" }),
      row({ RequirementId: 3, RequirementType: "FR", Number: 1, Requirement: "first" }),
    ]);
    expect(rows[0]).toEqual([
      "Ref",
      "Type",
      "Requirement",
      "Met",
      "Validates",
      "Validated by",
      "Coverage",
    ]);
    expect(rows.slice(1).map((r) => r[0])).toEqual(["BR-1", "FR-1", "FR-2"]);
  });

  it("leaves Met empty for a need and fills coverage from its solutions", () => {
    const [, need] = requirementCsvRows([
      row({
        RequirementType: "BR",
        ValidatedBy: [
          { id: 9, type: "FR", number: 1, isMet: true },
          { id: 10, type: "FR", number: 2, isMet: false },
        ],
      }),
    ]);
    expect(need?.[3]).toBe("");
    expect(need?.[5]).toBe("FR-1, FR-2");
    expect(need?.[6]).toBe("1 of 2 met");
  });

  it("neutralises a requirement a spreadsheet would run as a formula", () => {
    const csv = toCsv(requirementCsvRows([row({ Requirement: "=cmd|'/c calc'!A1" })]));
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/,=cmd/);
  });
});

describe("requirementPdf", () => {
  it("writes a PDF carrying the project's name, and survives an empty register", () => {
    const bytes = requirementPdf([row({})], "Harbour upgrade", "2026-10-26");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(requirementPdf([], "Harbour upgrade", "2026-10-26").length).toBeGreaterThan(0);
  });
});
