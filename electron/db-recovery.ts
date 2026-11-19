import type { Logger } from "./log";
import type { ServiceState } from "./sql-service";

export interface RecoveryDeps {
  reachable(): Promise<boolean>;
  serviceState(): Promise<ServiceState>;
  startService(): Promise<boolean>;
  /** Proves that the configured SQL login works, not just that a port is open. */
  waitForSql(): Promise<void>;
  /** Offers an in-app repair and waits for Windows approval and completion. */
  repairService(): Promise<boolean>;
  log: Logger;
}

export interface DatabaseRecovery {
  ensureReady(): Promise<boolean>;
  repair(): Promise<boolean>;
}

/** Shared by launch, resume, the watchdog and sign-in. Never repeats an app mutation. */
export function createDatabaseRecovery(deps: RecoveryDeps): DatabaseRecovery {
  let checking: Promise<boolean> | undefined;
  let repairing: Promise<boolean> | undefined;

  const check = (): Promise<boolean> => {
    if (checking) return checking;
    checking = (async () => {
      try {
        if (!(await deps.reachable())) {
          let state = await deps.serviceState();
          deps.log.warn(`[database] connection unavailable (service ${state})`);
          const stopDeadline = Date.now() + 30_000;
          while (state === "stopping" && Date.now() < stopDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 1_000));
            state = await deps.serviceState();
          }
          if (state === "missing" || state === "paused") return false;
          if (state === "stopping") return false;
          if (state === "stopped") {
            // Windows may start the service between the query and this command.
            // A failed command still gets a readiness check before offering repair.
            if (!(await deps.startService())) {
              const afterStart = await deps.serviceState();
              if (afterStart === "stopped" || afterStart === "missing" || afterStart === "paused") {
                return false;
              }
            }
          }
        }
        // A running or starting service can take time to accept a SQL login.
        await deps.waitForSql();
        return true;
      } catch (err) {
        deps.log.error("[database] automatic recovery failed", err);
        return false;
      }
    })().finally(() => {
      checking = undefined;
    });
    return checking;
  };

  return {
    ensureReady: () => repairing ?? check(),
    repair() {
      if (repairing) return repairing;
      repairing = (async () => {
        try {
          if (await check()) return true;
          if (!(await deps.repairService())) return false;
          return await check();
        } catch (err) {
          deps.log.error("[database] connection repair failed", err);
          return false;
        }
      })().finally(() => {
        repairing = undefined;
      });
      return repairing;
    },
  };
}
