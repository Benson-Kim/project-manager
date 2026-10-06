import fs from "fs";
import path from "path";
import type { DbTarget } from "./db";

/**
 * Machine-wide configuration written by the elevated provisioning script
 * (electron/setup/provision.ps1) — never by the app. The SQL Server instance
 * is per-machine, so its credentials must be too: every Windows user on the
 * PC reads the same file, and losing a user profile can no longer lock the
 * app out of its own data.
 */
export interface MachineConfig {
  schemaVersion: 1;
  sql: DbTarget & { instanceName: string };
  authSecret: string;
  backupDir: string;
}

export class SetupRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupRequiredError";
  }
}

export function machineConfigPath(): string {
  // PM_MACHINE_CONFIG lets the integration test / a developer point the app at
  // another SQL Server; the installer never sets it.
  if (process.env.PM_MACHINE_CONFIG) return process.env.PM_MACHINE_CONFIG;
  const programData = process.env.ProgramData ?? "C:\\ProgramData";
  return path.join(programData, "Project Manager", "machine.json");
}

export function readMachineConfig(file = machineConfigPath()): MachineConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch {
    throw new SetupRequiredError(`Database configuration not found (${file}).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new SetupRequiredError(`Database configuration is unreadable (${file}).`);
  }
  const c = parsed as Partial<MachineConfig>;
  const s = c.sql;
  if (
    c.schemaVersion !== 1 ||
    !s ||
    !s.host ||
    !s.port ||
    !s.user ||
    !s.password ||
    !s.database ||
    !s.instanceName ||
    !c.authSecret ||
    !c.backupDir
  ) {
    throw new SetupRequiredError(`Database configuration is incomplete (${file}).`);
  }
  return c as MachineConfig;
}
