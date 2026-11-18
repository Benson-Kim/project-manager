export interface SignedDocument {
  kid: string;
  payload: string;
  sig: string;
}

export interface Signer {
  readonly kid: string;
  sign(data: Uint8Array): Promise<Uint8Array>;
}

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export const DOCUMENT_ISSUER = "modulus-licence-service";
export const DOCUMENT_AUDIENCE = "modulus-desktop";
export type DocumentType = "licence" | "checkin";

export async function signDocument(
  signer: Signer,
  typ: DocumentType,
  body: Record<string, unknown>,
): Promise<SignedDocument> {
  const claims = { typ, aud: DOCUMENT_AUDIENCE, iss: DOCUMENT_ISSUER };
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...body, ...claims })));
  const sig = await signer.sign(encoder.encode(payload));
  return { kid: signer.kid, payload, sig: toBase64Url(sig) };
}

export async function ed25519Signer(kid: string, pkcs8: Uint8Array): Promise<Signer> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    new Uint8Array(pkcs8),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  return {
    kid,
    sign: async (data) =>
      new Uint8Array(await crypto.subtle.sign("Ed25519", key, new Uint8Array(data))),
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomDigits(length: number): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return [...values].map((v) => String(v % 10)).join("");
}

export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 && expected.length > 0;
}
