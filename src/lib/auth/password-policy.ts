import { z } from "zod";
import { PASSWORD_DENYLIST } from "./password-denylist";

/**
 * Password policy (STANDARDS §4): min length 12, no composition rules,
 * top-10k denylist. Kept separate from ./password (argon2id hashing) so
 * client components can share the schema without pulling the native
 * argon2 module into the browser bundle.
 */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters")
  .refine((password) => !PASSWORD_DENYLIST.has(password.toLowerCase()), {
    message: "That password is too common — pick something more unusual",
  });
