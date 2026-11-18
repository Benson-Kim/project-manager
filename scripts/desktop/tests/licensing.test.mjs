import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { licensingConfig } = require("../licensing.cjs");

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
const privateKey = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
const keys = JSON.stringify({ k1: publicKey });
const url = "https://licence.example.test/";

describe("licensingConfig", () => {
  it("is off by default", () => {
    expect(licensingConfig({})).toEqual({ enforce: false, publicKeys: {}, serviceUrl: "" });
  });

  it("enforces when both public values are set", () => {
    expect(
      licensingConfig({ PM_LICENSING: "enforce", PM_LICENCE_PUBLIC_KEYS: keys, PM_LICENCE_SERVICE_URL: url }),
    ).toEqual({ enforce: true, publicKeys: { k1: publicKey }, serviceUrl: url });
  });

  it("keeps the keys and address in a build that does not enforce", () => {
    expect(licensingConfig({ PM_LICENCE_PUBLIC_KEYS: keys, PM_LICENCE_SERVICE_URL: url })).toEqual({
      enforce: false,
      publicKeys: { k1: publicKey },
      serviceUrl: url,
    });
  });

  it.each([
    [{ PM_LICENCE_SERVICE_URL: url }, /PM_LICENCE_PUBLIC_KEYS/],
    [{ PM_LICENCE_PUBLIC_KEYS: keys }, /PM_LICENCE_SERVICE_URL/],
    [{}, /PM_LICENCE_PUBLIC_KEYS and PM_LICENCE_SERVICE_URL/],
    [{ PM_LICENCE_PUBLIC_KEYS: "{}", PM_LICENCE_SERVICE_URL: url }, /PM_LICENCE_PUBLIC_KEYS/],
  ])("stops an enforcing build missing a value (%#)", (env, message) => {
    expect(() => licensingConfig({ PM_LICENSING: "enforce", ...env })).toThrow(message);
  });

  it.each(["Enforce", "on", "true", "enforce "])
  ("treats only an exact mode as enforcing: %j", (mode) => {
    if (mode.trim() === "enforce") {
      expect(
        licensingConfig({ PM_LICENSING: mode, PM_LICENCE_PUBLIC_KEYS: keys, PM_LICENCE_SERVICE_URL: url }).enforce,
      ).toBe(true);
    } else {
      expect(() => licensingConfig({ PM_LICENSING: mode })).toThrow(/PM_LICENSING/);
    }
  });

  it("rejects a private key pasted in place of the public one", () => {
    expect(() => licensingConfig({ PM_LICENCE_PUBLIC_KEYS: JSON.stringify({ k1: privateKey }) })).toThrow(
      /never a private key/,
    );
  });

  it.each(['["k1"]', '"k1"', "null", "not json", JSON.stringify({ k1: 42 }), JSON.stringify({ k1: "AAAA" })])(
    "rejects keys that are not an object of public keys: %s",
    (value) => {
      expect(() => licensingConfig({ PM_LICENCE_PUBLIC_KEYS: value })).toThrow(/PM_LICENCE_PUBLIC_KEYS/);
    },
  );

  it.each([
    "http://licence.example.test/",
    "https://user:pw@licence.example.test/",
    "https://licence.example.test/?token=x",
    "https://licence.example.test/#x",
    "licence.example.test",
  ])("rejects a service address that is not plain https: %s", (value) => {
    expect(() => licensingConfig({ PM_LICENCE_SERVICE_URL: value })).toThrow(/PM_LICENCE_SERVICE_URL/);
  });
});
