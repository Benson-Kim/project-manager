import sql from "mssql";

export interface DbTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Open a pool for desktop host tooling (schema apply, backup, restore, admin
 * bootstrap). The Next.js app itself keeps using src/lib/db.ts.
 */
export function connect(
  target: DbTarget,
  database: string = target.database,
  maxConnections = 4,
): Promise<sql.ConnectionPool> {
  return new sql.ConnectionPool({
    server: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: maxConnections, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 15_000,
    // Backups / restores / migrations on a slow laptop can take minutes.
    requestTimeout: 30 * 60_000,
  }).connect();
}

/** Wait until SQL Server accepts our login (the service may still be starting). */
export async function waitForSql(target: DbTarget, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const pool = await connect(target, "master", 1);
      await pool.close();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`SQL Server did not accept connections within ${timeoutMs / 1000}s: ${msg}`);
}

/** Bracket-quote an identifier (database names come from machine.json). */
export function quoteName(name: string): string {
  return `[${name.replace(/]/g, "]]")}]`;
}

export { sql };
