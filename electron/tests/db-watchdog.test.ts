import { describe, expect, it, vi } from "vitest";
import { createDbWatchdog, type WatchdogDeps } from "../db-watchdog";

function deps(overrides: Partial<WatchdogDeps> = {}) {
  return {
    reachable: vi.fn<WatchdogDeps["reachable"]>().mockResolvedValue(true),
    ensureReady: vi.fn<WatchdogDeps["ensureReady"]>().mockResolvedValue(true),
    onRecovered: vi.fn(),
    onDown: vi.fn(),
    log: { file: "", info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe("database watchdog", () => {
  it("uses only a cheap probe while the engine answers", async () => {
    const d = deps();
    expect(await createDbWatchdog(d).check()).toBe("ok");
    expect(d.ensureReady).not.toHaveBeenCalled();
    expect(d.onDown).not.toHaveBeenCalled();
  });

  it("delegates an outage to shared recovery and reports success", async () => {
    const d = deps({ reachable: vi.fn().mockResolvedValue(false) });
    expect(await createDbWatchdog(d).check()).toBe("recovered");
    expect(d.ensureReady).toHaveBeenCalledOnce();
    expect(d.onRecovered).toHaveBeenCalledOnce();
    expect(d.onDown).not.toHaveBeenCalled();
  });

  it("offers help once per outage, including after an outside recovery", async () => {
    const reachable = vi.fn<WatchdogDeps["reachable"]>().mockResolvedValue(false);
    const d = deps({ reachable, ensureReady: vi.fn().mockResolvedValue(false) });
    const watchdog = createDbWatchdog(d);
    expect(await watchdog.check()).toBe("down");
    expect(await watchdog.check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledOnce();

    reachable.mockResolvedValue(true);
    expect(await watchdog.check()).toBe("ok");
    expect(d.onRecovered).toHaveBeenCalledOnce();
    expect(await watchdog.check()).toBe("ok");
    expect(d.onRecovered).toHaveBeenCalledOnce();
    reachable.mockResolvedValue(false);
    expect(await watchdog.check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledTimes(2);
  });

  it("handles a failed probe and releases the lock for the next check", async () => {
    const d = deps({
      reachable: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true),
    });
    const watchdog = createDbWatchdog(d);
    expect(await watchdog.check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledOnce();
    expect(await watchdog.check()).toBe("ok");
  });

  it("handles a recovery exception as an outage", async () => {
    const d = deps({
      reachable: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    expect(await createDbWatchdog(d).check()).toBe("down");
    expect(d.onDown).toHaveBeenCalledOnce();
  });

  it("never runs two checks at once while recovery is pending", async () => {
    let finish!: (ok: boolean) => void;
    const d = deps({
      reachable: vi.fn().mockResolvedValue(false),
      ensureReady: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const watchdog = createDbWatchdog(d);
    const first = watchdog.check();
    await vi.waitFor(() => expect(d.ensureReady).toHaveBeenCalled());
    expect(await watchdog.check()).toBe("busy");
    finish(true);
    expect(await first).toBe("recovered");
  });
});
