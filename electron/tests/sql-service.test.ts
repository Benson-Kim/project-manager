import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServiceState,
  runElevatedRepair,
  runElevatedServiceRepair,
  startService,
} from "../sql-service";

const ps = vi.hoisted(() => ({
  answer: "Running",
  error: null as (Error & { code?: number; stdout?: string; stderr?: string }) | null,
  exec: vi.fn(),
}));

vi.mock("child_process", () => ({ execFile: ps.exec }));

const log = { file: "", info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  ps.answer = "Running";
  ps.error = null;
  ps.exec.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (err: Error | null, out?: { stdout: string; stderr: string }) => void,
    ) => {
      if (ps.error) callback(ps.error);
      else callback(null, { stdout: `${ps.answer}\r\n`, stderr: "" });
    },
  );
});

describe("getServiceState", () => {
  it.each([
    ["Running", "running"],
    ["Stopped", "stopped"],
    ["StartPending", "starting"],
    ["StopPending", "stopping"],
    ["Paused", "paused"],
    ["Missing", "missing"],
    ["unrecognised", "unknown"],
  ])("maps %s without treating pending as stopped", async (answer, expected) => {
    ps.answer = answer;
    expect(await getServiceState("PROJECTMGR")).toBe(expected);
  });

  it("treats a failed or timed-out query as unknown, never as a missing service", async () => {
    ps.error = Object.assign(new Error("Command failed"), { killed: true });
    expect(await getServiceState("PROJECTMGR")).toBe("unknown");
  });

  it("rejects a service name containing PowerShell before launching a process", async () => {
    await expect(getServiceState("x'; Write-Host x")).rejects.toThrow("Invalid");
    expect(ps.exec).not.toHaveBeenCalled();
  });
});

describe("startService", () => {
  it("starts the configured instance with an explicit executable path and argument array", async () => {
    expect(await startService("PROJECTMGR", log)).toBe(true);
    expect(ps.exec.mock.calls[0][0]).toMatch(/System32[/\\]sc\.exe$/);
    expect(ps.exec.mock.calls[0][1]).toEqual(["start", "MSSQL$PROJECTMGR"]);
  });

  it("accepts ERROR_SERVICE_ALREADY_RUNNING when Windows wins the start race", async () => {
    ps.error = Object.assign(new Error("already running"), { code: 1056 });
    expect(await startService("PROJECTMGR", log)).toBe(true);
  });

  it("logs the Windows exit code and service error output on access denial", async () => {
    ps.error = Object.assign(new Error("Command failed"), {
      code: 5,
      stdout: "OpenService FAILED 5: Access is denied.",
    });
    expect(await startService("PROJECTMGR", log)).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("Access is denied"));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("code 5"));
  });
});

describe("service-only repair", () => {
  const target = { instanceName: "PROJECTMGR", port: 14330, dataRoot: "C:\\ProgramData\\Modulus" };

  it("passes the service-only switch, current instance, port and data root to elevated provisioning", async () => {
    expect(
      await runElevatedServiceRepair("C:\\Modulus\\provision.ps1", "C:\\sql.exe", target, log),
    ).toBe(0);
    const command = ps.exec.mock.calls[0][1].at(-1);
    expect(command).toContain("-ServiceOnly -InstanceName PROJECTMGR -Port 14330");
    expect(command).toContain('-DataRoot "C:\\ProgramData\\Modulus"');
    expect(command).toContain("-Verb RunAs");
    expect(command).toContain("$ErrorActionPreference = 'Stop'");
  });

  it("asks for the beta setup only from a beta app", async () => {
    await runElevatedRepair("provision.ps1", "sql.exe", log);
    await runElevatedRepair("provision.ps1", "sql.exe", log, true);
    const [client, beta] = ps.exec.mock.calls.map((call) => String(call[1].at(-1)));
    expect(client).not.toContain("-Beta");
    expect(beta).toContain("-Beta");
  });

  it("keeps normal first-install provisioning separate", async () => {
    expect(await runElevatedRepair("C:\\provision.ps1", "C:\\sql.exe", log)).toBe(0);
    expect(ps.exec.mock.calls[0][1].at(-1)).not.toContain("-ServiceOnly");
  });

  it("hands the SQL Server setup file over only when this copy of Modulus has it", async () => {
    await runElevatedRepair("C:\provision.ps1", process.execPath, log);
    expect(ps.exec.mock.calls[0][1].at(-1)).toContain("-SqlInstaller");
    await runElevatedRepair("C:\provision.ps1", "C:\missing\sql.exe", log);
    expect(ps.exec.mock.calls[1][1].at(-1)).not.toContain("-SqlInstaller");
  });

  it("explains in plain words when the engine needs the full installer", async () => {
    ps.error = Object.assign(new Error("failed"), { code: 20 });
    await expect(runElevatedRepair("C:\provision.ps1", "C:\missing\sql.exe", log)).rejects.toThrow(
      "This PC needs the full Modulus installer",
    );
  });

  it("propagates the repair exit code instead of reporting success", async () => {
    ps.error = Object.assign(new Error("failed"), { code: 40 });
    expect(await runElevatedServiceRepair("script.ps1", "sql.exe", target, log)).toBe(40);
  });

  it("handles a declined administrator prompt", async () => {
    ps.error = Object.assign(new Error("failed"), {
      code: 1,
      stderr: "The operation was canceled by the user.",
    });
    await expect(runElevatedServiceRepair("script.ps1", "sql.exe", target, log)).rejects.toThrow(
      "declined",
    );
  });

  it("rejects invalid arguments before requesting elevation", async () => {
    for (const invalid of [
      { ...target, port: 0 },
      { ...target, instanceName: "x;exit" },
      { ...target, dataRoot: 'x" -Command evil' },
    ]) {
      await expect(runElevatedServiceRepair("script.ps1", "sql.exe", invalid, log)).rejects.toThrow(
        "Invalid",
      );
    }
    expect(ps.exec).not.toHaveBeenCalled();
  });
});
