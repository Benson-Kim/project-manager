import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_COPY_OVERDUE_DAYS, backupSizeMb, copyOverdue, knownCopyOverdue } from "../model";
import { backupStatusFile, readBackupStatus } from "../repository/backup-status";
import {
  MAX_STATUS_MESSAGE,
  backupStatusSchema,
  type BackupStatus,
} from "../schemas/backup-status";

const day1 = new Date("2026-11-01T08:00:00.000Z");
const status: BackupStatus = {
  version: 1,
  lastAttempt: { at: day1.toISOString(), kind: "daily", ok: true },
  lastSuccess: { at: day1.toISOString(), kind: "daily", bytes: 2048 },
  lastCopy: { at: day1.toISOString(), copyDir: "D:\\Copies" },
};
let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-web-backup-status-"));
  file = path.join(dir, "backup-status.json");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backupStatusFile", () => {
  it("is null in the web edition, where the env is empty or unset", () => {
    expect(backupStatusFile({})).toBeNull();
    expect(backupStatusFile({ BACKUP_STATUS_FILE: " " })).toBeNull();
    expect(backupStatusFile({ BACKUP_STATUS_FILE: "backup-status.json" })).toBeNull();
    expect(backupStatusFile({ BACKUP_STATUS_FILE: file })).toBe(file);
  });
});

describe("readBackupStatus", () => {
  it("reads the file the desktop app writes", async () => {
    fs.writeFileSync(file, JSON.stringify(status, null, 2));
    expect(await readBackupStatus(file)).toEqual(status);
  });

  it("is null when nothing is recorded yet, or the file is not the desktop app's", async () => {
    expect(await readBackupStatus(file)).toBeNull();
    for (const bad of [
      "{ not json",
      "null",
      JSON.stringify({ ...status, version: 2 }),
      JSON.stringify({ ...status, extra: true }),
      JSON.stringify({ ...status, lastSuccess: { ...status.lastSuccess, bytes: -1 } }),
      JSON.stringify({ ...status, lastAttempt: { ...status.lastAttempt, kind: "hourly" } }),
      JSON.stringify({ ...status, lastAttempt: { ...status.lastAttempt, at: "yesterday" } }),
    ]) {
      fs.writeFileSync(file, bad);
      expect(await readBackupStatus(file), bad).toBeNull();
    }
  });
});

describe("backupStatusSchema", () => {
  it(`refuses text longer than the desktop app writes (${MAX_STATUS_MESSAGE})`, () => {
    const failed = (error: string) => ({
      ...status,
      lastAttempt: { at: day1.toISOString(), kind: "manual", ok: false, error },
    });
    expect(backupStatusSchema.safeParse(failed("x".repeat(MAX_STATUS_MESSAGE))).success).toBe(true);
    expect(backupStatusSchema.safeParse(failed("x".repeat(MAX_STATUS_MESSAGE + 1))).success).toBe(
      false,
    );
  });
});

describe("copyOverdue", () => {
  const after = (days: number) => new Date(day1.getTime() + days * 24 * 60 * 60 * 1000);

  it("is overdue with no copy at all", () => {
    expect(copyOverdue(null, day1)).toBe(true);
    expect(copyOverdue({ ...status, lastCopy: undefined }, day1)).toBe(true);
  });

  it(`is overdue only after ${BACKUP_COPY_OVERDUE_DAYS} days without a copy`, () => {
    expect(copyOverdue(status, after(BACKUP_COPY_OVERDUE_DAYS))).toBe(false);
    expect(copyOverdue(status, after(BACKUP_COPY_OVERDUE_DAYS + 0.01))).toBe(true);
  });
});

describe("knownCopyOverdue", () => {
  const later = new Date(day1.getTime() + (BACKUP_COPY_OVERDUE_DAYS + 1) * 24 * 60 * 60 * 1000);

  it("says nothing before the first recorded backup", () => {
    expect(knownCopyOverdue(null, later)).toBe(false);
  });

  it("follows copyOverdue once a backup is recorded", () => {
    expect(knownCopyOverdue({ ...status, lastCopy: undefined }, day1)).toBe(true);
    expect(knownCopyOverdue(status, day1)).toBe(false);
    expect(knownCopyOverdue(status, later)).toBe(true);
  });
});

describe("backupSizeMb", () => {
  it("shows megabytes to one decimal place", () => {
    expect(backupSizeMb(0)).toBe("0.0");
    expect(backupSizeMb(15 * 1048576 + 524288)).toBe("15.5");
  });
});
