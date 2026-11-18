import { execFile } from "child_process";
import { createHash } from "crypto";

export const MACHINE_GUID_QUERY = [
  "query",
  String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`,
  "/v",
  "MachineGuid",
  "/reg:64",
] as const;

const GUID = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/;

export function hashMachineGuid(guid: string): string {
  return createHash("sha256").update(`modulus-machine:${guid.trim().toLowerCase()}`).digest("hex");
}

export function parseMachineGuid(regOutput: string): string | null {
  return GUID.exec(regOutput)?.[1] ?? null;
}

export function readMachineHash(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      MACHINE_GUID_QUERY,
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        const guid = error ? null : parseMachineGuid(String(stdout));
        resolve(guid ? hashMachineGuid(guid) : null);
      },
    );
  });
}
