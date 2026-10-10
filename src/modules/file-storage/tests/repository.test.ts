import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({
  execProc: (...args: unknown[]) => execProc(...args) as Promise<unknown[]>,
}));

import {
  addFileAttachment,
  addLocationAttachment,
  checkCanAddAttachment,
  getStoredFile,
  listAttachments,
  listRetainedHashes,
  removeAttachment,
  renameAttachment,
} from "../repository/attachments";

const HASH = "a".repeat(64);

function attachmentDbRow(overrides: Record<string, unknown> = {}) {
  return {
    FileAttachmentId: 5,
    FileName: "Plan.pdf",
    ContentType: "application/pdf",
    SizeBytes: "2048",
    StorageLocation: null,
    CreatedAtUtc: new Date("2026-10-10T08:00:00Z"),
    CreatedByName: "Grace",
    RowVer: "900",
    ...overrides,
  };
}

const call = (i = 0) => execProc.mock.calls[i] as [string, Record<string, unknown>];

describe("attachments repository (ADR-0026): the owner's procs, no role ever sent", () => {
  beforeEach(() => {
    execProc.mockReset();
  });

  it("lists through the owner's ListFiles with its id parameter", async () => {
    execProc.mockResolvedValue([attachmentDbRow(), attachmentDbRow({ FileAttachmentId: 6 })]);
    const rows = await listAttachments("daily-activity", 12, 7);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ SizeBytes: 2048, RowVer: 900 });
    expect(call()).toEqual([
      "usp_DailyActivity_ListFiles",
      { DailyActivityId: 12, ActorUserId: 7 },
    ]);
  });

  it("parses a location row (no size or type)", async () => {
    execProc.mockResolvedValue([
      attachmentDbRow({ ContentType: null, SizeBytes: null, StorageLocation: "\\\\fs\\x" }),
    ]);
    const [row] = await listAttachments("daily-activity", 12, 7);
    expect(row).toMatchObject({ SizeBytes: null, ContentType: null, StorageLocation: "\\\\fs\\x" });
  });

  it("fails loudly on DB drift", async () => {
    execProc.mockResolvedValue([attachmentDbRow({ FileName: null })]);
    await expect(listAttachments("daily-activity", 12, 7)).rejects.toThrow();
  });

  it("pre-checks with CanAddFile and coerces the BIGINT sum", async () => {
    execProc.mockResolvedValue([{ ProjectId: 3, UsedBytes: "123456789012" }]);
    expect(await checkCanAddAttachment("daily-activity", 12, 7)).toEqual({
      ProjectId: 3,
      UsedBytes: 123456789012,
    });
    expect(call()).toEqual([
      "usp_DailyActivity_CanAddFile",
      { DailyActivityId: 12, ActorUserId: 7 },
    ]);
  });

  it("records an uploaded file with its quota", async () => {
    execProc.mockResolvedValue([attachmentDbRow()]);
    await addFileAttachment(
      "daily-activity",
      12,
      {
        fileName: "Plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
        sha256: HASH,
        storagePath: `aa/aa/${HASH}`,
      },
      1000,
      7,
    );
    expect(call()).toEqual([
      "usp_DailyActivity_AddFile",
      {
        DailyActivityId: 12,
        FileName: "Plan.pdf",
        ContentType: "application/pdf",
        SizeBytes: 2048,
        Sha256: HASH,
        StoragePath: `aa/aa/${HASH}`,
        StorageLocation: null,
        QuotaBytes: 1000,
        ActorUserId: 7,
      },
    ]);
  });

  it("records a location without bytes", async () => {
    execProc.mockResolvedValue([attachmentDbRow({ SizeBytes: null, StorageLocation: "Drawer" })]);
    await addLocationAttachment("daily-activity", 12, "Contract", "Drawer", 7);
    expect(call()).toEqual([
      "usp_DailyActivity_AddFile",
      { DailyActivityId: 12, FileName: "Contract", StorageLocation: "Drawer", ActorUserId: 7 },
    ]);
  });

  it("gets a stored file by attachment id", async () => {
    execProc.mockResolvedValue([
      {
        FileAttachmentId: 5,
        FileName: "Plan.pdf",
        ContentType: "application/pdf",
        SizeBytes: "2048",
        Sha256: HASH,
        StoragePath: `aa/aa/${HASH}`,
        StorageLocation: null,
      },
    ]);
    expect((await getStoredFile("daily-activity", 5, 7)).SizeBytes).toBe(2048);
    expect(call()).toEqual(["usp_DailyActivity_GetFile", { FileAttachmentId: 5, ActorUserId: 7 }]);
  });

  it("answers NOT_FOUND when a proc returns no row", async () => {
    execProc.mockResolvedValue([]);
    await expect(getStoredFile("daily-activity", 5, 7)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("renames and removes with the row version", async () => {
    execProc.mockResolvedValueOnce([attachmentDbRow({ FileName: "New.pdf" })]);
    expect((await renameAttachment("daily-activity", 5, "New", 900, 7)).FileName).toBe("New.pdf");
    execProc.mockResolvedValueOnce([]);
    await removeAttachment("daily-activity", 5, 900, 7);
    expect(call(0)).toEqual([
      "usp_DailyActivity_RenameFile",
      { FileAttachmentId: 5, FileName: "New", RowVer: 900, ActorUserId: 7 },
    ]);
    expect(call(1)).toEqual([
      "usp_DailyActivity_RemoveFile",
      { FileAttachmentId: 5, RowVer: 900, ActorUserId: 7 },
    ]);
  });

  it("lists the hashes the sweep must keep", async () => {
    execProc.mockResolvedValue([{ Sha256: HASH }, { Sha256: "b".repeat(64) }]);
    expect(await listRetainedHashes(30, 1)).toEqual(new Set([HASH, "b".repeat(64)]));
    expect(call()).toEqual(["usp_FileAttachment_ListRetained", { GraceDays: 30, ActorUserId: 1 }]);
  });

  it("never sends a role: procs read it from the actor (ADR-0021)", async () => {
    execProc.mockResolvedValue([attachmentDbRow()]);
    await listAttachments("daily-activity", 1, 7);
    await renameAttachment("daily-activity", 1, "x", 1, 7);
    for (const [, params] of execProc.mock.calls as [string, Record<string, unknown>][]) {
      expect(Object.keys(params)).not.toContain("ActorRole");
    }
  });
});
