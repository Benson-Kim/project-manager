import {
  evaluate,
  OFFLINE_GRACE,
  openCheckIn,
  openLicence,
  readMark,
  trustedNow,
  type LicenceStatus,
  type PublicKeys,
} from "./policy";
import { readStoredLicence, type StoredLicence } from "./repository";

export const GATE_CACHE_FOR = 5_000;

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

function assess(
  env: GateEnv,
  stored: StoredLicence | null,
  wall: number,
  seenMark = 0,
): { status: LicenceStatus; changesAt: number; mark: number } {
  if (!env.enforce) return { status: "off", changesAt: Infinity, mark: seenMark };
  const licence = openLicence(stored?.licence, env.keys);
  const checkIn = licence
    ? openCheckIn(stored?.checkIn, env.keys, {
        licenceId: licence.licenceId,
        machineHash: env.machineHash,
      })
    : null;
  const mark = readMark(stored?.mark, env.markKey);
  const lastServerTime = checkIn?.serverTime ?? null;
  const highest = Math.max(seenMark, typeof mark === "number" ? mark : 0);
  const floors = [highest, lastServerTime ?? 0];
  const status = evaluate({
    enforce: true,
    licence,
    machineHash: env.machineHash,
    now: trustedNow({ wall, monotonic: 0, anchor: null, floors }),
    lastServerTime,
    markTrusted: typeof mark === "number",
  });
  const changesAt =
    licence?.kind === "trial"
      ? Math.min(licence.expiresAt ?? Infinity, (lastServerTime ?? Infinity) + OFFLINE_GRACE)
      : Infinity;
  return { status, changesAt, mark: highest };
}

export function licenceStatus(
  env: GateEnv,
  stored: StoredLicence | null,
  wall: number,
): LicenceStatus {
  return assess(env, stored, wall).status;
}

export function allowsChanges(status: LicenceStatus): boolean {
  return status === "active" || status === "off";
}

export type LicenceGate = (() => Promise<LicenceStatus>) & { invalidate(): void };

export function createLicenceGate(deps: {
  env: () => GateEnv;
  read: (machineHash: string) => Promise<StoredLicence | null>;
  wall: () => number;
}): LicenceGate {
  let seenMark = 0;
  let cached: { status: LicenceStatus; from: number; until: number } | null = null;
  let pending: Promise<LicenceStatus> | null = null;
  const load = async (env: GateEnv, wall: number) => {
    const stored = env.machineHash ? await deps.read(env.machineHash) : null;
    const { status, changesAt, mark } = assess(env, stored, wall, seenMark);
    seenMark = mark;
    cached =
      status === "active"
        ? { status, from: wall, until: Math.min(wall + GATE_CACHE_FOR, changesAt) }
        : null;
    return status;
  };
  const gate = async () => {
    const env = deps.env();
    if (!env.enforce) return "off";
    const wall = deps.wall();
    if (cached && wall >= cached.from && wall < cached.until) return cached.status;
    pending ??= load(env, wall).finally(() => {
      pending = null;
    });
    return pending;
  };
  return Object.assign(gate, {
    invalidate() {
      cached = null;
    },
  });
}

export const currentLicenceStatus = createLicenceGate({
  env: gateEnv,
  read: readStoredLicence,
  wall: Date.now,
});
