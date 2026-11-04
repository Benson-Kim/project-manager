import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_COPY_OVERDUE_DAYS,
  MAX_STATUS_MESSAGE,
  copyOverdue,
  nextBackupStatus,
  readBackupStatus,
  recordBackup,
} from "../backup-status";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), file: "main.log" };
const ok = { file: "a.bak", copy: "D:\\Copies\\a.bak", bytes: 2048 };
const day1 = new Date("2026-11-01T08:00:00Z");
const day2 = new Date("2026-11-02T08:00:00Z");
let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-backup-status-"));
  file = path.join(dir, "backup-status.json");
  log.warn.mockClear();
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("recordBackup", () => {
  it("writes the run whole and leaves no temporary file", async () => {
    await recordBackup(file, "daily", { result: ok, copyDir: "D:\\Copies" }, log, day1);
    expect(await readBackupStatus(file)).toEqual({
      version: 1,
      lastAttempt: { at: day1.toISOString(), kind: "daily", ok: true },
      lastSuccess: { at: day1.toISOString(), kind: "daily", bytes: 2048 },
      lastCopy: { at: day1.toISOString(), copyDir: "D:\\Copies" },
    });
    expect(fs.readdirSync(dir)).toEqual(["backup-status.json"]);
  });

  it("keeps the last success and copy when a run fails", async () => {
    await recordBackup(file, "daily", { result: ok, copyDir: "D:\\Copies" }, log, day1);
    await recordBackup(file, "manual", { error: new Error("disk full") }, log, day2);
    const status = await readBackupStatus(file);
    expect(status?.lastAttempt).toEqual({
      at: day2.toISOString(),
      kind: "manual",
      ok: false,
      error: "disk full",
    });
    expect(status?.lastSuccess?.at).toBe(day1.toISOString());
    expect(status?.lastCopy?.at).toBe(day1.toISOString());
  });

  it("starts again from a file it cannot read", async () => {
    fs.writeFileSync(file, "{ not json");
    await recordBackup(file, "pre-upgrade", { result: { file: "a.bak", bytes: 1 } }, log, day1);
    expect((await readBackupStatus(file))?.lastAttempt.kind).toBe("pre-upgrade");
  });

  it("never throws when the file cannot be written, and logs why", async () => {
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "");
    await expect(
      recordBackup(path.join(blocker, "backup-status.json"), "daily", { result: ok }, log, day1),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledOnce();
  });
});

describe("nextBackupStatus", () => {
  it("a copy that failed part way keeps the older copy; a finished one clears the error", () => {
    const first = nextBackupStatus(null, "daily", { result: ok, copyDir: "D:\\Copies" }, day1);
    const failed = nextBackupStatus(
      first,
      "daily",
      { result: { ...ok, copyError: "2 attachment file(s) are damaged" }, copyDir: "D:\\Copies" },
      day2,
    );
    expect(failed.lastCopy?.at).toBe(day1.toISOString());
    expect(failed.lastCopyError).toEqual({
      at: day2.toISOString(),
      copyDir: "D:\\Copies",
      message: "2 attachment file(s) are damaged",
    });
    const fixed = nextBackupStatus(failed, "manual", { result: ok, copyDir: "D:\\Copies" }, day2);
    expect(fixed.lastCopy?.at).toBe(day2.toISOString());
    expect(fixed.lastCopyError).toBeUndefined();
  });

  it("records no copy without a copy folder", () => {
    const status = nextBackupStatus(null, "daily", { result: ok }, day1);
    expect(status.lastCopy).toBeUndefined();
    expect(status.lastCopyError).toBeUndefined();
  });

  it("keeps error text to the length the web reader accepts", () => {
    const status = nextBackupStatus(null, "daily", { error: "x".repeat(5000) }, day1);
    expect(status.lastAttempt.error).toHaveLength(MAX_STATUS_MESSAGE);
  });
});

describe("copyOverdue", () => {
  const copied = nextBackupStatus(null, "daily", { result: ok, copyDir: "D:\\Copies" }, day1);
  const after = (days: number) => new Date(day1.getTime() + days * 24 * 60 * 60 * 1000);

  it("is overdue with no copy at all", () => {
    expect(copyOverdue(null, day1)).toBe(true);
    expect(copyOverdue(nextBackupStatus(null, "daily", { result: ok }, day1), day1)).toBe(true);
  });

  it(`is overdue only after ${BACKUP_COPY_OVERDUE_DAYS} days without a copy`, () => {
    expect(copyOverdue(copied, after(BACKUP_COPY_OVERDUE_DAYS))).toBe(false);
    expect(copyOverdue(copied, after(BACKUP_COPY_OVERDUE_DAYS + 0.01))).toBe(true);
  });
});
