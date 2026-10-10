import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv } from "../env";

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
