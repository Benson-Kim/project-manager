import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { BACKUP_COPY_OVERDUE_DAYS, knownCopyOverdue } from "@/modules/backup/model";
import { BACKUP_KINDS, MAX_STATUS_MESSAGE } from "@/modules/backup/schemas/backup-status";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const constant = (source: string, name: string) =>
  Number(new RegExp(`export const ${name} = (\\d+);`).exec(source)?.[1]);

/**
 * electron/ never imports src/, so the desktop's writer and the web's reader each keep their own
 * copy of the backup-status rules. This keeps the two copies the same.
 */
describe("backup status: desktop writer and web reader agree", () => {
  const writer = read("electron/backup-status.ts");

  it("on the days before a copy is overdue", () => {
    expect(constant(writer, "BACKUP_COPY_OVERDUE_DAYS")).toBe(BACKUP_COPY_OVERDUE_DAYS);
  });

  it("on a missing file being unknown, not overdue", () => {
    expect(knownCopyOverdue(null, new Date())).toBe(false);
    expect(read("electron/backup-reminder.ts")).toMatch(
      /return status !== null && copyOverdue\(status, now\);/,
    );
  });

  it("on the longest error text", () => {
    expect(constant(writer, "MAX_STATUS_MESSAGE")).toBe(MAX_STATUS_MESSAGE);
  });

  it("on the kinds of backup", () => {
    const union = /export type BackupKind = ([^;]+);/.exec(read("electron/backup.ts"))?.[1] ?? "";
    expect([...union.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(
      [...BACKUP_KINDS].sort(),
    );
  });

  it("on the env that carries the file's path", () => {
    expect(read("electron/next-server.ts")).toContain("BACKUP_STATUS_FILE:");
    expect(read("src/modules/backup/repository/backup-status.ts")).toContain(
      "env.BACKUP_STATUS_FILE",
    );
  });
});
