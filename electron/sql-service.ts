import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import type { Logger } from "./log";

const execFileAsync = promisify(execFile);

/** 64-bit Windows PowerShell, regardless of how we were started. */
function powershellPath(): string {
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export type ServiceState = "running" | "stopped" | "missing";

export async function getServiceState(instanceName: string): Promise<ServiceState> {
  try {
    const { stdout } = await execFileAsync(
      powershellPath(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$s = Get-Service -Name 'MSSQL$${instanceName}' -ErrorAction SilentlyContinue; if ($s) { $s.Status } else { 'Missing' }`,
      ],
      { windowsHide: true, timeout: 30_000 },
    );
    const status = stdout.trim().toLowerCase();
    if (status === "missing") return "missing";
    return status === "running" ? "running" : "stopped";
  } catch {
    return "missing";
  }
}

/**
 * Run the provisioning script elevated (one UAC prompt) and wait for it.
 * Used when the installer's database step failed or the engine broke later.
 * Resolves with the script's exit code; rejects if the user declines UAC.
 */
export async function runElevatedRepair(scriptPath: string, sqlInstaller: string, log: Logger): Promise<number> {
  const esc = (s: string) => s.replace(/'/g, "''");
  const inner =
    `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" -SqlInstaller "${sqlInstaller}"`;
  const command =
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
