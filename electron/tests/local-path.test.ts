import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { OPEN_LOCAL_PATH_CHANNEL } from "../ipc-channels";
import { openLocalFolder, registerLocalPathIpc, type OpenLocalPathResult } from "../local-path";

const FOLDER = String.raw`C:\Users\maina\Documents\CIUSS Pilot 2025`;

function deps(isDirectory: (folder: string) => boolean = () => true) {
  return {
    isDirectory: vi.fn(isDirectory),
    openPath: vi.fn<(folder: string) => Promise<string>>(async () => ""),
  };
}

function setup(serverUrl: () => string | undefined = () => "http://127.0.0.1:3001") {
  let invoke!: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<OpenLocalPathResult>;
  const d = deps();
  registerLocalPathIpc({
    handle(channel, handler) {
      expect(channel).toBe(OPEN_LOCAL_PATH_CHANNEL);
      invoke = handler;
    },
    serverUrl,
    ...d,
  });
  return { invoke, ...d };
}

function event(url: string, mainFrame = true): IpcMainInvokeEvent {
  const frame = { url };
  return {
    senderFrame: frame,
    sender: { mainFrame: mainFrame ? frame : {} },
  } as unknown as IpcMainInvokeEvent;
}

describe("opening a folder link", () => {
  it("opens an existing folder, normalised, and nothing else", async () => {
    const d = deps();
    await expect(
      openLocalFolder("  C:/Users/maina/Documents/CIUSS Pilot 2025/ ", d),
    ).resolves.toEqual({ ok: true });
    expect(d.openPath).toHaveBeenCalledWith(`${FOLDER}\\`);
  });

  it("says not found for a missing path, a file, or a folder it cannot read", async () => {
    for (const isDirectory of [
      () => false,
      () => {
        throw new Error("EACCES");
      },
    ]) {
      const d = deps(isDirectory);
      await expect(openLocalFolder(FOLDER, d)).resolves.toEqual({ ok: false, reason: "notFound" });
      expect(d.openPath).not.toHaveBeenCalled();
    }
  });

  it("refuses executables, UNC shares, traversal, URLs and non-strings before touching the disk", async () => {
    for (const input of [
      String.raw`C:\Tools\setup.exe`,
      String.raw`C:\Tools\run.exe. `,
      String.raw`C:\Tools\app.lnk`,
      String.raw`\\attacker\share`,
      String.raw`C:\Users\..\Windows\System32`,
      String.raw`C:\a\b.txt:hidden`,
      "file:///C:/Users",
      "javascript:alert(1)",
      "https://example.com",
      42,
      null,
      [FOLDER],
      { path: FOLDER },
    ]) {
      const d = deps();
      await expect(openLocalFolder(input, d)).resolves.toEqual({ ok: false, reason: "refused" });
      expect(d.isDirectory).not.toHaveBeenCalled();
      expect(d.openPath).not.toHaveBeenCalled();
    }
  });

  it("reports a refusal when Windows will not open the folder", async () => {
    const d = deps();
    d.openPath.mockResolvedValueOnce("Access is denied.");
    await expect(openLocalFolder(FOLDER, d)).resolves.toEqual({ ok: false, reason: "refused" });
  });

  it("reports a refusal when the shell call itself fails", async () => {
    const d = deps();
    d.openPath.mockRejectedValueOnce(new Error("shell unavailable"));
    await expect(openLocalFolder(FOLDER, d)).resolves.toEqual({ ok: false, reason: "refused" });
  });
});

describe("folder link IPC", () => {
  it("serves the app's own main frame with exactly one argument", async () => {
    const s = setup();
    await expect(s.invoke(event("http://127.0.0.1:3001/notes/1"), FOLDER)).resolves.toEqual({
      ok: true,
    });
    expect(s.openPath).toHaveBeenCalledWith(`${FOLDER}\\`);
  });

  it("always hands the shell a trailing separator, once", async () => {
    for (const [input, opened] of [
      [FOLDER, `${FOLDER}\\`],
      ["C:\\", "C:\\"],
    ]) {
      const d = deps();
      await openLocalFolder(input, d);
      expect(d.openPath).toHaveBeenCalledWith(opened);
    }
  });

  it("rejects other origins, sub-frames, a missing server and extra arguments", async () => {
    const s = setup();
    await expect(s.invoke(event("https://evil.example/"), FOLDER)).rejects.toThrow();
    await expect(s.invoke(event("http://127.0.0.1:3001/", false), FOLDER)).rejects.toThrow();
    await expect(s.invoke(event("http://127.0.0.1:3001/"))).rejects.toThrow();
    await expect(s.invoke(event("http://127.0.0.1:3001/"), FOLDER, "x")).rejects.toThrow();
    await expect(
      setup(() => undefined).invoke(event("http://127.0.0.1:3001/"), FOLDER),
    ).rejects.toThrow();
    expect(s.openPath).not.toHaveBeenCalled();
  });
});
