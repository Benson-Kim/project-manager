import crypto from "crypto";
import { connect, sql, type DbTarget } from "./db";
import type { Logger } from "./log";

/** The subset of the `argon2` package we use (loaded from the Next standalone bundle). */
export interface Argon2Like {
  argon2id: number;
  hash(
    password: string,
    options: { type: number; memoryCost: number; timeCost: number; parallelism: number },
  ): Promise<string>;
}

export const ADMIN_USERNAME = "admin";

/**
 * Human-friendly one-time password (no 0/O/1/l/I). The user must replace it at
 * first login: MustChangePassword = 1 is enforced by src/proxy.ts.
 */
export function generateInitialPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    groups.push(s);
  }
  return groups.join("-");
}

/** STANDARDS §4 argon2id parameters — identical to scripts/hash-password.mjs. */
export function hashPassword(argon2: Argon2Like, password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Make sure at least one active administrator exists. Checked on every launch
 * (not a "first run" flag), so a failed first start can never leave the app
 * with nobody able to log in. Returns the new password when one was created.
 */
export async function ensureAdminAccount(
  target: DbTarget,
  argon2: Argon2Like,
  log: Logger,
): Promise<string | null> {
  const pool = await connect(target, target.database, 1);
  try {
    const r = await pool.request().query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM auth.[User] u JOIN auth.Role r ON r.RoleId = u.RoleId
        WHERE r.Name = N'Admin' AND u.IsDeleted = 0 AND u.IsActive = 1`,
    );
    if (r.recordset[0].n > 0) return null;
    log.warn("[admin] no active administrator — creating one");
    return await setAdminPassword(pool, argon2);
  } finally {
    await pool.close();
  }
}

/** Tray action "Reset administrator password…". */
export async function resetAdminPassword(
  target: DbTarget,
  argon2: Argon2Like,
  log: Logger,
): Promise<string> {
  const pool = await connect(target, target.database, 1);
  try {
    log.info("[admin] resetting administrator password");
    return await setAdminPassword(pool, argon2);
  } finally {
    await pool.close();
  }
}

async function setAdminPassword(pool: sql.ConnectionPool, argon2: Argon2Like): Promise<string> {
  const password = generateInitialPassword();
  const hash = await hashPassword(argon2, password);
  const result = await pool
    .request()
    .input("username", sql.NVarChar, ADMIN_USERNAME)
    .input("hash", sql.NVarChar, hash)
    .query<{ outcome: string }>(
      `SET XACT_ABORT ON;
       BEGIN TRAN;
       DECLARE @roleId INT = (SELECT RoleId FROM auth.Role WHERE Name = N'Admin');
       IF @roleId IS NULL THROW 50000, N'Admin role missing (seed 026 not applied)', 1;
       IF EXISTS (SELECT 1 FROM auth.[User] WHERE Username = @username AND IsDeleted = 0)
       BEGIN
           UPDATE auth.[User]
              SET PasswordHash = @hash, RoleId = @roleId, IsActive = 1, MustChangePassword = 1,
                  FailedLoginCount = 0, LockedUntilUtc = NULL, SessionVersion = SessionVersion + 1,
                  UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = 0
            WHERE Username = @username AND IsDeleted = 0;
           SELECT N'updated' AS outcome;
       END
       ELSE
       BEGIN
           INSERT INTO auth.[User] (Username, PasswordHash, DisplayName, RoleId, MustChangePassword, CreatedBy)
           VALUES (@username, @hash, N'Administrator', @roleId, 1, 0);
           SELECT N'created' AS outcome;
       END
       COMMIT;`,
    );
  if (!result.recordset[0]?.outcome) throw new Error("Administrator account could not be saved");
  return password;
}
