import type { IpcMainInvokeEvent } from "electron";
import path from "path";
import { localPathProblem, type OpenLocalPathResult } from "../src/lib/rich-text/links";
import { OPEN_LOCAL_PATH_CHANNEL } from "./ipc-channels";

export type { OpenLocalPathResult };

interface LocalPathIpcDeps {
  handle(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<OpenLocalPathResult>,
  ): void;
  serverUrl(): string | undefined;
  isDirectory(folder: string): boolean;
  /** shell.openPath: resolves to "" on success, an error message otherwise. */
  openPath(folder: string): Promise<string>;
}

function fromAppPage(event: IpcMainInvokeEvent, serverUrl: string | undefined): boolean {
  const frame = event.senderFrame;
  try {
    return Boolean(
      serverUrl &&
      frame &&
      frame === event.sender.mainFrame &&
      new URL(frame.url).origin === new URL(serverUrl).origin,
    );
  } catch {
    return false;
  }
}

/**
 * Opens a folder link from a note (ADR-0075). The renderer's checks are only
 * advice: the path is checked again here, and only an existing folder opens.
 */
export async function openLocalFolder(
  input: unknown,
  deps: Pick<LocalPathIpcDeps, "isDirectory" | "openPath">,
): Promise<OpenLocalPathResult> {
  if (typeof input !== "string" || localPathProblem(input) !== null) {
    return { ok: false, reason: "refused" };
  }
  const folder = path.win32.normalize(input.trim());
  if (localPathProblem(folder) !== null) return { ok: false, reason: "refused" };
  let isFolder = false;
  try {
    isFolder = deps.isDirectory(folder);
  } catch {
    isFolder = false;
  }
  if (!isFolder) return { ok: false, reason: "notFound" };
  // Without the trailing separator Windows can run "name.exe" or "name.bat"
  // that sits beside the folder "name".
  const opened = await deps.openPath(path.win32.join(folder, path.win32.sep)).then(
    (failure) => !failure,
    () => false,
  );
  return opened ? { ok: true } : { ok: false, reason: "refused" };
}

export function registerLocalPathIpc(deps: LocalPathIpcDeps): void {
  deps.handle(OPEN_LOCAL_PATH_CHANNEL, async (event, ...args) => {
    if (!fromAppPage(event, deps.serverUrl()) || args.length !== 1) {
      throw new Error("Folder links open only from the app's own pages.");
    }
    return openLocalFolder(args[0], deps);
  });
}
