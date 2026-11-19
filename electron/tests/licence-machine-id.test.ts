import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("child_process", () => ({ execFile }));

import { hashMachineGuid, readMachineHash } from "../licence/machine-id";

const GUID = "0f6c1c2e-1111-2222-3333-444455556666";

describe("readMachineHash", () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it("queries the Cryptography key with its backslashes and no shell", async () => {
    execFile.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, `    MachineGuid    REG_SZ    ${GUID}\r\n`),
    );
    await expect(readMachineHash()).resolves.toBe(hashMachineGuid(GUID));
    const [cmd, args, opts] = execFile.mock.calls[0];
    expect(cmd).toBe("reg.exe");
    expect(args[1]).toBe("HKLM\\SOFTWARE\\Microsoft\\Cryptography");
    expect(opts.shell).toBeUndefined();
  });

  it("returns null when reg.exe fails", async () => {
    execFile.mockImplementation((_cmd, _args, _opts, cb) => cb(new Error("not found"), ""));
    await expect(readMachineHash()).resolves.toBeNull();
  });
});
