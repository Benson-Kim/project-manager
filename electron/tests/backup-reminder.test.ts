import { describe, expect, it } from "vitest";
import {
  COPY_REMINDER_INTERVAL_MS,
  copyReminder,
  knownCopyOverdue,
  reminderDue,
} from "../backup-reminder";
import type { BackupStatus } from "../backup-status";
import { COPY_NOW_LABEL } from "../tray-menu";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-11-10T09:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const status = (lastCopyAgo?: number): BackupStatus => ({
  version: 1,
  lastAttempt: { at: ago(HOUR).toISOString(), kind: "daily", ok: true },
  lastSuccess: { at: ago(HOUR).toISOString(), kind: "daily", bytes: 2048 },
  ...(lastCopyAgo === undefined
    ? {}
    : { lastCopy: { at: ago(lastCopyAgo).toISOString(), copyDir: "D:\\Copies" } }),
});

describe("knownCopyOverdue", () => {
  it("is never overdue on no status, so a first start or an update never reminds on a guess", () => {
    expect(knownCopyOverdue(null, now)).toBe(false);
    expect(reminderDue(null, null, now)).toBe(false);
  });

  it("follows the backup status's seven-day rule", () => {
    expect(knownCopyOverdue(status(6 * DAY), now)).toBe(false);
    expect(knownCopyOverdue(status(8 * DAY), now)).toBe(true);
    expect(knownCopyOverdue(status(), now)).toBe(true);
  });
});

describe("reminderDue", () => {
  it("reminds when copies are overdue and no reminder has been shown", () => {
    expect(reminderDue(status(8 * DAY), null, now)).toBe(true);
    expect(reminderDue(status(), null, now)).toBe(true);
  });

  it("stays quiet while copies are current", () => {
    expect(reminderDue(status(6 * DAY), null, now)).toBe(false);
  });

  it("reminds at most once a day", () => {
    expect(reminderDue(status(8 * DAY), ago(23 * HOUR), now)).toBe(false);
    expect(reminderDue(status(8 * DAY), ago(COPY_REMINDER_INTERVAL_MS), now)).toBe(true);
    expect(reminderDue(status(8 * DAY), ago(25 * HOUR), now)).toBe(true);
  });
});

describe("copyReminder", () => {
  it("names the copy folder and the tray item that fixes it", () => {
    const { title, content } = copyReminder("D:\\Copies", status(8 * DAY));
    expect(title).toBe("Backups are not being copied");
    expect(content).toContain("D:\\Copies");
    expect(content).toContain("7 days");
    expect(content).toContain(COPY_NOW_LABEL);
  });

  it("claims no seven days when nothing has ever been copied", () => {
    const { content } = copyReminder("D:\\Copies", status());
    expect(content).not.toContain("days");
    expect(content).toContain("D:\\Copies");
    expect(content).toContain(COPY_NOW_LABEL);
  });
});
