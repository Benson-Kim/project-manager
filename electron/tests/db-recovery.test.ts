import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseRecovery, type RecoveryDeps } from "../db-recovery";

function deps(overrides: Partial<RecoveryDeps> = {}) {
  return {
    reachable: vi.fn<RecoveryDeps["reachable"]>().mockResolvedValue(false),
    serviceState: vi.fn<RecoveryDeps["serviceState"]>().mockResolvedValue("stopped"),
    startService: vi.fn<RecoveryDeps["startService"]>().mockResolvedValue(true),
    waitForSql: vi.fn<RecoveryDeps["waitForSql"]>().mockResolvedValue(undefined),
    repairService: vi.fn<RecoveryDeps["repairService"]>().mockResolvedValue(false),
    log: { file: "", info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("desktop database recovery", () => {
  it("starts a stopped service before testing the SQL login", async () => {
    const d = deps();
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(true);
    expect(d.startService).toHaveBeenCalledOnce();
    expect(d.waitForSql).toHaveBeenCalledOnce();
    expect(d.startService.mock.invocationCallOrder[0]).toBeLessThan(d.waitForSql.mock.invocationCallOrder[0]);
    expect(d.repairService).not.toHaveBeenCalled();
  });

  it("proves login readiness even when the TCP port is already listening", async () => {
    const d = deps({ reachable: vi.fn().mockResolvedValue(true) });
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(true);
    expect(d.serviceState).not.toHaveBeenCalled();
    expect(d.startService).not.toHaveBeenCalled();
    expect(d.waitForSql).toHaveBeenCalledOnce();
  });

  it.each(["running", "starting", "unknown"] as const)("waits for a %s service without starting it twice", async (state) => {
    const d = deps({ serviceState: vi.fn().mockResolvedValue(state) });
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(true);
    expect(d.startService).not.toHaveBeenCalled();
    expect(d.waitForSql).toHaveBeenCalledOnce();
  });

  it("waits for a stopping service, then starts it", async () => {
    vi.useFakeTimers();
    const d = deps({ serviceState: vi.fn().mockResolvedValueOnce("stopping").mockResolvedValue("stopped") });
    const ready = createDatabaseRecovery(d).ensureReady();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await ready).toBe(true);
    expect(d.startService).toHaveBeenCalledOnce();
  });

  it("bounds the wait for a service that stays stopping", async () => {
    vi.useFakeTimers();
    const d = deps({ serviceState: vi.fn().mockResolvedValue("stopping") });
    const ready = createDatabaseRecovery(d).ensureReady();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await ready).toBe(false);
    expect(d.startService).not.toHaveBeenCalled();
  });

  it("returns promptly when Windows refuses to start a stopped service", async () => {
    const d = deps({ startService: vi.fn().mockResolvedValue(false) });
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(false);
    expect(d.waitForSql).not.toHaveBeenCalled();
    expect(d.repairService).not.toHaveBeenCalled();
  });

  it("accepts a start race won by Windows only after the SQL login works", async () => {
    const d = deps({
      serviceState: vi.fn().mockResolvedValueOnce("stopped").mockResolvedValue("starting"),
      startService: vi.fn().mockResolvedValue(false),
    });
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(true);
    expect(d.waitForSql).toHaveBeenCalledOnce();
  });

  it.each(["missing", "paused"] as const)("does not start or reinstall a %s service", async (state) => {
    const d = deps({ serviceState: vi.fn().mockResolvedValue(state) });
    expect(await createDatabaseRecovery(d).ensureReady()).toBe(false);
    expect(d.startService).not.toHaveBeenCalled();
    expect(d.repairService).not.toHaveBeenCalled();
  });

  it("joins concurrent startup, sign-in and watchdog requests", async () => {
    let finish!: () => void;
    const d = deps({ waitForSql: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
    const recovery = createDatabaseRecovery(d);
    const first = recovery.ensureReady();
    expect(recovery.ensureReady()).toBe(first);
    await vi.waitFor(() => expect(d.waitForSql).toHaveBeenCalledOnce());
    finish();
    expect(await first).toBe(true);
    expect(d.startService).toHaveBeenCalledOnce();
  });

  it("allows retry after failure without keeping a rejected or failed result", async () => {
    const d = deps({ waitForSql: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined) });
    const recovery = createDatabaseRecovery(d);
    expect(await recovery.ensureReady()).toBe(false);
    expect(await recovery.ensureReady()).toBe(true);
  });

  it("repairs once for concurrent requests and rechecks the SQL login", async () => {
    let finish!: (ok: boolean) => void;
    const d = deps({
      startService: vi.fn().mockResolvedValue(false),
      repairService: vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })),
    });
    const recovery = createDatabaseRecovery(d);
    const first = recovery.repair();
    expect(recovery.repair()).toBe(first);
    expect(recovery.ensureReady()).toBe(first);
    await vi.waitFor(() => expect(d.repairService).toHaveBeenCalledOnce());
    d.reachable.mockResolvedValue(true);
    finish(true);
    expect(await first).toBe(true);
    expect(d.waitForSql).toHaveBeenCalledOnce();
  });

  it("handles declined and failed repair, then allows another explicit attempt", async () => {
    const d = deps({
      startService: vi.fn().mockResolvedValue(false),
      repairService: vi.fn().mockResolvedValueOnce(false).mockRejectedValue(new Error("UAC declined")),
    });
    const recovery = createDatabaseRecovery(d);
    expect(await recovery.repair()).toBe(false);
    expect(await recovery.repair()).toBe(false);
    expect(d.repairService).toHaveBeenCalledTimes(2);
  });
});
