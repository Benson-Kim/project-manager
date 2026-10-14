import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServiceState } from "../sql-service";

const ps = vi.hoisted(() => ({ answer: null as string | null, error: null as Error | null }));

vi.mock("child_process", () => ({
  execFile: (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (err: Error | null, out?: { stdout: string; stderr: string }) => void,
  ) => {
    if (ps.error) callback(ps.error);
    else callback(null, { stdout: `${ps.answer}\r\n`, stderr: "" });
  },
}));

beforeEach(() => {
  ps.answer = null;
  ps.error = null;
});

describe("getServiceState", () => {
  it("reads Windows' answer", async () => {
    ps.answer = "Running";
    expect(await getServiceState("PROJECTMGR")).toBe("running");
    ps.answer = "Stopped";
    expect(await getServiceState("PROJECTMGR")).toBe("stopped");
    ps.answer = "Missing";
    expect(await getServiceState("PROJECTMGR")).toBe("missing");
  });

  it("treats a query that failed or timed out as stopped, not as an engine to reinstall", async () => {
    ps.error = Object.assign(new Error("Command failed: powershell.exe"), { killed: true });
    expect(await getServiceState("PROJECTMGR")).toBe("stopped");
  });
});
