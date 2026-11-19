import type { ActionResult } from "./action";
import { messages } from "./messages";

export interface DesktopDatabaseBridge {
  ensureDatabase?: () => Promise<boolean>;
}

/** Recovery happens before authentication, so neither credentials nor writes are replayed. */
export async function signInWithDatabase(
  bridge: DesktopDatabaseBridge | undefined,
  signIn: () => Promise<ActionResult<never>>,
  checking: (active: boolean) => void,
): Promise<ActionResult<never>> {
  if (bridge?.ensureDatabase) {
    let ready = false;
    checking(true);
    try {
      ready = (await bridge.ensureDatabase()) === true;
    } catch {
      ready = false;
    } finally {
      checking(false);
    }
    if (!ready) {
      return { ok: false, error: { code: "INTERNAL", message: messages.auth.connectionFailed } };
    }
  }
  return signIn();
}
