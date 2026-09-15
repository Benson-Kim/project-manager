import sql from "mssql";
import { getEnv } from "./env";
import { AppError, appErrorFromProc } from "./errors";

/**
 * Shared connection pool. ALL data access goes through stored procedures —
 * repositories call `execProc` / `execProcTx`; inline SQL is forbidden
 * (enforced by ESLint `no-restricted-syntax` and src/test/no-inline-sql.test.ts;
 * see AGENTS.md).
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
    pool = new sql.ConnectionPool(config())
      .connect()
      .then((p) => {
        // Idle/broken connection errors must not crash the process.
        p.on("error", (err) => {
          console.error("[db] pool error:", err);
        });
        return p;
      })
      .catch((err) => {
        // Do NOT cache a rejected promise — allow the next call to retry.
        pool = undefined;
        throw err;
      });
  }
  return pool;
}

/** For tests / graceful shutdown. */
export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await (await p).close();
  }
}

export type ProcParams = Record<string, string | number | boolean | Date | null>;

export interface ProcResult<T> {
  rows: T[];
  /** RETURN value of the procedure (0 = success by convention). */
  returnValue: number;
  rowsAffected: number[];
}

async function bindAndExecute<T>(
  request: sql.Request,
  procName: string,
  params: ProcParams,
): Promise<sql.IProcedureResult<T>> {
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  try {
    return await request.execute<T>(procName);
  } catch (err) {
    // ADR-0012: THROW 50001–50005 from procs → typed AppError; anything else
    // is logged server-side and surfaced as an opaque INTERNAL error.
    if (err instanceof sql.RequestError && typeof err.number === "number") {
      if (err.number >= 50001 && err.number <= 50999) {
        throw appErrorFromProc(err.number, err.message);
      }
    }
    console.error(`[db] ${procName} failed:`, err);
    throw new AppError("INTERNAL", "Database operation failed");
  }
}

/** Execute a stored procedure with named, parameterised inputs. */
export async function execProc<T = unknown>(
  procName: string,
  params: ProcParams = {},
): Promise<T[]> {
  const result = await execProcFull<T>(procName, params);
  return result.rows;
}

/** Execute a stored procedure and return rows + return value + rowsAffected. */
export async function execProcFull<T = unknown>(
  procName: string,
  params: ProcParams = {},
): Promise<ProcResult<T>> {
  const p = await getPool();
  const result = await bindAndExecute<T>(p.request(), procName, params);
  return {
    rows: (result.recordset ?? []) as T[],
    returnValue: result.returnValue,
    rowsAffected: result.rowsAffected,
  };
}

/** Execute a stored procedure inside an existing transaction. */
export async function execProcTx<T = unknown>(
  tx: sql.Transaction,
  procName: string,
  params: ProcParams = {},
): Promise<T[]> {
  const result = await bindAndExecute<T>(new sql.Request(tx), procName, params);
  return (result.recordset ?? []) as T[];
}

/**
 * Run several proc calls atomically. Rolls back on any thrown error.
 *
 *   await withTransaction(async (tx) => {
 *     await execProcTx(tx, "usp_A", {...});
 *     await execProcTx(tx, "usp_B", {...});
 *   });
 */
export async function withTransaction<T>(fn: (tx: sql.Transaction) => Promise<T>): Promise<T> {
  const p = await getPool();
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // connection already dead — nothing to roll back
    }
    throw err;
  }
}

export { sql };
