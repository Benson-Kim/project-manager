import { execProc } from "@/lib/db";

export interface StoredLicence {
  licence: unknown;
  checkIn: unknown;
  mark: unknown;
}

export async function readStoredLicence(machineHash: string): Promise<StoredLicence | null> {
  const [row] = await execProc<{ State: string | null }>("usp_Licence_Get", {
    MachineHash: machineHash,
  });
  if (!row?.State) return null;
  try {
    const value = JSON.parse(row.State) as Partial<StoredLicence> | null;
    if (typeof value !== "object" || value === null) return null;
    return {
      licence: value.licence ?? null,
      checkIn: value.checkIn ?? null,
      mark: value.mark ?? null,
    };
  } catch {
    return null;
  }
}
