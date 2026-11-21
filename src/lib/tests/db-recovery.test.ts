import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  isListening: vi.fn<(host: string, port: number) => Promise<boolean>>(),
  getServiceState: vi.fn<(instance: string) => Promise<string>>(),
  startService: vi.fn<(instance: string) => Promise<boolean>>(),
}));
vi.mock("../../../electron/sql-service", () => service);

import { createWebDatabaseRecovery, RETRY_AFTER_FAILURE_MS } from "../db-recovery";

const target = { instance: "SQLEXPRESS", host: "localhost", port: 1433 };

function setup(probe: () => Promise<void>) {
  let clock = 0;
  const recover = createWebDatabaseRecovery(target, {
    probe,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });
  return { recover, advance: (ms: number) => (clock += ms) };
}

describe("web database recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts a stopped service and waits until the app can log in", async () => {
    service.isListening.mockResolvedValue(false);
    service.getServiceState.mockResolvedValue("stopped");
    service.startService.mockResolvedValue(true);
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValue();
    const { recover } = setup(probe);

    await expect(recover()).resolves.toBe(true);
    expect(service.startService).toHaveBeenCalledWith("SQLEXPRESS", expect.anything());
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("only logs in again when SQL Server is already listening", async () => {
    service.isListening.mockResolvedValue(true);
    const { recover } = setup(async () => {});

    await expect(recover()).resolves.toBe(true);
    expect(service.getServiceState).not.toHaveBeenCalled();
    expect(service.startService).not.toHaveBeenCalled();
  });

  it("fails fast after a refused start, then tries again once the pause is over", async () => {
    service.isListening.mockResolvedValue(false);
    service.getServiceState.mockResolvedValue("stopped");
    service.startService.mockResolvedValue(false);
    const { recover, advance } = setup(async () => {});

    await expect(recover()).resolves.toBe(false);
    await expect(recover()).resolves.toBe(false);
    expect(service.startService).toHaveBeenCalledTimes(1);

    advance(RETRY_AFTER_FAILURE_MS);
    await expect(recover()).resolves.toBe(false);
    expect(service.startService).toHaveBeenCalledTimes(2);
  });

  it("gives up when the login still fails after the wait", async () => {
    service.isListening.mockResolvedValue(true);
    const { recover } = setup(() => Promise.reject(new Error("login failed")));

    await expect(recover()).resolves.toBe(false);
  });

  it("never starts a service that is missing or paused", async () => {
    service.isListening.mockResolvedValue(false);
    service.getServiceState.mockResolvedValue("paused");
    const { recover } = setup(async () => {});

    await expect(recover()).resolves.toBe(false);
    expect(service.startService).not.toHaveBeenCalled();
  });
});
