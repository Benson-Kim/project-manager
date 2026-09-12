import sql from "mssql";
import { getEnv } from "./env";

/**
 * Shared connection pool. ALL data access goes through stored procedures —
 * repositories call `execProc`; inline SQL is forbidden (see AGENTS.md).
 */
let pool: Promise<sql.ConnectionPool> | undefined;

function config(): sql.config {
  const env = getEnv();
  return {
    server: env.DB_SERVER,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true, // local/dev containers; use proper certs in prod
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  };
}

export function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = new sql.ConnectionPool(config()).connect();
  }
  return pool;
}

export type ProcParams = Record<string, string | number | boolean | Date | null>;

/** Execute a stored procedure with named, parameterised inputs. */
export async function execProc<T = unknown>(
  procName: string,
  params: ProcParams = {},
): Promise<T[]> {
  const p = await getPool();
  const request = p.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  const result = await request.execute(procName);
  return (result.recordset ?? []) as T[];
}

export { sql };
