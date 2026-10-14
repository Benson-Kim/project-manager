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
}));

const sweep = vi.fn();
vi.mock("@/lib/files/sweep", () => ({
  SWEEP_GRACE_DAYS: 30,
  sweepOrphanFiles: (...args: unknown[]) => sweep(...args) as unknown,
}));
vi.mock("@/lib/files/store", () => ({ uploadsRoot: () => Promise.resolve("/uploads") }));

import { AppError } from "@/lib/errors";
import { messages } from "@/lib/messages";
import {
  addLocationAction,
  removeAttachmentAction,
  renameAttachmentAction,
  sweepOrphanFilesAction,
} from "../actions";

const row = {
  FileAttachmentId: 5,
  FileName: "Plan.pdf",
  ContentType: "application/pdf",
  SizeBytes: 10,
  StorageLocation: null,
  CreatedAtUtc: new Date("2026-10-10T08:00:00Z"),
  CreatedByName: "Grace",
  RowVer: 9,
};

describe("attachment actions (ADR-0026)", () => {
  beforeEach(() => {
    session = { userId: 7, username: "pm", role: "User" };
    execProc.mockReset();
    sweep.mockReset();
  });

  it("renames with a cleaned name through the owner's proc", async () => {
    execProc.mockResolvedValue([row]);
    const result = await renameAttachmentAction({
      owner: "daily-activity",
      fileAttachmentId: "5",
      rowVer: "9",
      fileName: "  Plan\r\n/v2 ",
    });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_DailyActivity_RenameFile", {
      FileAttachmentId: 5,
      FileName: "Planv2",
      RowVer: 9,
      ActorUserId: 7,
    });
  });

  it("refuses a name with nothing left after cleaning, without calling the proc", async () => {
    const result = await renameAttachmentAction({
      owner: "daily-activity",
      fileAttachmentId: 5,
      rowVer: 9,
      fileName: " /// ",
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { fileName: [messages.attachments.errors.nameRequired] },
      },
    });
    expect(execProc).not.toHaveBeenCalled();
  });

  it("refuses an unknown owner", async () => {
    const result = await removeAttachmentAction({ owner: "user", fileAttachmentId: 5, rowVer: 9 });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(execProc).not.toHaveBeenCalled();
  });

  it("removes and reports the id", async () => {
    execProc.mockResolvedValue([]);
    expect(
      await removeAttachmentAction({ owner: "daily-activity", fileAttachmentId: 5, rowVer: 9 }),
    ).toEqual({ ok: true, data: { fileAttachmentId: 5 } });
  });

  it("maps the proc's access refusal (a Viewer) to FORBIDDEN_ROW", async () => {
    execProc.mockRejectedValue(new AppError("FORBIDDEN_ROW", "no"));
    const result = await removeAttachmentAction({
      owner: "daily-activity",
      fileAttachmentId: 5,
      rowVer: 9,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN_ROW" } });
  });

  it("adds a location, trimmed", async () => {
    execProc.mockResolvedValue([{ ...row, SizeBytes: null, StorageLocation: "\\\\fs\\a" }]);
    const result = await addLocationAction({
      owner: "daily-activity",
      ownerId: "12",
      fileName: "Contract",
      storageLocation: "  \\\\fs\\a  ",
    });
    expect(result.ok).toBe(true);
    expect(execProc).toHaveBeenCalledWith("usp_DailyActivity_AddFile", {
      DailyActivityId: 12,
      FileName: "Contract",
      StorageLocation: "\\\\fs\\a",
      ActorUserId: 7,
    });
  });

  it.each([
    ["", messages.attachments.errors.locationRequired],
    ["x".repeat(501), undefined],
    ["line\nbreak", messages.attachments.errors.locationRequired],
  ])("refuses the location %j", async (storageLocation, message) => {
    const result = await addLocationAction({
      owner: "daily-activity",
      ownerId: 12,
      fileName: "Contract",
      storageLocation,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && message) expect(result.error.fieldErrors?.storageLocation).toContain(message);
    expect(execProc).not.toHaveBeenCalled();
  });

  it("the sweep is refused to a User before any proc runs", async () => {
    const result = await sweepOrphanFilesAction({});
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(execProc).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
  });

  it("the sweep keeps the hashes the proc retains", async () => {
    session = { userId: 1, username: "admin", role: "Admin" };
    execProc.mockResolvedValue([{ Sha256: "a".repeat(64) }]);
    sweep.mockResolvedValue({ deleted: 2, kept: 1, tempDeleted: 0 });
    const result = await sweepOrphanFilesAction({});
    expect(result).toEqual({ ok: true, data: { deleted: 2, kept: 1, tempDeleted: 0 } });
    expect(sweep).toHaveBeenCalledWith("/uploads", new Set(["a".repeat(64)]), { graceDays: 30 });
  });

  it("the sweep has nothing to do while uploads are off (ADR-0026 §9)", async () => {
    session = { userId: 1, username: "admin", role: "Admin" };
    vi.stubEnv("UPLOADS_ENABLED", "false");
    try {
      const result = await sweepOrphanFilesAction({});
      expect(result).toEqual({ ok: true, data: { deleted: 0, kept: 0, tempDeleted: 0 } });
      expect(execProc).not.toHaveBeenCalled();
      expect(sweep).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
