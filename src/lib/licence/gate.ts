import {
  evaluate,
  openCheckIn,
  openLicence,
  readMark,
  trustedNow,
  type LicenceStatus,
  type PublicKeys,
} from "./policy";
import { readStoredLicence, type StoredLicence } from "./repository";

export const GATE_CACHE_FOR = 30_000;

export interface GateEnv {
  enforce: boolean;
  machineHash: string;
  keys: PublicKeys;
  markKey: Buffer;
}

function parseKeys(raw: string | undefined): PublicKeys {
  try {
    const value = JSON.parse(raw ?? "{}") as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, key]) => typeof key === "string"),
    ) as PublicKeys;
  } catch {
    return {};
  }
}

export function gateEnv(env: NodeJS.ProcessEnv = process.env): GateEnv {
  return {
    enforce: env.PM_LICENCE_ENFORCE === "1",
    machineHash: env.PM_LICENCE_MACHINE ?? "",
    keys: parseKeys(env.PM_LICENCE_PUBLIC_KEYS),
    markKey: Buffer.from(env.PM_LICENCE_MARK_KEY ?? "", "base64url"),
  };
}

export function licenceStatus(
  env: GateEnv,
  stored: StoredLicence | null,
  wall: number,
): LicenceStatus {
  if (!env.enforce) return "off";
  const licence = openLicence(stored?.licence, env.keys);
  const checkIn = licence
    ? openCheckIn(stored?.checkIn, env.keys, {
        licenceId: licence.licenceId,
        machineHash: env.machineHash,
      })
    : null;
  const mark = readMark(stored?.mark, env.markKey);
  const lastServerTime = checkIn?.serverTime ?? null;
  const floors = [typeof mark === "number" ? mark : 0, lastServerTime ?? 0];
  return evaluate({
    enforce: true,
    licence,
    machineHash: env.machineHash,
    now: trustedNow({ wall, monotonic: 0, anchor: null, floors }),
    lastServerTime,
    markTrusted: typeof mark === "number",
  });
}

export function allowsChanges(status: LicenceStatus): boolean {
  return status === "active" || status === "off";
}

export function createLicenceGate(deps: {
  env: () => GateEnv;
  read: (machineHash: string) => Promise<StoredLicence | null>;
  wall: () => number;
}): () => Promise<LicenceStatus> {
  let cached: { status: LicenceStatus; until: number } | null = null;
  return async () => {
    const env = deps.env();
    if (!env.enforce) return "off";
    const wall = deps.wall();
    if (cached && wall >= cached.until - GATE_CACHE_FOR && wall < cached.until)
      return cached.status;
    const stored = env.machineHash ? await deps.read(env.machineHash) : null;
    const status = licenceStatus(env, stored, wall);
    cached = { status, until: wall + GATE_CACHE_FOR };
    return status;
  };
}

export const currentLicenceStatus = createLicenceGate({
  env: gateEnv,
  read: readStoredLicence,
  wall: Date.now,
});
