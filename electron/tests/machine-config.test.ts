import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMachineConfig, SetupRequiredError } from "../machine-config";

let dir: string;
const file = () => path.join(dir, "machine.json");

const v1 = {
  schemaVersion: 1,
  sql: {
    instanceName: "PROJECTMGR",
    host: "127.0.0.1",
    port: 14330,
    database: "ProjectManager",
    user: "pm_app",
    password: "x".repeat(32),
  },
  authSecret: "s".repeat(44),
  backupDir: "C:\\ProgramData\\Project Manager\\Backups",
  provisionedAtUtc: "2026-10-09T10:00:00.000Z",
};

function write(content: unknown) {
  fs.writeFileSync(file(), typeof content === "string" ? content : JSON.stringify(content));
}

function setupError(): SetupRequiredError {
  try {
    readMachineConfig(file());
  } catch (err) {
    if (err instanceof SetupRequiredError) return err;
    throw err;
  }
  throw new Error("expected SetupRequiredError");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-machine-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("readMachineConfig (ADR-0026 §9)", () => {
  it("reads a config with the uploads folder (what provision.ps1 writes since F1)", () => {
    write({ ...v1, uploadsDir: "C:\\ProgramData\\Project Manager\\Uploads" });
    expect(readMachineConfig(file()).uploadsDir).toBe("C:\\ProgramData\\Project Manager\\Uploads");
  });

  it("accepts a UTF-8 BOM (Windows PowerShell)", () => {
    write(`\uFEFF${JSON.stringify({ ...v1, uploadsDir: "U" })}`);
    expect(readMachineConfig(file()).uploadsDir).toBe("U");
  });

  it("asks for the short one-time Repair on a PC provisioned before F1", () => {
    write(v1);
    const err = setupError();
    expect(err.kind).toBe("upgrade");
    expect(err.message).toMatch(/attachments/);
  });

  it("keeps schemaVersion 1: a newer number is refused like before (1.0.x apps do the same)", () => {
    write({ ...v1, schemaVersion: 2, uploadsDir: "U" });
    expect(setupError().kind).toBe("setup");
  });

  it.each([
    ["missing", null],
    ["unreadable", "{not json"],
    ["incomplete", { ...v1, sql: { ...v1.sql, password: "" }, uploadsDir: "U" }],
  ])("a %s config needs the full setup", (_l, content) => {
    if (content !== null) write(content);
    expect(setupError().kind).toBe("setup");
  });
});
