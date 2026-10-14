import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../log";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-log-"));
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const files = () => fs.readdirSync(dir).sort();

describe("createLogger", () => {
  it("rotates while running, keeping three old files", () => {
    const log = createLogger(dir, "main.log", 200);
    for (let i = 0; i < 40; i++) log.info(`line ${i} ${"x".repeat(40)}`);
    expect(files()).toEqual(["main.log", "main.log.1", "main.log.2", "main.log.3"]);
    expect(fs.statSync(path.join(dir, "main.log")).size).toBeLessThanOrEqual(200);
    expect(fs.readFileSync(path.join(dir, "main.log"), "utf8")).toContain("line 39");
  });

  it("rotates a file that is already too big on its first write", () => {
    fs.writeFileSync(path.join(dir, "main.log"), "x".repeat(500));
    createLogger(dir, "main.log", 200).info("after start");
    expect(fs.statSync(path.join(dir, "main.log.1")).size).toBe(500);
    expect(fs.readFileSync(path.join(dir, "main.log"), "utf8")).toContain("after start");
  });

  it("swallows a console that went away (EPIPE) instead of an uncaught exception", () => {
    createLogger(dir);
    const listeners = [
      process.stdout.listenerCount("error"),
      process.stderr.listenerCount("error"),
    ];
    createLogger(dir, "other.log");
    // Guarded once per process, however many loggers there are.
    expect([process.stdout.listenerCount("error"), process.stderr.listenerCount("error")]).toEqual(
      listeners,
    );
    const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    expect(() => process.stdout.emit("error", epipe)).not.toThrow();
    expect(() => process.stderr.emit("error", epipe)).not.toThrow();
  });

  it("keeps logging to the file when the console write throws", () => {
    vi.mocked(process.stdout.write).mockImplementation(() => {
      throw new Error("write EPIPE");
    });
    const log = createLogger(dir);
    expect(() => log.info("still here")).not.toThrow();
    expect(fs.readFileSync(log.file, "utf8")).toContain("still here");
  });
});
