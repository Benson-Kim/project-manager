import { describe, expect, it, vi } from "vitest";
import { createDbWatchdog, type WatchdogDeps } from "../db-watchdog";
import type { Logger } from "../log";

const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function deps(overrides: Partial<WatchdogDeps> = {}) {
  return {
    reachable: vi.fn<WatchdogDeps["reachable"]>().mockResolvedValue(true),
    serviceState: vi.fn<WatchdogDeps["serviceState"]>().mockResolvedValue("stopped"),
    startService: vi.fn<WatchdogDeps["startService"]>().mockResolvedValue(true),
    waitForSql: vi.fn<WatchdogDeps["waitForSql"]>().mockResolvedValue(undefined),
    onRecovered: vi.fn(),
    onDown: vi.fn(),
    log,
    ...overrides,
  };
}

describe("database watchdog", () => {
  it("does nothing while the engine answers", async () => {
    const d = deps();
    expect(await createDbWatchdog(d).check()).toBe("ok");
    expect(d.serviceState).not.toHaveBeenCalled();
    expect(d.onDown).not.toHaveBeenCalled();
  });

  it("starts a stopped service and reports the recovery", async () => {
    const d = deps({ reachable: vi.fn().mockResolvedValue(false) });
    expect(await createDbWatchdog(d).check()).toBe("recovered");
    expect(d.startService).toHaveBeenCalledOnce();
    expect(d.waitForSql).toHaveBeenCalledOnce();
    expect(d.onRecovered).toHaveBeenCalledOnce();
    expect(d.onDown).not.toHaveBeenCalled();
  });

  it("tells the user once per outage when Windows refuses the start", async () => {
    const reachable = vi.fn<WatchdogDeps["reachable"]>().mockResolvedValue(false);
    const d = deps({ reachable, startService: vi.fn().mockResolvedValue(false) });
    const watchdog = createDbWatchdog(d);
    expect(await watchdog.check()).toBe("down");
    expect(await watchdog.check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledOnce();
    expect(d.waitForSql).not.toHaveBeenCalled();

    reachable.mockResolvedValue(true);
    expect(await watchdog.check()).toBe("ok");
    reachable.mockResolvedValue(false);
    expect(await watchdog.check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledTimes(2);
  });

  it("a service that is starting or missing is not started again", async () => {
    for (const state of ["running", "missing"] as const) {
      const d = deps({
        reachable: vi.fn().mockResolvedValue(false),
        serviceState: vi.fn().mockResolvedValue(state),
      });
      expect(await createDbWatchdog(d).check()).toBe("down");
      expect(d.startService).not.toHaveBeenCalled();
    }
  });

  it("an engine that never comes up after the start counts as down", async () => {
    const d = deps({
      reachable: vi.fn().mockResolvedValue(false),
      waitForSql: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    expect(await createDbWatchdog(d).check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledOnce();
  });

  it("never runs two checks at once (waiting for the engine takes a while)", async () => {
    let finish!: () => void;
    const d = deps({
      reachable: vi.fn().mockResolvedValue(false),
      waitForSql: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    });
    const watchdog = createDbWatchdog(d);
    const first = watchdog.check();
    await vi.waitFor(() => expect(d.waitForSql).toHaveBeenCalled());
    expect(await watchdog.check()).toBe("busy");
    finish();
    expect(await first).toBe("recovered");
  });
});
