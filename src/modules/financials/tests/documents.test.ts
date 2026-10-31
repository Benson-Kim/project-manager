import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: () => Promise.resolve(session),
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: vi.fn(),
}));

import { AppError } from "@/lib/errors";
import {
  copyDocumentsAction,
  createDocumentAction,
  deleteDocumentAction,
  moveDocumentAction,
  updateDocumentAction,
} from "../actions";
import {
  documentSuggestion,
  documentSummary,
  matchSuggestion,
  requiredLabel,
  suggestionContext,
} from "../calc/documents";
import { calculateSheet } from "../calc/sheet";
import {
  createDocumentInput,
  suggestionListInput,
  suggestionListSchema,
  templateDocumentListSchema,
  toDocumentDto,
} from "../schemas/documents";
import { toSheetDto } from "../schemas/financial";
import { templateDefinitionInput, templateDefinitionSchema } from "../schemas/template";
import {
  documentRow,
  financialRow,
  migrationTemplateDefinition,
  migrationTemplateDocuments,
  workbookSheetSets,
} from "./fixtures";

const saved = { ...documentRow(31, "DA", null, 1), FinancialId: 4 };

describe("document schemas (ADR-0030)", () => {
  it("reads the documents migration 034 adds to the default template", () => {
    const docs = templateDocumentListSchema.parse(migrationTemplateDocuments());
    expect(docs).toHaveLength(9);
    expect(docs.map((d) => d.name)).toContain("DO (Dossier d'opportunité)");
    expect(docs.every((d) => d.required === null)).toBe(true);
    expect(docs[0]!.suggestions.map((s) => s.kind)).toEqual(["noCapital", "budgetBelow"]);
  });

  it("keeps older templates without documents readable", () => {
    const def = templateDefinitionSchema.parse(JSON.parse(migrationTemplateDefinition()));
    expect(def.documents).toEqual([]);
  });

  it("refuses duplicate names, repeated rule kinds and zero thresholds", () => {
    expect(templateDocumentListSchema.safeParse([{ name: "A1" }, { name: " A1 " }]).success).toBe(
      false,
    );
    expect(
      suggestionListSchema.safeParse([
        { kind: "noCapital", reason: "a" },
        { kind: "noCapital", reason: "b" },
      ]).success,
    ).toBe(false);
    expect(
      suggestionListInput.safeParse([{ kind: "budgetBelow", amount: "0", reason: "a" }]).success,
    ).toBe(false);
    expect(
      suggestionListSchema.safeParse([{ kind: "budgetBelow", amount: "0.00", reason: "a" }])
        .success,
    ).toBe(false);
    expect(suggestionListSchema.safeParse([{ kind: "other", reason: "a" }]).success).toBe(false);
  });

  it("turns a typed threshold into the stored amount and keeps the reason optional", () => {
    const parsed = createDocumentInput.parse({
      financialId: "4",
      name: "  DA ",
      required: false,
      reason: "",
      suggestions: [{ kind: "budgetBelow", amount: "200,000", reason: " Under " }],
    });
    expect(parsed).toEqual({
      financialId: 4,
      name: "DA",
      required: false,
      reason: null,
      suggestions: [{ kind: "budgetBelow", amount: "200000.00", reason: "Under" }],
    });
    expect(
      createDocumentInput.safeParse({ financialId: 4, name: "x", required: null }).success,
    ).toBe(true);
    expect(
      createDocumentInput.safeParse({
        financialId: 4,
        name: "x",
        required: null,
        reason: "r".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("drops stored suggestions that no longer parse instead of failing the page", () => {
    const dto = toDocumentDto({ ...documentRow(1, "X", true, 1), Suggestions: "not json" });
    expect(dto.suggestions).toEqual([]);
    expect(
      toDocumentDto({ ...documentRow(1, "X", true, 1), Suggestions: '[{"kind":"x"}]' }).suggestions,
    ).toEqual([]);
  });

  it("round-trips a template's documents through the editor input", () => {
    const def = templateDefinitionInput.parse({
      horizonYears: 5,
      fiscalYearStartMonth: 4,
      escalationRate: "5",
      flagThresholdRate: "10",
      taxProfiles: [],
      costCategories: [],
      fundingSources: [],
      lines: [],
      documents: [
        {
          name: "DA",
          required: null,
          reason: "",
          suggestions: [{ kind: "budgetBelow", amount: "200 000", reason: "Small" }],
        },
      ],
    });
    expect(templateDefinitionSchema.parse(JSON.parse(JSON.stringify(def))).documents).toEqual([
      {
        name: "DA",
        required: null,
        reason: null,
        suggestions: [{ kind: "budgetBelow", amount: "200000.00", reason: "Small" }],
      },
    ]);
  });
});

describe("the sheet carries the checklist", () => {
  it("parses documents and groups their files", () => {
    const sheet = toSheetDto(workbookSheetSets());
    expect(sheet.documents.map((d) => [d.name, d.required, d.fileCount])).toEqual([
      ["DA (Dossier d'affaires)", null, 0],
      ["Signed direct contract", true, 1],
      ["A1", false, 0],
    ]);
    expect(sheet.documentFiles[32]!.map((f) => f.FileName)).toEqual(["contract.pdf"]);
    expect(sheet.documentFiles[31]).toBeUndefined();
  });

  it("reads a sheet from before the checklist (five sets)", () => {
    const sheet = toSheetDto(workbookSheetSets().slice(0, 5));
    expect(sheet.documents).toEqual([]);
    expect(sheet.documentFiles).toEqual({});
  });
});

describe("advisory suggestions (never enforced)", () => {
  const sheetWith = (overrides: Record<string, unknown>) => {
    const sets = workbookSheetSets();
    sets[0] = [financialRow(overrides)];
    return toSheetDto(sets);
  };

  it("measures the whole budget: the authorised one when entered", () => {
    const sheet = sheetWith({ Budget: 150000 });
    const ctx = suggestionContext(sheet, calculateSheet(sheet).plan);
    expect(ctx.budget).toEqual({ cents: 15_000_000n, source: "authorised" });
    const match = documentSuggestion(sheet.documents[0]!, ctx);
    expect(match?.kind).toBe("budgetBelow");
    expect(match?.detail).toContain("150,000.00");
    expect(match?.detail).toContain("200,000.00");
  });

  it("falls back to the planned total on the budget's basis", () => {
    const sheet = sheetWith({ Budget: null, BudgetIncludesTax: false });
    const { plan } = calculateSheet(sheet);
    const ctx = suggestionContext(sheet, plan);
    expect(ctx.budget).toEqual({ cents: plan.total.beforeTax, source: "planned" });
    const withTax = sheetWith({ Budget: null, BudgetIncludesTax: true });
    expect(suggestionContext(withTax, calculateSheet(withTax).plan).budget?.cents).toBe(
      calculateSheet(withTax).plan.total.withTax,
    );
  });

  it("offers nothing at or above the threshold, or without any budget", () => {
    const rule = { kind: "budgetBelow" as const, amount: "200000.00", reason: "r" };
    const ctx = {
      budget: { cents: 20_000_000n, source: "authorised" as const },
      plannedBeforeTax: 1n,
      capitalBeforeTax: 1n,
      currency: "",
    };
    expect(matchSuggestion(rule, ctx)).toBeNull();
    expect(
      matchSuggestion(rule, { ...ctx, budget: { cents: 19_999_999n, source: "authorised" } }),
    ).not.toBeNull();
    expect(matchSuggestion(rule, { ...ctx, budget: null })).toBeNull();
  });

  it("calls a cost non-capitalizable only when something is planned and none of it is capital", () => {
    const rule = { kind: "noCapital" as const, reason: "Non-cap" };
    const base = { budget: null, plannedBeforeTax: 0n, capitalBeforeTax: 0n, currency: "" };
    expect(matchSuggestion(rule, base)).toBeNull();
    expect(matchSuggestion(rule, { ...base, plannedBeforeTax: 100n })?.reason).toBe("Non-cap");
    expect(
      matchSuggestion(rule, { ...base, plannedBeforeTax: 100n, capitalBeforeTax: 50n }),
    ).toBeNull();
  });

  it("takes the first matching rule in the document's order", () => {
    const doc = {
      suggestions: [
        { kind: "noCapital" as const, reason: "first" },
        { kind: "budgetBelow" as const, amount: "1.00", reason: "second" },
      ],
    };
    const ctx = {
      budget: { cents: 50n, source: "planned" as const },
      plannedBeforeTax: 50n,
      capitalBeforeTax: 0n,
      currency: "",
    };
    expect(documentSuggestion(doc, ctx)?.reason).toBe("first");
    expect(documentSuggestion(doc, { ...ctx, capitalBeforeTax: 5n })?.reason).toBe("second");
  });

  it("summarises required, with file and undecided", () => {
    const sheet = toSheetDto(workbookSheetSets());
    expect(documentSummary(sheet.documents)).toEqual({
      total: 3,
      required: 1,
      notRequired: 1,
      undecided: 1,
      requiredWithFile: 1,
    });
    expect([true, false, null].map(requiredLabel)).toEqual([
      "Required",
      "Not required",
      "Not decided",
    ]);
  });
});

describe("document actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
  });

  it("writes through the procs as the signed-in user, never with a project from the caller", async () => {
    execProc.mockResolvedValue([saved]);
    expect(
      await createDocumentAction({
        financialId: 4,
        name: "DA",
        required: null,
        projectId: 99,
      } as never),
    ).toEqual({ ok: true, data: { documentId: 31, rowVer: 431 } });
    expect(execProc).toHaveBeenLastCalledWith("usp_FinancialDocument_Create", {
      FinancialId: 4,
      Name: "DA",
      IsRequired: null,
      ReasonNotCreated: null,
      Suggestions: "[]",
      ActorUserId: 7,
    });
    expect(
      await updateDocumentAction({
        documentId: 31,
        name: "DA",
        required: false,
        reason: "Non-capitalizable",
        rowVer: 431,
      }),
    ).toMatchObject({ ok: true });
    expect(execProc.mock.lastCall![1]).toMatchObject({
      FinancialDocumentId: 31,
      IsRequired: false,
      ReasonNotCreated: "Non-capitalizable",
      RowVer: 431,
    });
    expect(
      await moveDocumentAction({ documentId: 31, direction: "up", rowVer: 431 }),
    ).toMatchObject({
      ok: true,
    });
    execProc.mockResolvedValue([]);
    expect(await deleteDocumentAction({ documentId: 31, rowVer: 431 })).toEqual({
      ok: true,
      data: { documentId: 31 },
    });
    execProc.mockResolvedValue([{ Added: 9 }]);
    expect(await copyDocumentsAction({ financialId: 4, templateId: 1 })).toEqual({
      ok: true,
      data: { financialId: 4, added: 9 },
    });
  });

  it("returns field errors and maps proc errors", async () => {
    const invalid = await createDocumentAction({ financialId: 4, name: " ", required: null });
    expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(execProc).not.toHaveBeenCalled();
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "nope"));
    expect(await deleteDocumentAction({ documentId: 31, rowVer: 1 })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN_ROW" },
    });
    execProc.mockRejectedValue(new AppError("DUPLICATE", "dup"));
    expect(
      await updateDocumentAction({ documentId: 31, name: "A1", required: true, rowVer: 1 }),
    ).toMatchObject({ ok: false, error: { code: "DUPLICATE" } });
  });

  it("refuses everything without a session", async () => {
    session = null;
    const result = await copyDocumentsAction({ financialId: 4, templateId: 1 });
    expect(result.ok).toBe(false);
    expect(execProc).not.toHaveBeenCalled();
  });
});

describe("document inputs bind only their own fields (mass assignment)", () => {
  it("drops owner, order, counts and audit fields a caller adds", async () => {
    const { updateDocumentInput } = await import("../schemas/documents");
    const parsed = updateDocumentInput.parse({
      documentId: 31,
      name: "DA",
      required: true,
      rowVer: 1,
      financialId: 99,
      projectId: 99,
      sortOrder: -1,
      fileCount: 7,
      createdBy: 1,
      isDeleted: true,
      suggestions: [{ kind: "noCapital", reason: "r", extra: "x", amount: "5" }],
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ["documentId", "name", "reason", "required", "rowVer", "suggestions"].sort(),
    );
    expect(parsed.suggestions).toEqual([{ kind: "noCapital", reason: "r" }]);
  });

  it("sends the procs an explicit parameter list", async () => {
    execProc.mockReset();
    execProc.mockResolvedValue([saved]);
    session = { userId: 7, username: "pm", role: "User" };
    await updateDocumentAction({
      documentId: 31,
      name: "DA",
      required: null,
      rowVer: 1,
      financialId: 99,
    } as never);
    expect(Object.keys(execProc.mock.lastCall![1] as object).sort()).toEqual(
      [
        "ActorUserId",
        "FinancialDocumentId",
        "IsRequired",
        "Name",
        "ReasonNotCreated",
        "RowVer",
        "Suggestions",
      ].sort(),
    );
  });
});
