import { generateKeyPairSync, randomBytes, sign } from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  allowsChanges,
  createLicenceGate,
  GATE_CACHE_FOR,
  gateEnv,
  licenceStatus,
  type GateEnv,
} from "../gate";
import { sealMark } from "../policy";
import type { StoredLicence } from "../repository";

vi.mock("@/lib/db", () => ({ execProc: vi.fn() }));

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 17);
const machine = "b".repeat(64);
const licenceId = "L".repeat(22);
const pair = generateKeyPairSync("ed25519");
const keys = { k1: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
const markKey = randomBytes(32);
const signDoc = (body: object) => {
  const claims = {
    typ: "nonce" in body ? "checkin" : "licence",
    aud: "modulus-desktop",
    iss: "modulus-licence-service",
  };
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims, ...body })).toString("base64url");
  return {
    kid: "k1",
    payload,
    sig: sign(null, Buffer.from(payload, "ascii"), pair.privateKey).toString("base64url"),
  };
};
const licence = signDoc({
  licenceId,
  kind: "trial",
  machineHash: machine,
  startsAt: START,
  expiresAt: START + 14 * DAY,
  updatesUntil: null,
});
const checkInAt = (serverTime: number) =>
  signDoc({ licenceId, machineHash: machine, nonce: "n", serverTime, licence });
const env: GateEnv = { enforce: true, machineHash: machine, keys, markKey };

function gate(stored: StoredLicence | null, wall: () => number, options: { env?: GateEnv } = {}) {
  const read = vi.fn(async () => stored);
  return { read, status: createLicenceGate({ env: () => options.env ?? env, read, wall }) };
}

const enforcedEnv = (vars: Record<string, string | undefined>) => {
  const all: Record<string, string | undefined> = {
    PM_LICENCE_ENFORCE: "1",
    PM_LICENCE_MACHINE: machine,
    PM_LICENCE_PUBLIC_KEYS: JSON.stringify(keys),
    PM_LICENCE_MARK_KEY: markKey.toString("base64url"),
    ...vars,
  };
  return gateEnv(all as NodeJS.ProcessEnv);
};

describe("licence gate", () => {
  it("is off without reading the database when the build does not enforce licensing", async () => {
    const { read, status } = gate(null, () => START, { env: gateEnv({} as NodeJS.ProcessEnv) });
    expect(await status()).toBe("off");
    expect(read).not.toHaveBeenCalled();
  });

  it("treats an enforcing install with no stored licence as unlicensed", async () => {
    expect(await gate(null, () => START).status()).toBe("unlicensed");
  });

  it("allows changes during a trial with a recent check-in", async () => {
    const wall = START + 2 * DAY;
    const stored = {
      licence,
      checkIn: checkInAt(wall - 1000),
      mark: sealMark(wall - 1000, markKey),
    };
    expect(await gate(stored, () => wall).status()).toBe("active");
  });

  it("asks a trial to reconnect when its time mark was tampered with", async () => {
    const wall = START + 2 * DAY;
    const stored = {
      licence,
      checkIn: checkInAt(wall - 1000),
      mark: { at: wall, mac: "x".repeat(43) },
    };
    expect(await gate(stored, () => wall).status()).toBe("reconnect");
  });

  it("asks a trial to reconnect after a day without a check-in", async () => {
    const wall = START + 3 * DAY;
    const stored = {
      licence,
      checkIn: checkInAt(START + DAY),
      mark: sealMark(START + DAY, markKey),
    };
    expect(await gate(stored, () => wall).status()).toBe("reconnect");
  });

  it("keeps an ended trial expired when the clock is set back before its end", async () => {
    const stored = {
      licence,
      checkIn: checkInAt(START + 13 * DAY),
      mark: sealMark(START + 15 * DAY, markKey),
    };
    expect(await gate(stored, () => START + 2 * DAY).status()).toBe("expired");
  });

  it("ignores a licence signed by another key", async () => {
    const other = generateKeyPairSync("ed25519");
    const forged = {
      ...licence,
      sig: sign(null, Buffer.from(licence.payload, "ascii"), other.privateKey).toString(
        "base64url",
      ),
    };
    expect(await gate({ licence: forged, checkIn: null, mark: null }, () => START).status()).toBe(
      "unlicensed",
    );
  });

  it("reuses a result for a short while and reads again when the clock moves back", async () => {
    let wall = START + 2 * DAY;
    const stored = { licence, checkIn: checkInAt(wall), mark: sealMark(wall, markKey) };
    const { read, status } = gate(stored, () => wall);
    await status();
    wall += GATE_CACHE_FOR - 1;
    await status();
    expect(read).toHaveBeenCalledTimes(1);
    wall -= DAY;
    await status();
    expect(read).toHaveBeenCalledTimes(2);
    wall += DAY + GATE_CACHE_FOR;
    await status();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed read", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(null);
    const status = createLicenceGate({ env: () => env, read, wall: () => START });
    await expect(status()).rejects.toThrow("down");
    expect(await status()).toBe("unlicensed");
  });

  it("stops allowing changes when the trial ends, not a cache period later", async () => {
    let wall = START + 14 * DAY - 5000;
    const stored = { licence, checkIn: checkInAt(wall - 1000), mark: sealMark(wall, markKey) };
    const { read, status } = gate(stored, () => wall);
    expect(await status()).toBe("active");
    wall += 5000;
    expect(await status()).toBe("expired");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads again after a refusal, so a code redeemed in the meantime counts at once", async () => {
    const wall = START + 2 * DAY;
    let stored: StoredLicence | null = null;
    const status = createLicenceGate({
      env: () => env,
      read: async () => stored,
      wall: () => wall,
    });
    expect(await status()).toBe("unlicensed");
    stored = { licence, checkIn: checkInAt(wall), mark: sealMark(wall, markKey) };
    expect(await status()).toBe("active");
  });

  it("shares one database read between requests that arrive together", async () => {
    const wall = START + 2 * DAY;
    const stored = { licence, checkIn: checkInAt(wall), mark: sealMark(wall, markKey) };
    const { read, status } = gate(stored, () => wall);
    const all = await Promise.all(Array.from({ length: 10 }, () => status()));
    expect(new Set(all)).toEqual(new Set(["active"]));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again after invalidate, so a revoked licence stops counting at once", async () => {
    const wall = START + 2 * DAY;
    let stored: StoredLicence | null = {
      licence,
      checkIn: checkInAt(wall),
      mark: sealMark(wall, markKey),
    };
    const status = createLicenceGate({
      env: () => env,
      read: async () => stored,
      wall: () => wall,
    });
    expect(await status()).toBe("active");
    stored = null;
    expect(await status()).toBe("active");
    status.invalidate();
    expect(await status()).toBe("unlicensed");
  });

  it("keeps the highest time mark it has seen when an older state is restored", async () => {
    const wall = START + 2 * DAY;
    let stored: StoredLicence = {
      licence,
      checkIn: checkInAt(START + 13 * DAY),
      mark: sealMark(START + 15 * DAY, markKey),
    };
    const status = createLicenceGate({
      env: () => env,
      read: async () => stored,
      wall: () => wall,
    });
    expect(await status()).toBe("expired");
    stored = { licence, checkIn: checkInAt(wall), mark: sealMark(wall - DAY, markKey) };
    status.invalidate();
    expect(await status()).toBe("expired");
  });
});

describe("licence status from the environment", () => {
  const wall = START + 2 * DAY;
  const stored = {
    licence,
    checkIn: checkInAt(wall - 1000),
    mark: sealMark(wall - 1000, markKey),
  };

  it("enforces and reads its keys when PM_LICENCE_ENFORCE is exactly 1", () => {
    const enforced = enforcedEnv({});
    expect(enforced.enforce).toBe(true);
    expect(licenceStatus(enforced, stored, wall)).toBe("active");
  });

  it.each(["true", "0", " 1", "1 ", "yes", "", undefined])(
    "does not enforce when PM_LICENCE_ENFORCE is %j",
    (value) => {
      expect(enforcedEnv({ PM_LICENCE_ENFORCE: value }).enforce).toBe(false);
    },
  );

  it("is off whatever is stored when not enforcing", () => {
    const notEnforced = { ...env, enforce: false };
    expect(licenceStatus(notEnforced, null, wall)).toBe("off");
    expect(licenceStatus(notEnforced, stored, wall)).toBe("off");
  });

  it("treats an install without a machine id as unlicensed without reading the database", async () => {
    const noMachine = { ...env, machineHash: "" };
    const { read, status } = gate(stored, () => wall, { env: noMachine });
    expect(await status()).toBe("unlicensed");
    expect(read).not.toHaveBeenCalled();
    expect(licenceStatus(noMachine, stored, wall)).toBe("unlicensed");
  });

  it.each([
    "not json",
    "null",
    "[]",
    JSON.stringify([keys.k1]),
    JSON.stringify({ k1: 5 }),
    undefined,
  ])("treats a valid licence as unlicensed when the public keys are %j", (raw) => {
    const badKeys = enforcedEnv({ PM_LICENCE_PUBLIC_KEYS: raw });
    expect(badKeys.keys).toEqual({});
    expect(licenceStatus(badKeys, stored, wall)).toBe("unlicensed");
  });

  it.each([
    ["missing", undefined],
    ["another key", randomBytes(32).toString("base64url")],
  ])("asks a trial to reconnect when the mark key is %s", (_, markKeyVar) => {
    const status = licenceStatus(enforcedEnv({ PM_LICENCE_MARK_KEY: markKeyVar }), stored, wall);
    expect(status).toBe("reconnect");
  });

  const shortKey = randomBytes(31);
  it.each([
    ["missing", Buffer.alloc(0), undefined],
    ["empty", Buffer.alloc(0), ""],
    ["31 bytes", shortKey, shortKey.toString("base64url")],
  ] as const)(
    "asks a trial to reconnect when its mark was sealed with a short key (%s)",
    (_, sealKey, markKeyVar) => {
      const forged = { ...stored, mark: sealMark(wall - 1000, sealKey) };
      const status = licenceStatus(enforcedEnv({ PM_LICENCE_MARK_KEY: markKeyVar }), forged, wall);
      expect(status).toBe("reconnect");
    },
  );
});

describe("allowsChanges", () => {
  it.each([
    ["active", true],
    ["off", true],
    ["expired", false],
    ["reconnect", false],
    ["unlicensed", false],
  ] as const)("%s allows changes: %s", (status, allowed) => {
    expect(allowsChanges(status)).toBe(allowed);
  });
});
