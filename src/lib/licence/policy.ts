import { createHmac, createPublicKey, timingSafeEqual, verify } from "crypto";

export const OFFLINE_GRACE = 24 * 60 * 60 * 1000;

export type LicenceKind = "trial" | "free" | "full";
export type LicenceStatus = "active" | "expired" | "reconnect" | "unlicensed" | "off";
export type PublicKeys = Readonly<Record<string, string>>;

export interface SignedDocument {
  kid: string;
  payload: string;
  sig: string;
}

export interface Licence {
  licenceId: string;
  kind: LicenceKind;
  machineHash: string;
  startsAt: number;
  expiresAt: number | null;
  updatesUntil: number | null;
}

export interface CheckIn {
  serverTime: number;
  licence: Licence;
  licenceDocument: SignedDocument;
}

export interface Mark {
  at: number;
  mac: string;
}

export interface Anchor {
  serverTime: number;
  monotonicAt: number;
}

const KINDS: readonly string[] = ["trial", "free", "full"];
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isOptionalTime = (value: unknown): value is number | null => value === null || isTime(value);

export function licensingEnforced(packageJson: unknown): boolean {
  return (packageJson as { licensing?: unknown } | null)?.licensing === "enforce";
}

function isDocument(value: unknown): value is SignedDocument {
  const doc = value as Partial<SignedDocument> | null;
  return (
    typeof doc === "object" &&
    doc !== null &&
    typeof doc.kid === "string" &&
    typeof doc.payload === "string" &&
    typeof doc.sig === "string"
  );
}

export const DOCUMENT_ISSUER = "modulus-licence-service";
export const DOCUMENT_AUDIENCE = "modulus-desktop";
export type DocumentType = "licence" | "checkin";

function openPayload(
  document: unknown,
  keys: PublicKeys,
  typ: DocumentType,
): Record<string, unknown> | null {
  if (!isDocument(document) || !Object.hasOwn(keys, document.kid)) return null;
  try {
    const key = createPublicKey({
      key: Buffer.from(keys[document.kid] ?? "", "base64url"),
      format: "der",
      type: "spki",
    });
    const signed = Buffer.from(document.payload, "ascii");
    if (!verify(null, signed, key, Buffer.from(document.sig, "base64url"))) return null;
    const payload = JSON.parse(
      Buffer.from(document.payload, "base64url").toString("utf8"),
    ) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const claims = payload as { v?: unknown; typ?: unknown; aud?: unknown; iss?: unknown };
    if (
      claims.typ !== typ ||
      claims.aud !== DOCUMENT_AUDIENCE ||
      claims.iss !== DOCUMENT_ISSUER ||
      claims.v !== 1
    ) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function openLicence(document: unknown, keys: PublicKeys): Licence | null {
  const p = openPayload(document, keys, "licence");
  if (
    !p ||
    typeof p.licenceId !== "string" ||
    typeof p.machineHash !== "string" ||
    typeof p.kind !== "string" ||
    !KINDS.includes(p.kind) ||
    !isTime(p.startsAt) ||
    !isOptionalTime(p.expiresAt) ||
    !isOptionalTime(p.updatesUntil)
  ) {
    return null;
  }
  return {
    licenceId: p.licenceId,
    kind: p.kind as LicenceKind,
    machineHash: p.machineHash,
    startsAt: p.startsAt,
    expiresAt: p.expiresAt,
    updatesUntil: p.updatesUntil,
  };
}

export function openCheckIn(
  document: unknown,
  keys: PublicKeys,
  expected: { licenceId: string; machineHash: string; nonce?: string },
): CheckIn | null {
  const p = openPayload(document, keys, "checkin");
  if (
    !p ||
    p.licenceId !== expected.licenceId ||
    p.machineHash !== expected.machineHash ||
    (expected.nonce !== undefined && p.nonce !== expected.nonce) ||
    !isTime(p.serverTime)
  ) {
    return null;
  }
  const licence = openLicence(p.licence, keys);
  if (
    !licence ||
    licence.licenceId !== expected.licenceId ||
    licence.machineHash !== expected.machineHash
  )
    return null;
  return { serverTime: p.serverTime, licence, licenceDocument: p.licence as SignedDocument };
}

export const MARK_KEY_BYTES = 32;

function markMac(at: number, key: Buffer): Buffer {
  return createHmac("sha256", key).update(`modulus-mark:${at}`).digest();
}

export function sealMark(at: number, key: Buffer): Mark {
  return { at, mac: markMac(at, key).toString("base64url") };
}

export function readMark(mark: unknown, key: Buffer): number | "none" | "tampered" {
  if (mark === null || mark === undefined) return "none";
  if (key.length < MARK_KEY_BYTES) return "tampered";
  const { at, mac } = mark as Partial<Mark>;
  if (!isTime(at) || typeof mac !== "string") return "tampered";
  const given = Buffer.from(mac, "base64url");
  const wanted = markMac(at, key);
  return given.length === wanted.length && timingSafeEqual(given, wanted) ? at : "tampered";
}

export function trustedNow(input: {
  wall: number;
  monotonic: number;
  anchor: Anchor | null;
  floors: number[];
}): number {
  const base = input.anchor
    ? input.anchor.serverTime + Math.max(0, input.monotonic - input.anchor.monotonicAt)
    : input.wall;
  return Math.max(base, ...input.floors);
}

export function evaluate(input: {
  enforce: boolean;
  licence: Licence | null;
  machineHash: string;
  now: number;
  lastServerTime: number | null;
  markTrusted: boolean;
}): LicenceStatus {
  if (!input.enforce) return "off";
  const { licence } = input;
  if (!licence || licence.machineHash !== input.machineHash) return "unlicensed";
  if (licence.kind !== "trial") return "active";
  if (licence.expiresAt === null) return "unlicensed";
  if (input.now >= licence.expiresAt) return "expired";
  if (
    !input.markTrusted ||
    input.lastServerTime === null ||
    input.now - input.lastServerTime > OFFLINE_GRACE
  ) {
    return "reconnect";
  }
  return "active";
}
