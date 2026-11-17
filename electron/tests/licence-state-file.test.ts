import { randomBytes } from "crypto";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { SealedStateFile, type Sealer } from "../licence/state-file";

const sealer: Sealer = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(plain),
  decryptString: (sealed) => sealed.toString(),
};

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function storedWith(markKey: string): SealedStateFile {
  const dir = mkdtempSync(join(tmpdir(), "licence-state-"));
  dirs.push(dir);
  const path = join(dir, "state.bin");
  const mark = { at: 1, mac: "x" };
  writeFileSync(path, JSON.stringify({ licence: null, checkIn: null, mark, markKey }));
  return new SealedStateFile(path, sealer);
}

describe("sealed licence state file", () => {
  it("keeps a stored 32-byte mark key", () => {
    const key = randomBytes(32).toString("base64url");
    const state = storedWith(key).read();
    expect(state.markKey).toBe(key);
    expect(state.mark).toEqual({ at: 1, mac: "x" });
  });

  it.each([
    ["43 characters that are not base64url", "!".repeat(43)],
    ["31 bytes", randomBytes(31).toString("base64url")],
    ["empty", ""],
  ])("starts again with a new 32-byte key when the stored key is %s", (_, key) => {
    const state = storedWith(key).read();
    expect(Buffer.from(state.markKey, "base64url").length).toBe(32);
    expect(state.markKey).not.toBe(key);
    expect(state.mark).toBeNull();
  });
});
