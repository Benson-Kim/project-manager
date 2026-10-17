import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupDatabase, latestBackup } from "../backup";

const db = vi.hoisted(() => ({ verifyFails: false }));

vi.mock("../db", () => ({
  sql: { NVarChar: "NVarChar" },
  quoteName: (name: string) => `[${name}]`,
  connect: async () => ({
    close: async () => undefined,
    request: () => {
      const inputs: Record<string, string> = {};
      const req = {
        input: (name: string, _type: unknown, value: string) => {
          inputs[name] = value;
          return req;
        },
        batch: async (text: string) => {
          if (text.startsWith("BACKUP DATABASE")) {
            fs.writeFileSync(inputs.file!, "backup bytes");
            return {};
          }
          if (db.verifyFails) throw new Error("The backup set on file 1 is not valid.");
          return {};
        },
      };
      return req;
    },
  }),
}));

const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const target = {
  host: "127.0.0.1",
  port: 1433,
  user: "pm",
  password: "x",
  database: "ProjectManager",
};
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-backup-"));
  db.verifyFails = false;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backupDatabase", () => {
  it("keeps a verified backup", async () => {
    const result = await backupDatabase("daily", { target, backupDir: dir, log: log as never });
    expect(fs.existsSync(result.file)).toBe(true);
    expect((await latestBackup(dir, target.database))?.file).toBe(result.file);
  });

  it("removes a backup that failed verification, so the hourly check retries", async () => {
    db.verifyFails = true;
    await expect(
      backupDatabase("daily", { target, backupDir: dir, log: log as never }),
    ).rejects.toThrow("not valid");
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(await latestBackup(dir, target.database)).toBeNull();
  });
});
