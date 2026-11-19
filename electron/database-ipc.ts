import type { IpcMainInvokeEvent } from "electron";
import { DATABASE_READY_CHANNEL } from "./ipc-channels";

interface DatabaseIpcDeps {
  handle(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<boolean>,
  ): void;
  serverUrl(): string | undefined;
  ensureReady(): Promise<boolean>;
}

/** The renderer may request readiness; only the host chooses the target and commands. */
export function registerDatabaseIpc(deps: DatabaseIpcDeps): void {
  deps.handle(DATABASE_READY_CHANNEL, async (event, ...args) => {
    const frame = event.senderFrame;
    const serverUrl = deps.serverUrl();
    let allowed = false;
    try {
      if (serverUrl && frame && frame === event.sender.mainFrame) {
        allowed = new URL(frame.url).origin === new URL(serverUrl).origin;
      }
    } catch {
      allowed = false;
    }
    if (!allowed || args.length !== 0) {
      throw new Error("Database recovery is only for the app's own pages.");
    }
    return deps.ensureReady();
  });
}
