import { generateKeyPairSync, randomBytes, sign } from "crypto";
import { describe, expect, it } from "vitest";
import { LicenceManager, type MirroredState } from "../licence/manager";
import {
  evaluate,
  openLicence,
  readUsage,
  sealUsage,
  trustedNow,
  TRIAL_USAGE_LIMIT,
  usageLimit,
  type Licence,
} from "../licence/policy";
import type { LicenceState } from "../licence/state-file";
import { IDLE_CUTOFF_SECONDS, USAGE_TICK, usageStep } from "../licence/usage-meter";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const start = Date.UTC(2026, 10, 21);
const trial: Licence = {
  licenceId: "lic-1",
  kind: "trial",
  machineHash: "m",
  startsAt: start,
  expiresAt: start + 14 * DAY,
  updatesUntil: null,
};
const statusAt = (now: number, usedMs: number) =>
  evaluate({
    enforce: true,
    licence: trial,
    machineHash: "m",
    now,
    lastServerTime: now - HOUR,
    markTrusted: true,
    usedMs,
  });

describe("usage counter", () => {
  it("counts focused time while the person is active", () => {
    expect(usageStep({ elapsed: USAGE_TICK, idleSeconds: 10, focused: true })).toBe(USAGE_TICK);
  });

  it("skips time when the app is in the background or the person is idle", () => {
    expect(usageStep({ elapsed: USAGE_TICK, idleSeconds: 10, focused: false })).toBe(0);
    expect(
      usageStep({ elapsed: USAGE_TICK, idleSeconds: IDLE_CUTOFF_SECONDS, focused: true }),
    ).toBe(0);
  });

  it("never counts a sleep gap or a backwards step", () => {
    expect(usageStep({ elapsed: 8 * HOUR, idleSeconds: 0, focused: true })).toBe(2 * USAGE_TICK);
    expect(usageStep({ elapsed: -USAGE_TICK, idleSeconds: 0, focused: true })).toBe(0);
  });

  it("keeps the hours sealed to one licence", () => {
    const key = randomBytes(32);
    const sealed = sealUsage("lic-1", 3 * HOUR, key);
    expect(readUsage(sealed, "lic-1", key)).toBe(3 * HOUR);
    expect(readUsage(sealed, "lic-2", key)).toBe(0);
    expect(readUsage({ ...sealed, ms: HOUR }, "lic-1", key)).toBe(Infinity);
    expect(readUsage(sealed, "lic-1", randomBytes(32))).toBe(Infinity);
    expect(readUsage(null, "lic-1", key)).toBe(0);
  });
});

describe("trial ends at whichever comes first", () => {
  it("stays active while both hours and days are left", () => {
    expect(statusAt(start + 3 * DAY, 20 * HOUR)).toBe("active");
  });

  it("ends when the 112 hours are used up before day 14", () => {
    expect(TRIAL_USAGE_LIMIT).toBe(112 * HOUR);
    expect(statusAt(start + 6 * DAY, 112 * HOUR)).toBe("expired");
  });

  it("ends on day 14 even with hours left", () => {
    expect(statusAt(start + 14 * DAY, 10 * HOUR)).toBe("expired");
  });

  it("treats a tampered counter as used up", () => {
    expect(statusAt(start + DAY, Infinity)).toBe("expired");
  });

  it("does not reopen the trial when the clock is turned back", () => {
    const lastSeen = start + 14 * DAY + HOUR;
    const now = trustedNow({
      wall: start + 2 * DAY,
      monotonic: 0,
      anchor: null,
      floors: [lastSeen],
    });
    expect(now).toBe(lastSeen);
    expect(statusAt(now, 0)).toBe("expired");
  });
});

const pair = generateKeyPairSync("ed25519");
const keys = { k1: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
const machine = "a".repeat(64);
const signDoc = (body: object, typ = "licence") => {
  const claims = { v: 1, typ, aud: "modulus-desktop", iss: "modulus-licence-service" };
  const payload = Buffer.from(JSON.stringify({ ...claims, ...body })).toString("base64url");
  const sig = sign(null, Buffer.from(payload, "ascii"), pair.privateKey).toString("base64url");
  return { kid: "k1", payload, sig };
};
const trialDoc = (extra: object = {}) =>
  signDoc({ ...trial, licenceId: "L".repeat(22), machineHash: machine, ...extra });

describe("the licence service keeps the hours", () => {
  const highWater = (licence: object) => {
    let highest = 0;
    return {
      highest: () => highest,
      post: async (_path: string, body: Record<string, unknown>) => {
        highest = Math.max(highest, Number(body.usedMs ?? 0));
        return signDoc({ ...body, usedMs: highest, serverTime: start + DAY, licence }, "checkin");
      },
    };
  };
  const install = (
    state: LicenceState,
    row: MirroredState | null,
    svc: ReturnType<typeof highWater>,
  ) => {
    let saved = state;
    let mirrored = row;
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: { read: () => saved, write: (next) => void (saved = next) },
      mirror: { read: async () => mirrored, write: async (next) => void (mirrored = next) },
      service: svc,
      wall: () => start + DAY,
    });
    return { manager, saved: () => saved, mirrored: () => mirrored };
  };

  it("does not reset the hours when an old state file and an old database row are put back", async () => {
    const licence = trialDoc();
    const svc = highWater(licence);
    const markKey = randomBytes(32).toString("base64url");
    const old: LicenceState = { licence, checkIn: null, mark: null, markKey };
    const first = install(old, null, svc);
    await first.manager.start();
    first.manager.recordUse(40 * HOUR);
    const backup = {
      ...first.saved(),
      usage: sealUsage("L".repeat(22), 5 * HOUR, Buffer.from(markKey, "base64url")),
    };
    await first.manager.checkIn();
    expect(svc.highest()).toBe(40 * HOUR);

    const restored = install(backup, { ...backup }, svc);
    await restored.manager.start();
    expect(restored.manager.usedMs()).toBe(5 * HOUR);
    await restored.manager.checkIn();
    expect(svc.highest()).toBe(40 * HOUR);
    expect(restored.manager.usedMs()).toBe(40 * HOUR);
    expect(restored.manager.usedMs(restored.saved().usage)).toBe(40 * HOUR);
    expect(restored.manager.usedMs(restored.mirrored()?.usage)).toBe(40 * HOUR);
  });

  it("sends the limit, never Infinity, for a tampered counter", async () => {
    const licence = trialDoc();
    const svc = highWater(licence);
    const markKey = randomBytes(32).toString("base64url");
    const usage = { licenceId: "L".repeat(22), ms: HOUR, mac: "forged" };
    const { manager } = install({ licence, checkIn: null, mark: null, markKey, usage }, null, svc);
    await manager.checkIn();
    expect(svc.highest()).toBe(TRIAL_USAGE_LIMIT);
    expect(manager.status()).toBe("expired");
  });
});

describe("the hours limit is signed into the licence", () => {
  it("reads a different limit per licence", () => {
    const short = openLicence(trialDoc({ usageLimitMs: 10 * HOUR }), keys);
    expect(short && usageLimit(short)).toBe(10 * HOUR);
    const status = (licence: Licence) =>
      evaluate({
        enforce: true,
        licence,
        machineHash: machine,
        now: start + DAY,
        lastServerTime: start + DAY,
        markTrusted: true,
        usedMs: 10 * HOUR,
      });
    expect(short && status(short)).toBe("expired");
    const standard = openLicence(trialDoc({ usageLimitMs: TRIAL_USAGE_LIMIT }), keys);
    expect(standard && status(standard)).toBe("active");
  });

  it("falls back to 112 hours for a licence without the claim", () => {
    const old = openLicence(trialDoc(), keys);
    expect(old?.usageLimitMs).toBeUndefined();
    expect(old && usageLimit(old)).toBe(112 * HOUR);
  });

  it("rejects a licence whose limit was edited", () => {
    const doc = trialDoc({ usageLimitMs: 10 * HOUR });
    const claims = JSON.parse(Buffer.from(doc.payload, "base64url").toString("utf8"));
    const payload = Buffer.from(JSON.stringify({ ...claims, usageLimitMs: 1000 * HOUR })).toString(
      "base64url",
    );
    expect(openLicence({ ...doc, payload }, keys)).toBeNull();
  });
});
