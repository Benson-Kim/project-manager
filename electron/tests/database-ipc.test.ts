import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerDatabaseIpc } from "../database-ipc";
import { DATABASE_READY_CHANNEL } from "../ipc-channels";

function setup(url: string | undefined = "http://127.0.0.1:3001") {
  let invoke!: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<boolean>;
  const ensureReady = vi.fn().mockResolvedValue(true);
  registerDatabaseIpc({
    handle(channel, handler) {
      expect(channel).toBe(DATABASE_READY_CHANNEL);
      invoke = handler;
    },
    serverUrl: () => url,
    ensureReady,
  });
  return { invoke, ensureReady };
}

function event(url: string, mainFrame = true): IpcMainInvokeEvent {
  const frame = { url };
  return {
    senderFrame: frame,
    sender: { mainFrame: mainFrame ? frame : {} },
  } as unknown as IpcMainInvokeEvent;
}

describe("database readiness IPC", () => {
  it("allows the current app page to request readiness without exposing configuration", async () => {
    const d = setup();
    expect(await d.invoke(event("http://127.0.0.1:3001/login"))).toBe(true);
    expect(d.ensureReady).toHaveBeenCalledOnce();
    expect(d.ensureReady).toHaveBeenCalledWith();
  });

  it.each([
    "https://example.com/login",
    "http://127.0.0.1:3002/login",
    "file:///C:/app/login.html",
    "not a URL",
  ])("rejects an untrusted or stale server URL: %s", async (url) => {
    const d = setup();
    await expect(d.invoke(event(url))).rejects.toThrow("app's own pages");
    expect(d.ensureReady).not.toHaveBeenCalled();
  });

  it("rejects subframes even when they have the app origin", async () => {
    const d = setup();
    await expect(d.invoke(event("http://127.0.0.1:3001/login", false))).rejects.toThrow();
    expect(d.ensureReady).not.toHaveBeenCalled();
  });

  it("rejects a missing sender frame and an app server that has not started", async () => {
    const d = setup();
    await expect(d.invoke({ senderFrame: null } as IpcMainInvokeEvent)).rejects.toThrow();
    const notStarted = setup();
    // Change the supplied server URL before registration, matching bootstrap before a server exists.
    let invoke!: (e: IpcMainInvokeEvent) => Promise<boolean>;
    registerDatabaseIpc({
      handle: (_channel, handler) => {
        invoke = handler;
      },
      serverUrl: () => undefined,
      ensureReady: notStarted.ensureReady,
    });
    await expect(invoke(event("http://127.0.0.1:3001/login"))).rejects.toThrow();
    expect(notStarted.ensureReady).not.toHaveBeenCalled();
  });

  it("rejects renderer-supplied targets or commands", async () => {
    const d = setup();
    await expect(
      d.invoke(event("http://127.0.0.1:3001/login"), { instanceName: "other" }),
    ).rejects.toThrow();
    expect(d.ensureReady).not.toHaveBeenCalled();
  });

  it("returns a declined or failed recovery without reporting success", async () => {
    const d = setup();
    d.ensureReady.mockResolvedValue(false);
    expect(await d.invoke(event("http://127.0.0.1:3001/login"))).toBe(false);
  });
});
