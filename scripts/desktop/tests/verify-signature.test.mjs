import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { signatureProblems } from "../verify-signature.mjs";

const PUBLIC = "CN=Elian Digital Solutions LLC, O=Elian Digital Solutions LLC, L=Austin, S=Texas, C=US";
const CA = "CN=Microsoft ID Verified CS EOC CA 01, O=Microsoft Corporation, C=US";
const OLD = "CN=Burton Project Manager, O=Burton";
const signed = { Status: "Valid", Subject: PUBLIC, Issuer: CA, Timestamped: true };

describe("signatureProblems (release gate)", () => {
  it("accepts a valid, timestamped signature from the expected publisher", () => {
    expect(signatureProblems(signed, PUBLIC)).toEqual([]);
    expect(
      signatureProblems(signed, "CN=Elian Digital Solutions LLC, O=Elian Digital Solutions LLC, C=US"),
    ).toEqual([]);
  });

  it("refuses a signer installed apps would not accept", () => {
    expect(signatureProblems(signed, PUBLIC.replace("C=US", "C=GB"))).toEqual([
      expect.stringContaining("installed apps expect"),
    ]);
  });

  it("refuses an unsigned, altered or untrusted installer", () => {
    expect(signatureProblems({ Status: "NotSigned", Subject: null, Issuer: null, Timestamped: false }, PUBLIC)).toEqual([
      "not signed (NotSigned)",
    ]);
    expect(signatureProblems({ ...signed, Status: "HashMismatch" }, PUBLIC)).toEqual([
      "signature status HashMismatch",
    ]);
    expect(signatureProblems({ ...signed, Status: "UnknownError" }, PUBLIC)).toEqual([
      "signature status UnknownError",
    ]);
  });

  it("refuses a signature without a timestamp", () => {
    expect(signatureProblems({ ...signed, Timestamped: false }, PUBLIC)).toEqual([
      expect.stringContaining("no RFC 3161 timestamp"),
    ]);
  });

  it("bridging release: the self-issued chain is not trusted on the build machine, and that is all", () => {
    const bridge = { Status: "UnknownError", Subject: OLD, Issuer: OLD, Timestamped: true };
    expect(signatureProblems(bridge, OLD)).toEqual([]);
    expect(signatureProblems({ ...bridge, Status: "HashMismatch" }, OLD)).toEqual([
      "signature status HashMismatch",
    ]);
  });
});

describe("release gate without a publisher", () => {
  const script = fileURLToPath(new URL("../verify-signature.mjs", import.meta.url));
  const env = { ...process.env, PM_PUBLISHER: "" };
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });

  it("exits non-zero so an unsigned installer is not published by accident", () => {
    expect(run("Modulus-Setup-1.2.3.exe").status).toBe(1);
  });

  it("passes only when the unsigned release is allowed explicitly", () => {
    const result = run("--allow-unsigned", "Modulus-Setup-1.2.3.exe");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("::warning::");
  });
});
