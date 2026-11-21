import os from "node:os";
import { createDatabaseRecovery } from "../../electron/db-recovery";
import type { Logger } from "../../electron/log";
import { getServiceState, isListening, startService } from "../../electron/sql-service";
import { getEnv } from "./env";

/** After a failed attempt, requests fail fast instead of each spawning Windows tools again. */
export const RETRY_AFTER_FAILURE_MS = 30_000;
const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 2_000;

const log: Logger = {
  file: "",
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message, err) => console.error(message, err),
};

export interface WebRecoveryTarget {
  instance: string;
  host: string;
  port: number;
}

export interface WebRecoveryDeps {
  /** Logs in with the app's own credentials; rejects until SQL Server accepts it. */
  probe(): Promise<void>;
  now?(): number;
  wait?(ms: number): Promise<void>;
}

/** The desktop's recovery steps, for a web server on the same PC as its SQL Server. */
export function createWebDatabaseRecovery(
  target: WebRecoveryTarget,
  deps: WebRecoveryDeps,
): () => Promise<boolean> {
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const recovery = createDatabaseRecovery({
    reachable: () => isListening(target.host, target.port),
    serviceState: () => getServiceState(target.instance),
    startService: () => startService(target.instance, log),
    async waitForSql() {
      const deadline = now() + READY_TIMEOUT_MS;
      for (;;) {
        try {
          return await deps.probe();
        } catch (err) {
          if (now() >= deadline) throw err;
        }
        await wait(READY_POLL_MS);
      }
    },
    repairService: async () => false,
    log,
  });
  let failedAt: number | undefined;
  return async () => {
    if (failedAt !== undefined && now() - failedAt < RETRY_AFTER_FAILURE_MS) return false;
    const ready = await recovery.ensureReady();
    failedAt = ready ? undefined : now();
    return ready;
  };
}

function isThisPc(server: string): boolean {
  const host = server.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", os.hostname().toLowerCase()].includes(host);
}

let recover: (() => Promise<boolean>) | null | undefined;

/**
 * Starts this PC's SQL Server service when DB_SERVICE_INSTANCE names it and it has
 * stopped, then waits until the app can log in. False when that is off or fails.
 */
export function recoverDatabase(probe: () => Promise<void>): Promise<boolean> {
  if (recover === undefined) {
    const env = getEnv();
    recover =
      process.platform === "win32" && env.DB_SERVICE_INSTANCE && isThisPc(env.DB_SERVER)
        ? createWebDatabaseRecovery(
            { instance: env.DB_SERVICE_INSTANCE, host: env.DB_SERVER, port: env.DB_PORT },
            { probe },
          )
        : null;
  }
  return recover ? recover() : Promise.resolve(false);
}
