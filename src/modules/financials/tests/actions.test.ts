import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

let session: Session | null = { userId: 7, username: "pm", role: "User" };
vi.mock("@/lib/auth/provider", () => ({
  auth: {
    getSession: () => Promise.resolve(session),
    requireSession: async () => {
      if (!session) {
        const { AppError } = await import("@/lib/errors");
        throw new AppError("UNAUTHENTICATED", "Sign in to continue");
      }
      return session;
    },
  },
}));

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
  execProcSets: vi.fn(),
}));

import { AppError } from "@/lib/errors";
import {
  createFinancialAction,
  createLineAction,
  createTransactionAction,
  deleteFinancialAction,
  deleteLineAction,
  deleteTemplateAction,
  deleteTransactionAction,
  moveLineAction,
  saveTemplateAction,
  setTaxProfilesAction,
  updateFinancialAction,
  updateLineAction,
  updateTransactionAction,
} from "../actions";
import { financialRow, templateRow } from "./fixtures";

const line = {
  FinancialLineId: 8,
  FinancialId: 4,
  Section: "capital",
  Description: "N",
  CostCategory: null,
  FundingSource: null,
  Supplier: null,
  GlAccount: null,
  FinancialTaxProfileId: null,
  IsRecurrent: false,
  Comments: null,
  SortOrder: 1,
  Amounts: "[]",
  RowVer: "15",
};
const tx = {
  FinancialTransactionId: 3,
  FinancialLineId: 8,
  FinancialId: 4,
  FiscalYear: 2023,
  TransactionDate: "2024-03-31",
  Reference: null,
  Description: null,
  Amount: 1,
  TaxRate: 0,
  RowVer: "16",
};
const definition = {
  horizonYears: 5,
  fiscalYearStartMonth: 4,
  escalationRate: "5",
  flagThresholdRate: "10",
  taxProfiles: [],
  costCategories: [],
  fundingSources: [],
  lines: [],
};

describe("financials actions", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
  });

  it("keeps templates for administrators", async () => {
    const denied = await saveTemplateAction({ name: "T", definition });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await deleteTemplateAction({ templateId: 1, rowVer: 1 })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(execProc).not.toHaveBeenCalled();

    session = { userId: 1, username: "admin", role: "Admin" };
    execProc.mockResolvedValue([templateRow({ RowVer: "10" })]);
    expect(await saveTemplateAction({ name: "T", definition })).toEqual({
      ok: true,
      data: { templateId: 1, rowVer: 10 },
    });
    execProc.mockResolvedValue([]);
    expect(await deleteTemplateAction({ templateId: 1, rowVer: 10 })).toEqual({
      ok: true,
      data: { templateId: 1 },
    });
  });

  it("runs financial writes as the signed-in user", async () => {
    execProc.mockResolvedValue([financialRow()]);
    expect(
      await createFinancialAction({ projectId: 2, title: "B", firstFiscalYear: 2023 }),
    ).toEqual({
      ok: true,
      data: { financialId: 4, projectId: 2 },
    });
    expect(execProc.mock.lastCall![1]).toMatchObject({ ActorUserId: 7 });
    const update = await updateFinancialAction({
      financialId: 4,
      title: "B",
      firstFiscalYear: 2023,
      horizonYears: 5,
      startMonth: 4,
      escalationRate: "5",
      flagThresholdRate: "10",
      costCategories: [],
      currency: "GBP",
      fundingSources: [],
      rowVer: 77,
    });
    expect(update).toEqual({ ok: true, data: { financialId: 4, rowVer: 77 } });
    expect(await setTaxProfilesAction({ financialId: 4, rowVer: 77, profiles: [] })).toMatchObject({
      ok: true,
    });
    execProc.mockResolvedValue([]);
    expect(await deleteFinancialAction({ financialId: 4, rowVer: 77 })).toEqual({
      ok: true,
      data: { financialId: 4 },
    });
  });

  it("writes lines and transactions", async () => {
    execProc.mockResolvedValue([line]);
    expect(
      await createLineAction({ financialId: 4, section: "capital", description: "N", amounts: [] }),
    ).toEqual({
      ok: true,
      data: { lineId: 8, rowVer: 15 },
    });
    expect(
      await updateLineAction({
        lineId: 8,
        section: "capital",
        description: "N",
        amounts: [],
        rowVer: 15,
      }),
    ).toMatchObject({ ok: true });
    expect(await moveLineAction({ lineId: 8, direction: "down", rowVer: 15 })).toMatchObject({
      ok: true,
    });
    execProc.mockResolvedValue([]);
    expect(await deleteLineAction({ lineId: 8, rowVer: 15 })).toEqual({
      ok: true,
      data: { lineId: 8 },
    });
    execProc.mockResolvedValue([tx]);
    expect(await createTransactionAction({ lineId: 8, date: "2024-03-31", amount: "1" })).toEqual({
      ok: true,
      data: { transactionId: 3, rowVer: 16 },
    });
    expect(
      await updateTransactionAction({
        transactionId: 3,
        lineId: 8,
        date: "2024-03-31",
        amount: "1",
        rowVer: 16,
      }),
    ).toMatchObject({ ok: true });
    execProc.mockResolvedValue([]);
    expect(await deleteTransactionAction({ transactionId: 3, rowVer: 16 })).toEqual({
      ok: true,
      data: { transactionId: 3 },
    });
  });

  it("returns field errors and maps proc errors", async () => {
    const invalid = await createLineAction({
      financialId: 4,
      section: "capital",
      description: "",
      amounts: [],
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!invalid.ok) expect(invalid.error.fieldErrors).toHaveProperty("description");
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "nope"));
    expect(await deleteLineAction({ lineId: 8, rowVer: 1 })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN_ROW" },
    });
  });
});
