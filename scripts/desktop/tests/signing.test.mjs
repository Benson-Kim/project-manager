import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { signingConfig } = require("../signing.cjs");

describe("signingConfig (ADR-0034)", () => {
  it("unsigned build: no publisher, updates stay unverified as before", () => {
    expect(signingConfig({}, false)).toEqual({
      signed: false,
      publisherName: undefined,
      shipCertificate: false,
    });
    expect(signingConfig({ CSC_LINK: "   " }, true).signed).toBe(false);
  });

  it("signed build: the publisher's subject travels into app-update.yml", () => {
    const cfg = signingConfig(
      { CSC_LINK: "base64…", PM_PUBLISHER: "CN=Burton Project Manager, O=Burton" },
      true,
    );
    expect(cfg).toEqual({
      signed: true,
      publisherName: ["CN=Burton Project Manager, O=Burton"],
      shipCertificate: true,
    });
    expect(signingConfig({ WIN_CSC_LINK: "x", PM_PUBLISHER: "CN=A" }, false).signed).toBe(true);
  });

  it("refuses a certificate without a publisher: updates would go unverified", () => {
    expect(() => signingConfig({ CSC_LINK: "x" }, true)).toThrow(/PM_PUBLISHER is required/);
  });

  it("refuses a publisher without a certificate: every installed app would refuse the update", () => {
    expect(() => signingConfig({ PM_PUBLISHER: "CN=A" }, true)).toThrow(/no certificate/);
  });
});
