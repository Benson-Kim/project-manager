import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "crypto";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_AUDIENCE,
  DOCUMENT_ISSUER,
  evaluate,
  licensingEnforced,
  OFFLINE_GRACE,
  openCheckIn,
  openLicence,
  readMark,
  sealMark,
  trustedNow,
  type Licence,
} from "../licence/policy";

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 17);
const machine = "a".repeat(64);
const pair = generateKeyPairSync("ed25519");
const keys = { k1: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url") };

function signDoc(body: object, privateKey: KeyObject = pair.privateKey, kid = "k1") {
  const claims = {
    typ: "nonce" in body ? "checkin" : "licence",
    aud: DOCUMENT_AUDIENCE,
    iss: DOCUMENT_ISSUER,
  };
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims, ...body })).toString("base64url");
  return {
    kid,
    payload,
    sig: sign(null, Buffer.from(payload, "ascii"), privateKey).toString("base64url"),
  };
}

const trialBody = {
  licenceId: "L".repeat(22),
  kind: "trial",
  machineHash: machine,
  emailHash: "e".repeat(64),
  issuedAt: START,
  startsAt: START,
  expiresAt: START + 14 * DAY,
  updatesUntil: null,
};
const trial = openLicence(signDoc(trialBody), keys) as Licence;
const full: Licence = { ...trial, kind: "full", expiresAt: null };
const base = { enforce: true, licence: trial, machineHash: machine, markTrusted: true };

describe("licence policy", () => {
  it("keeps an install with no licence state off unless the build enforces licensing", () => {
    expect(licensingEnforced({ name: "modulus" })).toBe(false);
    expect(licensingEnforced({ licensing: "Enforce" })).toBe(false);
    expect(licensingEnforced(null)).toBe(false);
    expect(licensingEnforced({ licensing: "enforce" })).toBe(true);
    const noState = {
      licence: null,
      machineHash: machine,
      now: START,
      lastServerTime: null,
      markTrusted: false,
    };
    expect(evaluate({ ...noState, enforce: false })).toBe("off");
    expect(evaluate({ ...base, enforce: false, now: START + 99 * DAY, lastServerTime: null })).toBe(
      "off",
    );
    expect(evaluate({ ...noState, enforce: true })).toBe("unlicensed");
  });

  it("never locks a full or free licence, even long offline", () => {
    const offline = { now: START + 400 * DAY, lastServerTime: START, markTrusted: false };
    expect(evaluate({ ...base, ...offline, licence: full })).toBe("active");
    expect(evaluate({ ...base, ...offline, licence: { ...full, kind: "free" } })).toBe("active");
  });

  it("rejects a tampered, foreign or unknown-key licence", () => {
    const doc = signDoc(trialBody);
    const forged = Buffer.from(JSON.stringify({ ...trialBody, v: 1, kind: "full" })).toString(
      "base64url",
    );
    expect(openLicence({ ...doc, payload: forged }, keys)).toBeNull();
    expect(
      openLicence(signDoc(trialBody, generateKeyPairSync("ed25519").privateKey), keys),
    ).toBeNull();
    expect(openLicence(signDoc(trialBody, pair.privateKey, "k2"), keys)).toBeNull();
    expect(openLicence(signDoc({ ...trialBody, kind: "lifetime" }), keys)).toBeNull();
    expect(openLicence({ kid: "k1", payload: "x", sig: "y" }, keys)).toBeNull();
    expect(openLicence("not a document", keys)).toBeNull();
    expect(
      evaluate({
        ...base,
        licence: { ...trial, machineHash: "b".repeat(64) },
        now: START,
        lastServerTime: START,
      }),
    ).toBe("unlicensed");
  });

  it("accepts a document with the right claims and rejects a missing or wrong type, audience or issuer", () => {
    expect(openLicence(signDoc(trialBody), keys)).not.toBeNull();
    const withClaims = (claims: Record<string, unknown>) => {
      const payload = Buffer.from(JSON.stringify({ v: 1, ...trialBody, ...claims })).toString(
        "base64url",
      );
      return {
        kid: "k1",
        payload,
        sig: sign(null, Buffer.from(payload, "ascii"), pair.privateKey).toString("base64url"),
      };
    };
    const good = { typ: "licence", aud: DOCUMENT_AUDIENCE, iss: DOCUMENT_ISSUER };
    expect(openLicence(withClaims(good), keys)).not.toBeNull();
    for (const name of ["typ", "aud", "iss"] as const) {
      const missing = { ...good } as Record<string, unknown>;
      delete missing[name];
      const doc = (claims: Record<string, unknown>) => ({
        ...withClaims({ typ: undefined, aud: undefined, iss: undefined, ...claims }),
      });
      expect(openLicence(doc(missing), keys)).toBeNull();
      expect(openLicence(doc({ ...good, [name]: "other" }), keys)).toBeNull();
    }
    expect(openLicence(withClaims({ ...good, typ: "checkin" }), keys)).toBeNull();
  });

  it("does not accept a licence document where a check-in is expected", () => {
    const licenceDoc = signDoc(trialBody);
    const asCheckIn = signDoc({
      licenceId: trialBody.licenceId,
      machineHash: machine,
      serverTime: START,
      nonce: "n",
      licence: licenceDoc,
      typ: "licence",
    });
    expect(
      openCheckIn(asCheckIn, keys, { licenceId: trialBody.licenceId, machineHash: machine }),
    ).toBeNull();
  });

  it("rejects a tampered high-water mark and asks to reconnect", () => {
    const key = randomBytes(32);
    const mark = sealMark(START + 3 * DAY, key);
    expect(readMark(mark, key)).toBe(START + 3 * DAY);
    expect(readMark({ ...mark, at: START }, key)).toBe("tampered");
    expect(readMark(mark, randomBytes(32))).toBe("tampered");
    expect(readMark({ at: START }, key)).toBe("tampered");
    expect(readMark(null, key)).toBe("none");
    expect(
      evaluate({ ...base, now: START + DAY, lastServerTime: START + DAY, markTrusted: false }),
    ).toBe("reconnect");
  });

  it("does not give back trial days when the clock is set back", () => {
    const mark = START + 14 * DAY + 1;
    const now = trustedNow({
      wall: START + DAY,
      monotonic: 0,
      anchor: null,
      floors: [mark, START + 13 * DAY],
    });
    expect(now).toBe(mark);
    expect(evaluate({ ...base, now, lastServerTime: START + 13 * DAY })).toBe("expired");
  });

  it("ignores a clock set forward while anchored, and a check-in undoes an offline jump", () => {
    const anchor = { serverTime: START + DAY, monotonicAt: 5_000 };
    const anchored = trustedNow({
      wall: START + 300 * DAY,
      monotonic: 65_000,
      anchor,
      floors: [START + DAY],
    });
    expect(anchored).toBe(START + DAY + 60_000);
    expect(evaluate({ ...base, now: anchored, lastServerTime: START + DAY })).toBe("active");
    const jumped = trustedNow({
      wall: START + 300 * DAY,
      monotonic: 0,
      anchor: null,
      floors: [START + DAY],
    });
    expect(evaluate({ ...base, now: jumped, lastServerTime: START + DAY })).toBe("expired");
    const corrected = trustedNow({
      wall: START + 300 * DAY,
      monotonic: 10,
      anchor: { serverTime: START + 2 * DAY, monotonicAt: 10 },
      floors: [START + 2 * DAY],
    });
    expect(evaluate({ ...base, now: corrected, lastServerTime: START + 2 * DAY })).toBe("active");
  });

  it("allows 24 hours offline, then asks to reconnect", () => {
    expect(evaluate({ ...base, now: START + OFFLINE_GRACE, lastServerTime: START })).toBe("active");
    expect(evaluate({ ...base, now: START + OFFLINE_GRACE + 1, lastServerTime: START })).toBe(
      "reconnect",
    );
    expect(evaluate({ ...base, now: START, lastServerTime: null })).toBe("reconnect");
  });

  it("accepts a check-in only for this licence, machine and nonce", () => {
    const nonce = "n".repeat(24);
    const reply = signDoc({
      licenceId: trial.licenceId,
      machineHash: machine,
      nonce,
      serverTime: START + DAY,
      licence: signDoc(trialBody),
    });
    const expected = { licenceId: trial.licenceId, machineHash: machine, nonce };
    expect(openCheckIn(reply, keys, expected)?.serverTime).toBe(START + DAY);
    expect(openCheckIn(reply, keys, { ...expected, nonce: "m".repeat(24) })).toBeNull();
    expect(openCheckIn(reply, keys, { ...expected, machineHash: "b".repeat(64) })).toBeNull();
    const swapped = signDoc({
      licenceId: trial.licenceId,
      machineHash: machine,
      nonce,
      serverTime: START,
      licence: signDoc({ ...trialBody, machineHash: "b".repeat(64) }),
    });
    expect(openCheckIn(swapped, keys, expected)).toBeNull();
  });
});
