import type { Logger } from "./log";
import type { ServiceState } from "./sql-service";

/**
 * Notices a database engine that stopped while the app runs (client PC,
 * 2026-10-12: the service stopped at 04:59, the app kept running, and every
 * sign-in failed for hours). Each check is a cheap TCP probe; only when the
 * engine is gone does it look at the service, try to start it and wait for it.
 * The user hears about an outage once, and again only after a recovery.
 */
export interface WatchdogDeps {
  reachable: () => Promise<boolean>;
  serviceState: () => Promise<ServiceState>;
  /** false when Windows refused (a standard user before provisioning granted the right). */
  startService: () => Promise<boolean>;
  /** Resolves when the engine accepts logins again; rejects on timeout. */
  waitForSql: () => Promise<void>;
  onRecovered: () => void;
  onDown: () => void;
  log: Logger;
}

export type CheckResult = "ok" | "recovered" | "down" | "busy";

export function createDbWatchdog(deps: WatchdogDeps): { check: () => Promise<CheckResult> } {
  let running = false;
  let told = false;

  const recover = async (): Promise<boolean> => {
    const state = await deps.serviceState();
    deps.log.warn(`[db-watchdog] the database engine is not answering (service ${state})`);
    if (state !== "stopped" || !(await deps.startService())) return false;
    try {
      await deps.waitForSql();
      return true;
    } catch (err) {
      deps.log.error("[db-watchdog] started, but the engine did not come up", err);
      return false;
    }
  };

  return {
    async check() {
      if (running) return "busy";
      running = true;
      try {
        if (await deps.reachable()) {
          if (told) deps.log.info("[db-watchdog] the database engine is back");
          told = false;
          return "ok";
        }
        if (await recover()) {
          deps.log.info("[db-watchdog] restarted the database engine");
          told = false;
          deps.onRecovered();
          return "recovered";
        }
        if (!told) {
          told = true;
          deps.onDown();
        }
        return "down";
      } finally {
        running = false;
      }
    },
  };
}
