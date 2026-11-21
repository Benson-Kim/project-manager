import { describe, expect, it, vi } from "vitest";
import { LICENCE_CHANNELS } from "../ipc-channels";
import { registerLicenceIpc } from "../licence/ipc";

const WINDOW = { id: "licence-window" };
const done = { ok: true, status: "active" } as const;

function setup(overrides: Record<string, unknown> = {}, onChanged = vi.fn()) {
  const handlers = new Map<
    string,
    (event: { sender: unknown }, input?: unknown) => Promise<unknown>
  >();
  const manager = {
    status: vi.fn(() => "unlicensed" as const),
    licence: vi.fn(() => null),
    now: vi.fn(() => 1_800_000_000_000),
    allowance: vi.fn(() => null),
    requestTrial: vi.fn(async () => done),
    verifyTrial: vi.fn(async () => done),
    redeem: vi.fn(async () => done),
    checkIn: vi.fn(async () => "active" as const),
    sendFeedback: vi.fn(async () => done),
    setConsent: vi.fn(async () => done),
    ...overrides,
  };
  const logError = vi.fn();
  registerLicenceIpc({
    handle: (channel, handler) => handlers.set(channel, handler),
    manager,
    isLicenceWindow: (sender) => sender === WINDOW,
    appVersion: "1.2.3",
    logError,
    onChanged,
  });
  const call = (channel: string, input?: unknown, sender: unknown = WINDOW) =>
    handlers.get(channel)!({ sender }, input);
  return { handlers, manager, logError, onChanged, call };
}

const verify = { email: "a@b.co", code: "123456" };
const redeem = { code: "R".repeat(22) };

const invalid = { ok: false, reason: "invalid_input" };

describe("licence IPC", () => {
  it("registers every licence channel", () => {
    expect([...setup().handlers.keys()].sort()).toEqual(Object.values(LICENCE_CHANNELS).sort());
  });

  it.each(Object.values(LICENCE_CHANNELS))(
    "refuses %s from any other window without calling the manager",
    async (channel) => {
      const { call, manager, onChanged } = setup();
      expect(
        await call(channel, { email: "a@b.co", code: "R".repeat(22), body: "x" }, { id: "main" }),
      ).toEqual({
        ok: false,
        reason: "forbidden",
      });
      for (const fn of Object.values(manager)) expect(fn).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    },
  );

  it("announces the new status once a trial verify or a redeem installs a licence", async () => {
    const { call, onChanged } = setup({
      redeem: vi.fn(async () => ({ ok: true, status: "licensed" })),
    });
    expect(await call(LICENCE_CHANNELS.trialVerify, verify)).toEqual(done);
    expect(onChanged).toHaveBeenLastCalledWith("active");
    expect(await call(LICENCE_CHANNELS.redeem, redeem)).toEqual({ ok: true, status: "licensed" });
    expect(onChanged).toHaveBeenLastCalledWith("licensed");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("announces nothing when the service refuses, the input is invalid or the call fails", async () => {
    const refused = { ok: false, reason: "already_licensed" };
    const { call, onChanged } = setup({
      verifyTrial: vi.fn(async () => refused),
      redeem: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    expect(await call(LICENCE_CHANNELS.trialVerify, verify)).toEqual(refused);
    expect(await call(LICENCE_CHANNELS.trialVerify, { ...verify, code: "12345a" })).toEqual(
      invalid,
    );
    expect(await call(LICENCE_CHANNELS.redeem, { code: "short" })).toEqual(invalid);
    expect(await call(LICENCE_CHANNELS.redeem, redeem)).toEqual({ ok: false, reason: "failed" });
    expect(await call(LICENCE_CHANNELS.trialRequest, { email: "a@b.co" })).toEqual(done);
    expect(await call(LICENCE_CHANNELS.feedbackSend, { body: "Works" })).toEqual(done);
    expect(await call(LICENCE_CHANNELS.reconnect)).toEqual({ ok: true, status: "active" });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("still reports an installed licence when the change notice throws", async () => {
    const boom = new Error("tray gone");
    const { call, logError } = setup(
      {},
      vi.fn(() => {
        throw boom;
      }),
    );
    expect(await call(LICENCE_CHANNELS.redeem, redeem)).toEqual(done);
    expect(logError).toHaveBeenCalledWith("licence change notice failed", boom);
  });

  it.each([
    undefined,
    "a@b.co",
    { email: "no-at-sign" },
    { email: `${"a".repeat(250)}@b.co` },
    { email: 7 },
  ])("refuses trial request input %j", async (input) => {
    const { call, manager } = setup();
    expect(await call(LICENCE_CHANNELS.trialRequest, input)).toEqual(invalid);
    expect(manager.requestTrial).not.toHaveBeenCalled();
  });

  it("trims and passes a valid email and code", async () => {
    const { call, manager } = setup();
    expect(
      await call(LICENCE_CHANNELS.trialVerify, { email: " a@b.co ", code: " 123456 " }),
    ).toEqual(done);
    expect(manager.verifyTrial).toHaveBeenCalledWith("a@b.co", "123456");
    expect(await call(LICENCE_CHANNELS.trialVerify, { email: "a@b.co", code: "12345a" })).toEqual(
      invalid,
    );
    expect(await call(LICENCE_CHANNELS.redeem, { code: "short" })).toEqual(invalid);
    expect(await call(LICENCE_CHANNELS.redeem, { code: "R".repeat(22) })).toEqual(done);
    expect(manager.redeem).toHaveBeenCalledWith("R".repeat(22));
  });

  it("sends feedback of 1 to 5000 characters with the app version", async () => {
    const { call, manager } = setup();
    expect(await call(LICENCE_CHANNELS.feedbackSend, { body: "   " })).toEqual(invalid);
    expect(await call(LICENCE_CHANNELS.feedbackSend, { body: "x".repeat(5001) })).toEqual(invalid);
    expect(await call(LICENCE_CHANNELS.feedbackSend, { body: " Works well " })).toEqual(done);
    expect(manager.sendFeedback).toHaveBeenCalledWith("Works well", "1.2.3");
  });

  it("passes only the checked consent fields", async () => {
    const { call, manager } = setup();
    const good = {
      kind: "name",
      granted: true,
      quote: "Great",
      displayName: "Pat",
      licenceId: "X",
      machineHash: "b",
    };
    expect(await call(LICENCE_CHANNELS.feedbackConsent, good)).toEqual(done);
    expect(manager.setConsent).toHaveBeenCalledWith({
      kind: "name",
      granted: true,
      quote: "Great",
      displayName: "Pat",
    });
    for (const bad of [
      { ...good, kind: "email" },
      { ...good, granted: "yes" },
      { ...good, quote: "q".repeat(2001) },
      { ...good, displayName: "n".repeat(121) },
    ])
      expect(await call(LICENCE_CHANNELS.feedbackConsent, bad)).toEqual(invalid);
    expect(manager.setConsent).toHaveBeenCalledTimes(1);
  });

  it("reports state and reconnect results", async () => {
    const { call } = setup();
    expect(await call(LICENCE_CHANNELS.state)).toEqual({
      ok: true,
      status: "unlicensed",
      kind: null,
      expiresAt: null,
      updatesUntil: null,
      now: 1_800_000_000_000,
      allowance: null,
    });
    expect(await call(LICENCE_CHANNELS.reconnect)).toEqual({ ok: true, status: "active" });
  });

  it("logs an unexpected error and replies failed", async () => {
    const boom = new Error("boom");
    const { call, logError } = setup({ checkIn: vi.fn(async () => Promise.reject(boom)) });
    expect(await call(LICENCE_CHANNELS.reconnect)).toEqual({ ok: false, reason: "failed" });
    expect(logError).toHaveBeenCalledWith("licence:reconnect failed", boom);
  });
});
