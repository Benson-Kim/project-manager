import argon2 from "argon2";
import { z } from "zod";
import { PASSWORD_DENYLIST } from "./password-denylist";

/**
 * Password hashing + policy (STANDARDS §4): argon2id m=19456 KiB, t=2, p=1
 * (OWASP baseline); min length 12, no composition rules, top-10k denylist.
 * Server-only — argon2 is a native module.
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

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters")
  .refine((password) => !PASSWORD_DENYLIST.has(password.toLowerCase()), {
    message: "That password is too common — pick something more unusual",
  });
