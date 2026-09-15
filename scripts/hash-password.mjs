// Hash a password with argon2id (STANDARDS §4 params) for seeding.
// Usage: node scripts/hash-password.mjs <ENV_VAR_NAME>
// Reads the plaintext from the named environment variable (never argv — argv
// is visible in process listings) and prints the encoded hash to stdout.
import argon2 from "argon2";

const varName = process.argv[2];
const password = varName ? process.env[varName] : undefined;
if (!varName || !password) {
  console.error("usage: node scripts/hash-password.mjs <ENV_VAR_NAME> (variable must be set)");
  process.exit(1);
}

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
process.stdout.write(hash);
