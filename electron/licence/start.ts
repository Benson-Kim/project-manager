import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { BrowserWindow, powerMonitor, safeStorage } from "electron";
import type { DbTarget } from "../db";
import { describeError, type Logger } from "../log";
import { LICENCE_PUBLIC_KEYS, LICENCE_SERVICE_URL } from "./keys";
import { readMachineHash } from "./machine-id";
import { LicenceManager } from "./manager";
import { licensingEnforced, type LicenceStatus } from "./policy";
import { LicenceServiceClient, resolveServiceUrl, serviceBase } from "./service-client";
import { SqlLicenceMirror } from "./sql-mirror";
import { startUsageMeter } from "./usage-meter";
import { SealedStateFile } from "./state-file";

export interface ServerLicence {
  enforce: boolean;
  machineHash: string;
  publicKeys: string;
  markKey: string;
}

export interface LicenceSetup {
  manager: LicenceManager | null;
  server: ServerLicence;
  stop: () => void;
}

function readPackageJson(appPath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(appPath, "package.json"), "utf8")) as unknown;
  } catch {
    return null;
  }
}

const combine =
  (...stops: (() => void)[]) =>
  (): void =>
    stops.forEach((stop) => stop());

export async function startLicence(opts: {
  target: DbTarget;
  userData: string;
  appPath: string;
  log: Logger;
  onStatus?: (status: LicenceStatus) => void;
}): Promise<LicenceSetup> {
  let last: LicenceStatus | null = null;
  const notify = (status: LicenceStatus) => {
    if (status === last) return;
    last = status;
    opts.log.info(`licence: ${status}`);
    opts.onStatus?.(status);
  };
  const enforce = licensingEnforced(readPackageJson(opts.appPath));
  const publicKeys = JSON.stringify(LICENCE_PUBLIC_KEYS);
  const closed: LicenceSetup = {
    manager: null,
    server: {
      enforce,
      machineHash: "",
      publicKeys,
      markKey: randomBytes(32).toString("base64url"),
    },
    stop: () => undefined,
  };
  if (!enforce) return closed;
  try {
    const machineHash = await readMachineHash();
    if (!machineHash) {
      opts.log.warn("licence: this computer's id could not be read");
      return closed;
    }
    const base = serviceBase(resolveServiceUrl(LICENCE_SERVICE_URL, enforce));
    const manager = new LicenceManager({
      enforce,
      keys: LICENCE_PUBLIC_KEYS,
      machineHash,
      store: new SealedStateFile(path.join(opts.userData, "licence.bin"), safeStorage),
      mirror: new SqlLicenceMirror(opts.target, machineHash),
      service: base ? new LicenceServiceClient(base) : null,
      log: opts.log,
    });
    const status = await manager.start().catch((err: unknown) => {
      opts.log.warn(`licence: start failed: ${describeError(err)}`);
      return manager.status();
    });
    notify(status);
    if (manager.licence()) {
      void manager
        .checkIn()
        .then(notify, (err: unknown) =>
          opts.log.warn(`licence: check-in failed: ${describeError(err)}`),
        );
    }
    return {
      manager,
      server: { enforce, machineHash, publicKeys, markKey: manager.markKey },
      stop: combine(
        manager.schedule(notify),
        startUsageMeter({
          monotonic: () => performance.now(),
          focused: () => BrowserWindow.getFocusedWindow() !== null,
          idleSeconds: () => powerMonitor.getSystemIdleTime(),
          record: (ms) => {
            manager.recordUse(ms);
            notify(manager.status());
          },
        }),
      ),
    };
  } catch (err) {
    opts.log.warn(`licence: ${describeError(err)}`);
    return closed;
  }
}
