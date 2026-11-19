import { execFile } from "child_process";
import net from "net";
import path from "path";
import { promisify } from "util";
import { describeError, type Logger } from "./log";

const execFileAsync = promisify(execFile);

/** 64-bit Windows PowerShell, regardless of how we were started. */
function powershellPath(): string {
  return path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

export type ServiceState =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "paused"
  | "missing"
  | "unknown";

function serviceName(instanceName: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(instanceName)) {
    throw new Error("Invalid SQL Server instance name.");
  }
  return `MSSQL$${instanceName}`;
}

/**
 * "missing" only when Windows says there is no such service. A query that fails
 * or times out is unknown; it must not trigger installation or a second start
 * of a service that is already starting.
 */
export async function getServiceState(instanceName: string): Promise<ServiceState> {
  const name = serviceName(instanceName);
  try {
    const { stdout } = await execFileAsync(
      powershellPath(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `try { (Get-Service -Name '${name}' -ErrorAction Stop).Status } ` +
          "catch { if ($_.FullyQualifiedErrorId -like 'NoServiceFoundForGivenName*') { 'Missing' } else { exit 1 } }",
      ],
      { windowsHide: true, timeout: 30_000 },
    );
    const status = stdout.trim().toLowerCase();
    const states: Record<string, ServiceState> = {
      running: "running",
      stopped: "stopped",
      startpending: "starting",
      stoppending: "stopping",
      paused: "paused",
      missing: "missing",
    };
    return states[status] ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Run the provisioning script elevated (one UAC prompt) and wait for it.
 * Used when the installer's database step failed or the engine broke later.
 * Resolves with the script's exit code; rejects if the user declines UAC.
 */
export async function runElevatedRepair(
  scriptPath: string,
  sqlInstaller: string,
  log: Logger,
): Promise<number> {
  return runProvisioning(scriptPath, sqlInstaller, log);
}

/** Repairs the existing service only; never resets SQL logins or machine.json. */
export async function runElevatedServiceRepair(
  scriptPath: string,
  sqlInstaller: string,
  target: { instanceName: string; port: number; dataRoot: string },
  log: Logger,
): Promise<number> {
  serviceName(target.instanceName);
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    throw new Error("Invalid SQL Server port.");
  }
  if (!target.dataRoot || /["\r\n]/.test(target.dataRoot)) {
    throw new Error("Invalid database configuration folder.");
  }
  return runProvisioning(
    scriptPath,
    sqlInstaller,
    log,
    ` -ServiceOnly -InstanceName ${target.instanceName} -Port ${target.port} -DataRoot "${target.dataRoot}"`,
  );
}

async function runProvisioning(
  scriptPath: string,
  sqlInstaller: string,
  log: Logger,
  extraArguments = "",
): Promise<number> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const inner = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" -SqlInstaller "${sqlInstaller}"${extraArguments}`;
  const command =
    "$ErrorActionPreference = 'Stop'; " +
    `$p = Start-Process -FilePath '${esc(powershellPath())}' -ArgumentList '${esc(inner)}' ` +
    `-Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
  log.info("[repair] requesting elevation for provisioning");
  try {
    await execFileAsync(powershellPath(), ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true,
      timeout: 60 * 60_000,
    });
    return 0;
  } catch (err) {
    const e = err as { code?: number; stderr?: string };
    if (e.stderr && /canceled by the user|operation was canceled/i.test(e.stderr)) {
      throw new Error("Administrator permission was declined.");
    }
    if (typeof e.code === "number") return e.code;
    throw err;
  }
}

/** Whether something accepts TCP connections there (cheap: no login, no PowerShell). */
export function isListening(host: string, port: number, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * Asks Windows to start the instance's service. Standard users may do this only
 * once provisioning granted it (provision.ps1 Set-ServiceRecovery); false otherwise.
 */
export async function startService(instanceName: string, log: Logger): Promise<boolean> {
  const name = serviceName(instanceName);
  try {
    await execFileAsync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "sc.exe"), ["start", name], {
      windowsHide: true,
      timeout: 30_000,
    });
    return true;
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string };
    // ERROR_SERVICE_ALREADY_RUNNING: Windows won the race; still wait for SQL readiness.
    if (e.code === 1056) return true;
    log.warn(
      `[database] could not start ${name} (code ${e.code ?? "unknown"}): ` +
        `${e.stdout?.trim() ?? ""} ${e.stderr?.trim() ?? ""}\n${describeError(err)}`,
    );
    return false;
  }
}

