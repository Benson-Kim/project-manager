import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, getUploadsEnv } from "../env";

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

  it("defaults to <cwd>/uploads and 2048 MB per project, with no database settings", () => {
    delete process.env.UPLOADS_DIR;
    delete process.env.UPLOADS_QUOTA_MB_PER_PROJECT;
    delete process.env.DB_PASSWORD;
    expect(getUploadsEnv()).toEqual({
      UPLOADS_DIR: path.join(process.cwd(), "uploads"),
      UPLOADS_QUOTA_MB_PER_PROJECT: 2048,
    });
  });

  it("takes an absolute UPLOADS_DIR and a quota", () => {
    const dir = path.resolve("some", "uploads");
    process.env.UPLOADS_DIR = ` ${dir} `;
    process.env.UPLOADS_QUOTA_MB_PER_PROJECT = "500";
    expect(getUploadsEnv()).toEqual({ UPLOADS_DIR: dir, UPLOADS_QUOTA_MB_PER_PROJECT: 500 });
  });

  it.each([
    ["UPLOADS_DIR", "relative/uploads"],
    ["UPLOADS_QUOTA_MB_PER_PROJECT", "0"],
    ["UPLOADS_QUOTA_MB_PER_PROJECT", "lots"],
  ])("rejects %s=%j", (key, value) => {
    process.env[key] = value;
    expect(() => getUploadsEnv()).toThrow();
  });
});
