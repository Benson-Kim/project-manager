import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, getUploadsEnv, uploadsEnabled } from "../env";

describe("env validation (zod at every boundary)", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.DB_PASSWORD = "local-dev-password";
    process.env.DB_SERVER = "dbhost";
    process.env.DB_PORT = "1433";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("parses and coerces valid config", () => {
    const env = getEnv();
    expect(env.DB_SERVER).toBe("dbhost");
    expect(env.DB_PORT).toBe(1433);
    expect(env.DB_NAME).toBe("ProjectManager");
  });

  it("rejects a missing or short DB_PASSWORD", () => {
    process.env.DB_PASSWORD = "short";
    expect(() => getEnv()).toThrow();
  });
});

describe("uploads env (ADR-0026)", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to <cwd>/uploads, 2048 MB per project and a 2048 MB free-space floor, with no database settings", () => {
    delete process.env.UPLOADS_DIR;
    delete process.env.UPLOADS_QUOTA_MB_PER_PROJECT;
    delete process.env.UPLOADS_MIN_FREE_MB;
    delete process.env.DB_PASSWORD;
    expect(getUploadsEnv()).toEqual({
      UPLOADS_DIR: path.join(process.cwd(), "uploads"),
      UPLOADS_QUOTA_MB_PER_PROJECT: 2048,
      UPLOADS_MIN_FREE_MB: 2048,
    });
  });

  it("takes an absolute UPLOADS_DIR, a quota and a floor (0 turns the floor off)", () => {
    const dir = path.resolve("some", "uploads");
    process.env.UPLOADS_DIR = ` ${dir} `;
    process.env.UPLOADS_QUOTA_MB_PER_PROJECT = "500";
    process.env.UPLOADS_MIN_FREE_MB = "0";
    expect(getUploadsEnv()).toEqual({
      UPLOADS_DIR: dir,
      UPLOADS_QUOTA_MB_PER_PROJECT: 500,
      UPLOADS_MIN_FREE_MB: 0,
    });
  });

  it.each([
    ["UPLOADS_DIR", "relative/uploads"],
    ["UPLOADS_QUOTA_MB_PER_PROJECT", "0"],
    ["UPLOADS_QUOTA_MB_PER_PROJECT", "lots"],
    ["UPLOADS_MIN_FREE_MB", "-1"],
    ["UPLOADS_MIN_FREE_MB", "plenty"],
  ])("rejects %s=%j", (key, value) => {
    process.env[key] = value;
    expect(() => getUploadsEnv()).toThrow();
  });

  it.each([
    [undefined, true],
    ["true", true],
    ["", true],
    ["false", false],
    [" FALSE ", false],
  ])("UPLOADS_ENABLED=%j → uploads on: %s (only an explicit false switches them off)", (v, on) => {
    if (v === undefined) delete process.env.UPLOADS_ENABLED;
    else process.env.UPLOADS_ENABLED = v;
    expect(uploadsEnabled()).toBe(on);
  });

  it("answers without validating the folder settings", () => {
    process.env.UPLOADS_ENABLED = "false";
    process.env.UPLOADS_DIR = "relative/uploads";
    expect(uploadsEnabled()).toBe(false);
  });
});
