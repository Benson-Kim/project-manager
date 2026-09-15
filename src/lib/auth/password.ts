import argon2 from "argon2";

/**
 * Password hashing (STANDARDS §4): argon2id m=19456 KiB, t=2, p=1 (OWASP
 * baseline). Server-only — argon2 is a native module; the shared zod policy
 * lives in ./password-policy so client bundles never import this file.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Constant-time verify; returns false on malformed hashes instead of throwing. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
