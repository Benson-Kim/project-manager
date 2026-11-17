import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { signingConfig, SIGN_EXTS, AZURE_TIMESTAMP, CA_TIMESTAMP } = require("../signing.cjs");

const OLD = "CN=Burton Project Manager, O=Burton";
const NEW = "CN=Elian Digital Solutions LLC, O=Elian Digital Solutions LLC, L=Austin, S=Texas, C=US";
const AZURE = {
  PM_AZURE_SIGN_ENDPOINT: "https://eus.codesigning.azure.net/",
  PM_AZURE_SIGN_ACCOUNT: "modulus-signing",
  PM_AZURE_SIGN_PROFILE: "modulus-public",
  PM_PUBLISHER: NEW,
};
const THUMBPRINT = "0123456789abcdef0123456789abcdef01234567";

describe("signingConfig (ADR-0034)", () => {
  it("unsigned build: no publisher, updates stay unverified, no certificate shipped", () => {
    expect(signingConfig({}, true)).toEqual({
      method: null,
      signed: false,
      publisherName: undefined,
      win: { signExts: SIGN_EXTS },
      shipCertificate: false,
    });
    expect(signingConfig({ CSC_LINK: "   ", PM_AZURE_SIGN_ACCOUNT: " " }, true).signed).toBe(false);
  });

  it("signs every exe, DLL and native module but keeps Microsoft's signature on SQL Server", () => {
    expect(SIGN_EXTS).toEqual(expect.arrayContaining([".dll", ".node", "!SQLEXPR_x64_ENU.exe"]));
  });

  it("Trusted Signing: Azure options, RFC 3161 timestamp, signing failures fail the build", () => {
    const cfg = signingConfig(AZURE, true);
    expect(cfg).toEqual({
      method: "trusted-signing",
      signed: true,
      publisherName: [NEW],
      win: {
        forceCodeSigning: true,
        signExts: SIGN_EXTS,
        azureSignOptions: {
          publisherName: NEW,
          endpoint: AZURE.PM_AZURE_SIGN_ENDPOINT,
          codeSigningAccountName: "modulus-signing",
          certificateProfileName: "modulus-public",
          fileDigest: "SHA256",
          timestampRfc3161: AZURE_TIMESTAMP,
          timestampDigest: "SHA256",
        },
      },
      // A publicly trusted chain: new installs no longer import the self-issued certificate.
      shipCertificate: false,
    });
  });

  it("Trusted Signing needs all three settings and the account's own endpoint", () => {
    const partial = { ...AZURE, PM_AZURE_SIGN_PROFILE: "" };
    expect(() => signingConfig(partial, false)).toThrow(/PM_AZURE_SIGN_PROFILE/);
    for (const endpoint of [
      "http://eus.codesigning.azure.net/",
      "https://eus.codesigning.azure.net.evil.example/",
      "https://example.com/?h=.codesigning.azure.net",
      "eus.codesigning.azure.net",
    ]) {
      expect(
        () => signingConfig({ ...AZURE, PM_AZURE_SIGN_ENDPOINT: endpoint }, false),
        endpoint,
      ).toThrow(/codesigning\.azure\.net/);
    }
  });

  it("a public certificate's subject names the organisation and country, not a bare name", () => {
    for (const subject of ["Modulus", "CN=Modulus", "CN=Modulus, O=Elian"]) {
      expect(() => signingConfig({ ...AZURE, PM_PUBLISHER: subject }, false), subject).toThrow(
        /full subject/,
      );
    }
    const quoted = 'CN="Elian, LLC", O="Elian, LLC", C=US';
    expect(signingConfig({ ...AZURE, PM_PUBLISHER: quoted }, false).publisherName).toEqual([
      quoted,
    ]);
  });

  it("OV fallback: the CA's certificate by thumbprint, SHA-256 with an RFC 3161 timestamp", () => {
    const cfg = signingConfig(
      { PM_SIGN_CERT_SHA1: ` ${THUMBPRINT} `, PM_PUBLISHER: NEW },
      true,
    );
    expect(cfg.method).toBe("certificate-store");
    expect(cfg.win).toEqual({
      forceCodeSigning: true,
      signExts: SIGN_EXTS,
      signtoolOptions: {
        certificateSha1: THUMBPRINT.toUpperCase(),
        signingHashAlgorithms: ["sha256"],
        rfc3161TimeStampServer: CA_TIMESTAMP,
      },
    });
    expect(cfg.shipCertificate).toBe(false);
    expect(() => signingConfig({ PM_SIGN_CERT_SHA1: "abc", PM_PUBLISHER: NEW }, false)).toThrow(
      /thumbprint/,
    );
  });

  it("self-issued PFX: still signs, and ships the certificate provision.ps1 trusts", () => {
    const cfg = signingConfig({ CSC_LINK: "base64…", PM_PUBLISHER: OLD }, true);
    expect(cfg).toMatchObject({ method: "pfx", signed: true, publisherName: [OLD] });
    expect(cfg.win.signtoolOptions).toEqual({
      signingHashAlgorithms: ["sha256"],
      rfc3161TimeStampServer: CA_TIMESTAMP,
    });
    expect(cfg.shipCertificate).toBe(true);
    expect(signingConfig({ WIN_CSC_LINK: "x", PM_PUBLISHER: "CN=A" }, false).shipCertificate).toBe(
      false,
    );
  });

  it("bridging release: signed with the old key, trusts the old and the new subject", () => {
    const bridge = signingConfig(
      { CSC_LINK: "base64…", PM_PUBLISHER: OLD, PM_NEXT_PUBLISHER: NEW },
      true,
    );
    expect(bridge.publisherName).toEqual([OLD, NEW]);
    expect(bridge.method).toBe("pfx");
    expect(
      signingConfig({ ...AZURE, PM_NEXT_PUBLISHER: NEW }, false).publisherName,
    ).toEqual([NEW]);
    expect(() =>
      signingConfig({ CSC_LINK: "x", PM_PUBLISHER: OLD, PM_NEXT_PUBLISHER: "CN=Elian" }, true),
    ).toThrow(/PM_NEXT_PUBLISHER must be the certificate's full subject/);
  });

  it("refuses two signing methods at once", () => {
    expect(() => signingConfig({ ...AZURE, CSC_LINK: "x" }, false)).toThrow(
      /trusted-signing, pfx/,
    );
    expect(() => signingConfig({ PM_SIGN_CERT_SHA1: THUMBPRINT, WIN_CSC_LINK: "x" }, false)).toThrow(
      /exactly one/,
    );
  });

  it("refuses a signature without a publisher: updates would go unverified", () => {
    expect(() => signingConfig({ CSC_LINK: "x" }, true)).toThrow(/PM_PUBLISHER is required/);
    const noPublisher = { ...AZURE, PM_PUBLISHER: "" };
    expect(() => signingConfig(noPublisher, false)).toThrow(/PM_PUBLISHER is required/);
  });

  it("refuses a publisher without a signature: every installed app would refuse the update", () => {
    expect(() => signingConfig({ PM_PUBLISHER: "CN=A" }, true)).toThrow(/no signing method/);
    expect(() => signingConfig({ PM_NEXT_PUBLISHER: NEW }, true)).toThrow(/no signing method/);
  });

  it("refuses signtool signing without a timestamp: signatures would die with the certificate", () => {
    const offline = { ELECTRON_BUILDER_OFFLINE: "true" };
    expect(() => signingConfig({ ...offline, CSC_LINK: "x", PM_PUBLISHER: OLD }, true)).toThrow(
      /without a timestamp/,
    );
    expect(() =>
      signingConfig({ ...offline, PM_SIGN_CERT_SHA1: THUMBPRINT, PM_PUBLISHER: NEW }, true),
    ).toThrow(/without a timestamp/);
    expect(signingConfig({ ...offline, ...AZURE }, true).signed).toBe(true);
  });
});

describe("electron-builder.config.cjs against electron-builder's own schema", () => {
  const CONFIG = require.resolve("../../../electron-builder.config.cjs");
  const { validateConfiguration } = require("app-builder-lib/out/util/config/config.js");
  const { DebugLogger } = require("builder-util");
  const KEYS = [
    ...Object.keys(AZURE),
    "PM_SIGN_CERT_SHA1",
    "CSC_LINK",
    "WIN_CSC_LINK",
    "PM_NEXT_PUBLISHER",
    "PM_UPDATE_URL",
    "PM_UPDATE_FEED",
    "ELECTRON_BUILDER_OFFLINE",
  ];

  const load = (env) => {
    for (const key of KEYS) vi.stubEnv(key, "");
    for (const [key, val] of Object.entries(env)) vi.stubEnv(key, val);
    delete require.cache[CONFIG];
    return require(CONFIG);
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    delete require.cache[CONFIG];
  });

  it.each([
    ["unsigned", {}],
    ["Trusted Signing", AZURE],
    ["OV certificate", { PM_SIGN_CERT_SHA1: THUMBPRINT, PM_PUBLISHER: NEW }],
    ["bridging PFX", { CSC_LINK: "x", PM_PUBLISHER: OLD, PM_NEXT_PUBLISHER: NEW }],
    ["public tester feed", { ...AZURE, PM_UPDATE_URL: "https://downloads.example.com/modulus" }],
  ])("%s: the configuration passes electron-builder's validation", async (_name, env) => {
    const config = load(env);
    await validateConfiguration(config, new DebugLogger(false));
  });

  it("the subjects the app trusts reach app-update.yml through the feed entry", () => {
    const bridge = load({ CSC_LINK: "x", PM_PUBLISHER: OLD, PM_NEXT_PUBLISHER: NEW });
    expect(bridge.publish.map((p) => p.publisherName)).toEqual([[OLD, NEW]]);
    expect(bridge.win.forceCodeSigning).toBe(true);
    const tester = load({ ...AZURE, PM_UPDATE_URL: "https://downloads.example.com/modulus" });
    expect(tester.publish).toEqual([
      {
        provider: "generic",
        url: "https://downloads.example.com/modulus/",
        useMultipleRangeRequest: false,
        publisherName: [NEW],
      },
    ]);
    expect(tester.extraResources.some((e) => String(e.to).endsWith("publisher.cer"))).toBe(false);
    expect(load({}).publish[0].publisherName).toBeUndefined();
  });

  it("fuses: app code only from the verified asar, no inspector or NODE_OPTIONS, Node mode kept for the server", () => {
    expect(load({}).electronFuses).toEqual({
      runAsNode: true,
      onlyLoadAppFromAsar: true,
      enableEmbeddedAsarIntegrityValidation: true,
      enableNodeCliInspectArguments: false,
      enableNodeOptionsEnvironmentVariable: false,
    });
    const electronDir = path.join(path.dirname(CONFIG), "electron");
    const sources = fs
      .readdirSync(electronDir, { recursive: true })
      .filter((f) => /\.ts$/.test(String(f)) && !String(f).includes("tests"))
      .map((f) => fs.readFileSync(path.join(electronDir, String(f)), "utf8"));
    expect(sources.filter((s) => /NODE_OPTIONS|--inspect/.test(s))).toEqual([]);
  });
});
