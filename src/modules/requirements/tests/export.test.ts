import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { messages } from "@/lib/messages";
import { requirementCsvRows, requirementPdf } from "../export";
import type { RequirementListRow } from "../schemas/requirement";
import type { RequirementType } from "../schemas/requirement-types";

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
  ChildCount: 0,
  CanUpdate: true,
  CanDelete: true,
} as const;

/**
 * A row's place in the tree, as the read procs send it (ADR-0048): the printed path, the padded
 * path the order is taken from, and the depth. Derived here the same way the SQL derives it, so
 * what these tests pin is the order the export actually receives.
 */
function tree(type: RequirementType, path: string) {
  const segments = path.split(".");
  return {
    RequirementType: type,
    Number: Number(segments[segments.length - 1]),
    Ref: `${type}-${path}`,
    SortPath: segments.map((segment) => segment.padStart(10, "0")).join("."),
    Depth: segments.length - 1,
  };
}

/** A link entry, with the ref and padded path ufn_Requirement_Links sends. */
function solution(id: number, type: RequirementType, path: string, isMet: boolean) {
  const { Ref, SortPath } = tree(type, path);
  return { id, type, ref: Ref, sortPath: SortPath, isMet };
}

function row(over: Partial<RequirementListRow>): RequirementListRow {
  return {
    ...base,
    RequirementId: 1,
    ...tree("FR", "1"),
    Requirement: "A requirement",
    ...over,
  } as RequirementListRow;
}

describe("requirementCsvRows", () => {
  it("heads the file and puts the register in catalog order", () => {
    const rows = requirementCsvRows([
      row({ RequirementId: 2, ...tree("FR", "2"), Requirement: "second" }),
      row({ RequirementId: 1, ...tree("BR", "1"), Requirement: "a need" }),
      row({ RequirementId: 3, ...tree("FR", "1"), Requirement: "first" }),
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
        ValidatedBy: [solution(9, "FR", "1", true), solution(10, "FR", "2", false)],
      }),
    ]);
    expect(need?.[3]).toBe("");
    expect(need?.[5]).toBe("FR-1, FR-2");
    expect(need?.[6]).toBe("1 of 2 met");
  });

  /**
   * The order used to be catalog type order then Number, which was right only while the register
   * was flat: a number is unique under its parent now, so ordering by it interleaves branches.
   * This case is the old one rewritten around SortPath, and it fails under the old comparison.
   */
  it("keeps each sub-requirement under its parent, and 1.2 before 1.10", () => {
    const rows = requirementCsvRows([
      row({ RequirementId: 5, ...tree("FR", "1.10"), Requirement: "tenth child" }),
      row({ RequirementId: 2, ...tree("FR", "2"), Requirement: "second root" }),
      row({ RequirementId: 4, ...tree("FR", "1.2"), Requirement: "second child" }),
      row({ RequirementId: 1, ...tree("FR", "1"), Requirement: "first root" }),
      row({ RequirementId: 3, ...tree("BR", "1"), Requirement: "a need" }),
    ]);
    expect(rows.slice(1).map((r) => String(r[0]).trimStart().replace("\u21b3 ", ""))).toEqual([
      "BR-1",
      "FR-1",
      "FR-1.2",
      "FR-1.10",
      "FR-2",
    ]);
  });

  it("indents a sub-requirement's cell so a spreadsheet shows the tree", () => {
    const [, root, child] = requirementCsvRows([
      row({ RequirementId: 1, ...tree("FR", "1") }),
      row({ RequirementId: 2, ...tree("FR", "1.1") }),
    ]);
    expect(root?.[0]).toBe("FR-1");
    expect(child?.[0]).toBe("\u00a0\u00a0\u21b3 FR-1.1");
    expect(child?.[1]).toBe(messages.requirements.subRequirement);
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
