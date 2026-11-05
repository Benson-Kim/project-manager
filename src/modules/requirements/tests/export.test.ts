import { describe, expect, it } from "vitest";
import { toCsv, type CsvCell } from "@/lib/csv";
import { messages } from "@/lib/messages";
import { PdfWriter, wrapText } from "@/lib/pdf";
import { requirementCsvRows, requirementPdf, requirementPdfColumns } from "../export";
import type { RequirementListRow } from "../schemas/requirement";
import type { RequirementType } from "../schemas/requirement-types";

const M = messages.requirements;

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
  ParentRequirementId: null,
  MoSCoW: null,
  AcceptanceCriteria: null,
  EstimateDays: null,
  OwnerStakeholderId: null,
  OwnerName: null,
  CanUpdate: true,
  CanDelete: true,
} as const;

/**
 * Cells are read by heading rather than by position, so a column added to the register does not
 * rewrite every assertion here — only the heading-row case, which is where the order is pinned.
 */
function at(rows: CsvCell[][], header: string, line = 1): CsvCell | undefined {
  return rows[line]?.[rows[0]!.indexOf(header)];
}

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
  it.each(["BR", "SR"] as const)(
    "exports an uncovered %s as a need without a Met value",
    (type) => {
      const rows = requirementCsvRows([row({ RequirementType: type })]);
      expect(at(rows, M.met)).toBe("");
      expect(at(rows, M.coverage)).toBe(M.coverageNone);
    },
  );

  it.each(["FR", "NFR", "TR"] as const)(
    "exports an unmet %s as a solution without coverage",
    (type) => {
      const rows = requirementCsvRows([row({ RequirementType: type })]);
      expect(at(rows, M.met)).toBe(M.no);
      expect(at(rows, M.coverage)).toBe("");
    },
  );

  it("heads the file and puts the register in catalog order", () => {
    const rows = requirementCsvRows([
      row({ RequirementId: 2, ...tree("FR", "2"), Requirement: "second" }),
      row({ RequirementId: 1, ...tree("BR", "1"), Requirement: "a need" }),
      row({ RequirementId: 3, ...tree("FR", "1"), Requirement: "first" }),
    ]);
    // The register's order: what a requirement is, then how it is planned, then what it traces
    // to. Checked literally, because this is the one row that pins the column set and its order.
    expect(rows[0]).toEqual([
      "Ref",
      "Type",
      "Requirement",
      "MoSCoW",
      "Acceptance criteria",
      "Estimate (days)",
      "Owner",
      "Met",
      "Upstream",
      "Downstream",
      "Coverage",
    ]);
    expect(rows.slice(1).map((r) => r[0])).toEqual(["BR-1", "FR-1", "FR-2"]);
  });

  it("leaves Met empty for a need and fills coverage from its solutions", () => {
    const rows = requirementCsvRows([
      row({
        RequirementType: "BR",
        ValidatedBy: [solution(9, "FR", "1", true), solution(10, "FR", "2", false)],
      }),
    ]);
    expect(at(rows, M.met)).toBe("");
    expect(at(rows, M.validatedBy)).toBe("FR-1, FR-2");
    expect(at(rows, M.coverage)).toBe("1 of 2 met");
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
    expect(child?.[1]).toBe(M.subRequirement);
  });

  /**
   * The planning fields (ADR-0052) landed three days after the export last changed and so were
   * missing from both files, which is what tab 3's check R3 asks the client to verify.
   */
  it("carries the planning fields the register holds", () => {
    const rows = requirementCsvRows([
      row({
        MoSCoW: "S",
        AcceptanceCriteria: "Given a signed-in viewer, the register downloads.",
        EstimateDays: 2.5,
        OwnerStakeholderId: 4,
        OwnerName: "Ada Lovelace",
      }),
    ]);
    expect(at(rows, M.moscowTitle)).toBe(M.moscow.S);
    expect(at(rows, M.acceptanceCriteria)).toBe(
      "Given a signed-in viewer, the register downloads.",
    );
    expect(at(rows, M.estimateDays)).toBe("2.5");
    expect(at(rows, M.owner)).toBe("Ada Lovelace");
  });

  /**
   * A field that applies but is unset says so in words, the way metCell leaves Met empty only
   * where it does not apply: a blank MoSCoW cell would read as a failure to prioritise rather
   * than as the "not prioritised yet" the NULL means.
   */
  it("names an unset MoSCoW and an unowned requirement rather than leaving them blank", () => {
    const rows = requirementCsvRows([row({})]);
    expect(at(rows, M.moscowTitle)).toBe(M.moscowNone);
    expect(at(rows, M.owner)).toBe(M.unassigned);
  });

  it("leaves the estimate and the criteria of an unplanned requirement empty", () => {
    const rows = requirementCsvRows([row({})]);
    expect(at(rows, M.estimateDays)).toBe("");
    expect(at(rows, M.acceptanceCriteria)).toBe("");
  });

  /** The list proc sends an owner id with no name once that stakeholder is deleted. */
  it("does not read a deleted owner as unassigned", () => {
    const rows = requirementCsvRows([row({ OwnerStakeholderId: 4, OwnerName: null })]);
    expect(at(rows, M.owner)).toBe(M.ownerUnlisted);
    expect(at(rows, M.owner)).not.toBe(M.unassigned);
  });

  /**
   * src/lib/csv.ts guards every cell, so this holds for each column that carries free prose —
   * the acceptance criteria as much as the requirement, since both are what a person typed.
   */
  it.each([
    ["Requirement", { Requirement: "=cmd|'/c calc'!A1" }],
    ["AcceptanceCriteria", { AcceptanceCriteria: "=cmd|'/c calc'!A1" }],
  ] as const)("neutralises a %s a spreadsheet would run as a formula", (_column, over) => {
    const csv = toCsv(requirementCsvRows([row(over)]));
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

  /**
   * Eleven columns on A4 landscape only fit because the fitted ones are capped and the table is
   * set smaller than the headings: PdfWriter.table scales a wider table down, so this asserts the
   * prose columns keep a readable line rather than that the file was produced at all.
   */
  it("leaves a requirement's prose a readable line on A4 landscape", () => {
    const sentence =
      "The system shall let an administrator export the whole register to a comma separated " +
      "file and to a printable document without leaving the register page.";
    const rows = [
      row({
        Requirement: sentence,
        AcceptanceCriteria: sentence,
        MoSCoW: "M",
        EstimateDays: 12.5,
        OwnerStakeholderId: 4,
        OwnerName: "Christopher Featherstonehaugh",
      }),
    ];
    // The page the PDF route asks for, so the width is PdfWriter's and not a copy of it here.
    const { contentWidth } = new PdfWriter({ title: "Requirements", landscape: true });
    const columns = requirementPdfColumns(rows, contentWidth);
    const total = columns.reduce((sum, column) => sum + column.width, 0);
    expect(total).toBeLessThanOrEqual(contentWidth + 0.5);

    const prose = columns[columns.findIndex((c) => c.header === M.requirement)]!;
    // Roughly 40 characters: enough that the sentence wraps into lines, not into single words.
    expect(wrapText(sentence, prose.width - 6, 6.5)[0]!.length).toBeGreaterThan(30);
  });
});
