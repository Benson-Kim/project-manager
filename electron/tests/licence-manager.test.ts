import { generateKeyPairSync, randomBytes, sign } from "crypto";
import { describe, expect, it } from "vitest";
import { LicenceManager, type LicenceService, type MirroredState } from "../licence/manager";
import { LicenceServiceError } from "../licence/service-client";
import type { LicenceState } from "../licence/state-file";

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 17);
const machine = "a".repeat(64);
const pair = generateKeyPairSync("ed25519");
const keys = { k1: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url") };
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
const licenceDoc = signDoc({
  licenceId: "L".repeat(22),
  kind: "trial",
  machineHash: machine,
  startsAt: START,
  expiresAt: START + 14 * DAY,
  updatesUntil: null,
});

function memoryStore(initial?: Partial<LicenceState>) {
  let state: LicenceState = {
    licence: null,
    checkIn: null,
    mark: null,
    usage: null,
    markKey: randomBytes(32).toString("base64url"),
    ...initial,
  };
  return {
    read: () => state,
    write: (next: LicenceState) => void (state = next),
    peek: () => state,
  };
}

function service(serverTime: () => number) {
  const calls: unknown[] = [];
  return {
    calls,
    post: async (_path: string, body: Record<string, unknown>) => {
      calls.push(body);
      return signDoc({ ...body, serverTime: serverTime(), licence: licenceDoc });
    },
  };
}

function memoryMirror(initial: MirroredState | null = null) {
  let row = initial;
  return { read: async () => row, write: async (next: MirroredState) => void (row = next) };
}

describe("licence manager", () => {
  it("keeps a paying install with no licence state off and never calls the service", async () => {
    const svc = service(() => START);
    const manager = new LicenceManager({
      enforce: false,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror: memoryMirror(),
      service: svc,
    });
    expect(await manager.start()).toBe("off");
    expect(svc.calls).toHaveLength(0);
  });

  it("restores the same trial after a reinstall instead of starting a new one", async () => {
    let wall = START + 3 * DAY;
    const first = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror: memoryMirror(),
      service: service(() => wall),
      wall: () => wall,
    });
    expect(await first.adopt(licenceDoc)).toBe("active");
    const mirror = memoryMirror();
    await mirror.write({ licence: licenceDoc, checkIn: null, mark: null, usage: null });
    const offline = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror,
      service: null,
      wall: () => wall,
    });
    expect(await offline.start()).toBe("reconnect");
    expect(offline.licence()?.expiresAt).toBe(START + 14 * DAY);
    wall = START + 15 * DAY;
    const online = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror,
      service: service(() => wall),
      wall: () => wall,
    });
    await online.start();
    expect(await online.checkIn()).toBe("expired");
  });

  it("starts from the stored state without waiting for the licence service", async () => {
    const mirror = memoryMirror({ licence: licenceDoc, checkIn: null, mark: null, usage: null });
    const calls: unknown[] = [];
    const stalled = {
      post: (_path: string, body: Record<string, unknown>) => (
        calls.push(body),
        new Promise<never>(() => undefined)
      ),
    };
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror,
      service: stalled,
      wall: () => START + DAY,
    });
    expect(await manager.start()).toBe("reconnect");
    expect(calls).toHaveLength(0);
  });

  it("keeps the trial expired when the clock is set back after the mark advanced", async () => {
    let wall = START + 13 * DAY;
    let mono = 0;
    const store = memoryStore();
    const deps = {
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror: null,
      wall: () => wall,
      monotonic: () => mono,
    };
    const manager = new LicenceManager({ ...deps, service: service(() => START + 13 * DAY) });
    expect(await manager.adopt(licenceDoc)).toBe("active");
    mono = DAY + 1;
    await manager.refreshMark();
    wall = START + DAY;
    const restarted = new LicenceManager({ ...deps, service: null });
    expect(restarted.status()).toBe("expired");
  });

  it("asks a trial to reconnect when its state file is deleted, and ignores a tampered mirror mark", async () => {
    const wall = START + DAY;
    const foreignMark = { at: START + 30 * DAY, mac: "x".repeat(43) };
    const mirror = memoryMirror({
      licence: licenceDoc,
      checkIn: null,
      mark: foreignMark,
      usage: null,
    });
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store: memoryStore(),
      mirror,
      service: null,
      wall: () => wall,
    });
    expect(await manager.start()).toBe("reconnect");
    expect(manager.status()).toBe("reconnect");
  });
});

function scripted(routes: Record<string, (body: Record<string, unknown>) => unknown>) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  return {
    calls,
    post: async (path: string, body: Record<string, unknown>) => {
      calls.push({ path, body });
      const route = routes[path];
      if (!route) throw new LicenceServiceError("not_found");
      return route(body);
    },
  };
}

describe("licence manager service calls", () => {
  const checkin = (body: Record<string, unknown>) =>
    signDoc({ ...body, serverTime: START + DAY, licence: licenceDoc });
  const make = (svc: LicenceService | null, store = memoryStore()) =>
    new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror: null,
      service: svc,
      wall: () => START + DAY,
    });

  it("verifies a trial code and adopts the signed licence it returns", async () => {
    const svc = scripted({ "/v1/trial/verify": () => licenceDoc, "/v1/checkin": checkin });
    const manager = make(svc);
    expect(await manager.verifyTrial("tester@example.test", "123456")).toEqual({
      ok: true,
      status: "active",
    });
    expect(svc.calls[0]).toEqual({
      path: "/v1/trial/verify",
      body: { email: "tester@example.test", machineHash: machine, code: "123456" },
    });
    expect(manager.licence()?.licenceId).toBe("L".repeat(22));
  });

  it.each([
    [
      "signed for another machine",
      signDoc({
        licenceId: "M".repeat(22),
        kind: "trial",
        machineHash: "b".repeat(64),
        startsAt: START,
        expiresAt: START + 14 * DAY,
        updatesUntil: null,
      }),
    ],
    ["with a forged signature", { ...licenceDoc, sig: Buffer.alloc(64).toString("base64url") }],
  ])("refuses a redeemed licence %s and keeps no licence", async (_label, document) => {
    const store = memoryStore();
    const manager = make(scripted({ "/v1/licence/redeem": () => document }), store);
    expect(await manager.redeem("R".repeat(22))).toEqual({ ok: false, reason: "invalid" });
    expect(store.peek().licence).toBeNull();
    expect(manager.status()).toBe("unlicensed");
  });

  it("never swaps a held full licence for a trial or a free licence, but lets a trial become full", async () => {
    const own = (id: string, kind: string) =>
      signDoc({
        licenceId: id.repeat(22),
        kind,
        machineHash: machine,
        startsAt: START,
        expiresAt: null,
        updatesUntil: START + 365 * DAY,
      });
    const fullDoc = own("F", "full");
    let served: unknown = licenceDoc;
    const svc = scripted({
      "/v1/checkin": (body) => signDoc({ ...body, serverTime: START + DAY, licence: served }),
      "/v1/trial/verify": () => licenceDoc,
      "/v1/licence/redeem": () => (served = fullDoc),
    });
    const store = memoryStore();
    const manager = make(svc, store);
    await manager.adopt(licenceDoc);
    expect(await manager.redeem("R".repeat(22))).toEqual({ ok: true, status: "active" });
    expect(manager.licence()?.kind).toBe("full");
    expect(await manager.verifyTrial("tester@example.test", "123456")).toEqual({
      ok: false,
      reason: "already_licensed",
    });
    expect(await manager.adopt(own("G", "free"))).toBe("active");
    expect(manager.licence()?.licenceId).toBe("F".repeat(22));
    expect(store.peek().licence).toEqual(fullDoc);
  });

  it("replaces a held full licence with the free licence the next check-in returns", async () => {
    const own = (id: string, kind: string) =>
      signDoc({
        licenceId: id.repeat(22),
        kind,
        machineHash: machine,
        startsAt: START,
        expiresAt: null,
        updatesUntil: kind === "free" ? START + 365 * DAY : null,
      });
    const fullDoc = own("F", "full");
    let served: unknown = fullDoc;
    const svc = scripted({
      "/v1/checkin": (body) => signDoc({ ...body, serverTime: START + DAY, licence: served }),
    });
    const store = memoryStore({ licence: fullDoc });
    const manager = make(svc, store);
    expect(await manager.checkIn()).toBe("active");
    expect(manager.licence()?.kind).toBe("full");
    served = own("F", "free");
    expect(await manager.checkIn()).toBe("active");
    expect(manager.licence()?.kind).toBe("free");
    expect(store.peek().licence).toEqual(served);
  });

  it("returns the service's refusal instead of throwing, and offline when there is no service", async () => {
    const svc = scripted({
      "/v1/trial/start": () => {
        throw new LicenceServiceError("rate_limited");
      },
    });
    expect(await make(svc).requestTrial("tester@example.test")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await make(null).verifyTrial("tester@example.test", "123456")).toEqual({
      ok: false,
      reason: "offline",
    });
  });

  it("sends feedback and consent only with a licence, always as this machine's licence", async () => {
    const svc = scripted({
      "/v1/checkin": checkin,
      "/v1/feedback": () => ({}),
      "/v1/consent": () => ({}),
    });
    const manager = make(svc);
    expect(await manager.sendFeedback("Works well", "1.0.30")).toEqual({
      ok: false,
      reason: "unlicensed",
    });
    expect(svc.calls).toHaveLength(0);
    await manager.adopt(licenceDoc);
    expect(await manager.sendFeedback("Works well", "1.0.30")).toEqual({
      ok: true,
      status: "active",
    });
    const choice = {
      kind: "testimonial" as const,
      granted: true,
      quote: "Works well",
      displayName: null,
      machineHash: "b".repeat(64),
    };
    expect(await manager.setConsent(choice)).toEqual({ ok: true, status: "active" });
    const owner = { licenceId: "L".repeat(22), machineHash: machine };
    expect(svc.calls.slice(-2)).toEqual([
      { path: "/v1/feedback", body: { body: "Works well", appVersion: "1.0.30", ...owner } },
      {
        path: "/v1/consent",
        body: {
          kind: "testimonial",
          granted: true,
          quote: "Works well",
          displayName: null,
          ...owner,
        },
      },
    ]);
  });

  it("logs a failing mirror, keeps going, and writes the mirror again at the next check-in", async () => {
    const svc = service(() => START + DAY);
    const store = memoryStore();
    const written: MirroredState[] = [];
    let fail = true;
    const mirror = {
      read: async () => null,
      write: async (next: MirroredState) => {
        if (fail) throw new Error("db down");
        written.push(next);
      },
    };
    const warnings: string[] = [];
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror,
      service: { post: svc.post },
      log: { warn: (message) => warnings.push(message) },
      wall: () => START + DAY,
      monotonic: () => 0,
    });
    await manager.adopt(licenceDoc);
    expect(warnings.length).toBeGreaterThan(0);
    expect(store.peek().licence).toEqual(licenceDoc);
    expect(written).toHaveLength(0);
    fail = false;
    await manager.checkIn();
    expect(written.length).toBeGreaterThan(0);
    expect(written.at(-1)?.checkIn).not.toBeNull();
  });

  it("still writes the mirror and logs when the state file cannot be written", async () => {
    const svc = service(() => START + DAY);
    const store = {
      ...memoryStore(),
      write: () => {
        throw new Error("disk full");
      },
    };
    const mirror = memoryMirror();
    const warnings: string[] = [];
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror,
      service: { post: svc.post },
      log: { warn: (message) => warnings.push(message) },
    });
    await manager.adopt(licenceDoc);
    expect(warnings.some((message) => message.includes("disk full"))).toBe(true);
    expect((await mirror.read())?.licence).toEqual(licenceDoc);
  });

  it("restores a paid licence from the database copy when only the trial reached the file", async () => {
    const fullDoc = signDoc({
      licenceId: "F".repeat(22),
      kind: "full",
      machineHash: machine,
      startsAt: START + DAY,
      expiresAt: null,
      updatesUntil: null,
    });
    const store = memoryStore({ licence: licenceDoc });
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror: memoryMirror({ licence: fullDoc, checkIn: null, mark: null, usage: null }),
      service: null,
      wall: () => START + 2 * DAY,
    });
    await manager.start();
    expect(manager.licence()?.kind).toBe("full");
    expect(store.peek().licence).toEqual(fullDoc);
  });

  it("keeps the held licence when the database copy is older or lower", async () => {
    const store = memoryStore({ licence: licenceDoc });
    const older = signDoc({
      licenceId: "O".repeat(22),
      kind: "trial",
      machineHash: machine,
      startsAt: START - DAY,
      expiresAt: START + 13 * DAY,
      updatesUntil: null,
    });
    const manager = new LicenceManager({
      enforce: true,
      keys,
      machineHash: machine,
      store,
      mirror: memoryMirror({ licence: older, checkIn: null, mark: null, usage: null }),
      service: null,
      wall: () => START + DAY,
    });
    await manager.start();
    expect(store.peek().licence).toEqual(licenceDoc);
  });
});
