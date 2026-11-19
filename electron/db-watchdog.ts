import type { Logger } from "./log";

/**
 * Notices a database engine that stopped while the app runs (client PC,
 * 2026-10-12: the service stopped at 04:59, the app kept running, and every
 * sign-in failed for hours). Each check is a cheap TCP probe; only when the
 * engine is gone does it look at the service, try to start it and wait for it.
 * The user hears about an outage once, and again only after a recovery.
 */
export interface WatchdogDeps {
  reachable: () => Promise<boolean>;
  /** Joins startup/sign-in recovery and proves SQL login readiness. */
  ensureReady: () => Promise<boolean>;
  onRecovered: () => void;
  onDown: () => void;
  log: Logger;
}

export type CheckResult = "ok" | "recovered" | "down" | "busy";

export function createDbWatchdog(deps: WatchdogDeps): { check: () => Promise<CheckResult> } {
  let running = false;
  let told = false;

  return {
    async check() {
      if (running) return "busy";
      running = true;
      try {
        if (await deps.reachable()) {
          if (told) {
            deps.log.info("[db-watchdog] the database engine is back");
            deps.onRecovered();
          }
          told = false;
          return "ok";
        }
        if (await deps.ensureReady()) {
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
      } catch (err) {
        deps.log.error("[db-watchdog] check failed", err);
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

