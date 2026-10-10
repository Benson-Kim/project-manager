import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { connect, quoteName, sql, type DbTarget } from "./db";
import type { Logger } from "./log";

/**
 * Desktop port of scripts/db-apply.sh, hardened for unattended use on a
 * client PC where nobody can fix a half-applied schema by hand:
 *
 *  - Migrations: applied once (tracked in app.SchemaMigrations), each inside a
 *    transaction so a failure leaves nothing behind. A backup is taken first
 *    whenever an existing database is about to be upgraded.
 *  - Stored procedures (CREATE OR ALTER): re-applied only when the bundled
 *    procs change (content hash recorded as `procs@<hash>`), not every launch.
 *  - Seeds: applied once each (`seed:<file>`), so a future seed can never
 *    overwrite data the client has since edited.
 *  - The admin account is NOT seeded here — see admin-account.ts.
 */
export interface ApplyOptions {
  target: DbTarget;
  dbDir: string;
  log: Logger;
  /** Called once, before the first pending migration on an existing database. */
  backupBeforeMigrations?: () => Promise<void>;
}

export interface ApplyResult {
  createdDatabase: boolean;
  migrationsApplied: string[];
  procsApplied: boolean;
  seedsApplied: string[];
}

const SOURCE_DB_NAME = "ProjectManager";
// SQL Server errors meaning "statement not allowed inside a user transaction".
const NOT_IN_TRANSACTION_ERRORS = new Set([226, 574, 2010]);

export async function applyDatabaseSchema(opts: ApplyOptions): Promise<ApplyResult> {
  const { target, log } = opts;
  const result: ApplyResult = {
    createdDatabase: false,
    migrationsApplied: [],
    procsApplied: false,
    seedsApplied: [],
  };

  const master = await connect(target, "master", 1);
  try {
    const r = await master
      .request()
      .input("db", sql.NVarChar, target.database)
      .query<{ exists: number }>(
        "SELECT CASE WHEN DB_ID(@db) IS NULL THEN 0 ELSE 1 END AS [exists]",
      );
    if (r.recordset[0].exists === 0) {
      await master.request().batch(`CREATE DATABASE ${quoteName(target.database)}`);
      result.createdDatabase = true;
      log.info(`[db-apply] created database ${target.database}`);
    }
  } finally {
    await master.close();
  }

  const pool = await connect(target, target.database, 1);
  try {
    const applied = await readAppliedIds(pool);

    // ---- migrations ------------------------------------------------------
    const migrationFiles = await listSqlFiles(path.join(opts.dbDir, "migrations"));
    const pending = migrationFiles.filter((f) => !applied.has(path.basename(f)));
    if (pending.length > 0) {
      const isUpgrade = !result.createdDatabase && applied.size > 0;
      if (isUpgrade && opts.backupBeforeMigrations) {
        log.info(`[db-apply] ${pending.length} pending migration(s) — backing up first`);
        await opts.backupBeforeMigrations();
      }
      for (const file of pending) {
        const id = path.basename(file);
        log.info(`[db-apply] migration ${id}`);
        await runScript(pool, await readScript(file, target.database), id, log);
        result.migrationsApplied.push(id);
      }
    }

    // ---- stored procedures ----------------------------------------------
    const procFiles = await listProcFiles(path.join(opts.dbDir, "procs"));
    const procsKey = `procs@${await hashFiles(procFiles, opts.dbDir)}`;
    if (procFiles.length > 0 && !applied.has(procsKey)) {
      log.info(`[db-apply] applying ${procFiles.length} stored procedure file(s) (${procsKey})`);
      for (const file of procFiles) {
        const content = await readScript(file, target.database);
        for (const batch of splitBatches(content)) {
          try {
            await pool.request().batch(batch);
          } catch (err) {
            throw annotate(err, `procs/${path.relative(path.join(opts.dbDir, "procs"), file)}`);
          }
        }
      }
      await recordId(pool, procsKey);
      result.procsApplied = true;
    }

    // ---- seeds ------------------------------------------------------------
    const seedFiles = await listSqlFiles(path.join(opts.dbDir, "seed"));
    for (const file of seedFiles) {
      const id = `seed:${path.basename(file)}`;
      if (applied.has(id)) continue;
      log.info(`[db-apply] seed ${path.basename(file)}`);
      const content = substituteSeedVariables(await readScript(file, target.database));
      await runScript(pool, content, id, log);
      result.seedsApplied.push(id);
    }
  } finally {
    await pool.close();
  }

  log.info(
    `[db-apply] done: ${result.migrationsApplied.length} migration(s), ` +
      `${result.procsApplied ? "procs refreshed" : "procs unchanged"}, ` +
      `${result.seedsApplied.length} seed(s)`,
  );
  return result;
}

/**
 * Run one script atomically and record it in app.SchemaMigrations in the same
 * transaction. Statements SQL Server refuses inside a transaction (e.g. CREATE
 * DATABASE) trigger a rollback and a non-transactional re-run; the pre-upgrade
 * backup is the safety net for that rare path.
 */
async function runScript(pool: sql.ConnectionPool, content: string, id: string, log: Logger) {
  const batches = splitBatches(content);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const batch of batches) await new sql.Request(tx).batch(batch);
    await new sql.Request(tx)
      .input("id", sql.NVarChar, id)
      .query("INSERT INTO app.SchemaMigrations (MigrationId) VALUES (@id)");
    await tx.commit();
    return;
  } catch (err) {
    await safeRollback(tx);
    const num = (err as { number?: number }).number;
    if (num === undefined || !NOT_IN_TRANSACTION_ERRORS.has(num)) throw annotate(err, id);
    log.warn(`[db-apply] ${id} cannot run in a transaction (error ${num}); running without one`);
  }
  for (const batch of batches) {
    try {
      await pool.request().batch(batch);
    } catch (err) {
      throw annotate(err, id);
    }
  }
  await recordId(pool, id);
}

async function safeRollback(tx: sql.Transaction) {
  try {
    await tx.rollback();
  } catch {
    /* XACT_ABORT may already have rolled back */
  }
}

function annotate(err: unknown, where: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const e = new Error(`Database script ${where} failed: ${msg}`);
  (e as Error & { cause?: unknown }).cause = err;
  return e;
}

async function readAppliedIds(pool: sql.ConnectionPool): Promise<Set<string>> {
  const r = await pool
    .request()
    .query<{ MigrationId: string }>(
      "IF OBJECT_ID(N'app.SchemaMigrations', N'U') IS NULL SELECT CAST(NULL AS NVARCHAR(255)) AS MigrationId WHERE 1 = 0 " +
        "ELSE SELECT MigrationId FROM app.SchemaMigrations",
    );
  return new Set(r.recordset.map((row) => row.MigrationId));
}

async function recordId(pool: sql.ConnectionPool, id: string) {
  await pool
    .request()
    .input("id", sql.NVarChar, id)
    .query(
      "IF NOT EXISTS (SELECT 1 FROM app.SchemaMigrations WHERE MigrationId = @id) " +
        "INSERT INTO app.SchemaMigrations (MigrationId) VALUES (@id)",
    );
}

/**
 * Split on sqlcmd `GO` separators (a line containing only GO, optionally with
 * a trailing comment). SQL Server itself does not understand GO.
 */
export function splitBatches(content: string): string[] {
  return content
    .split(/^[ \t]*GO[ \t]*(?:--[^\r\n]*)?$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/**
 * The scripts are written for a database literally named ProjectManager.
 * Point them at the configured database instead (identical in production;
 * lets the integration test use a throwaway database).
 */
export function retargetDatabase(content: string, dbName: string): string {
  if (dbName === SOURCE_DB_NAME) return content;
  const quoted = quoteName(dbName);
  const literal = dbName.replace(/'/g, "''");
  return content
    .replace(/^([ \t]*)USE[ \t]+\[?ProjectManager\]?[ \t]*;?[ \t]*$/gim, `$1USE ${quoted};`)
    .replace(/DB_ID\(N'ProjectManager'\)/g, `DB_ID(N'${literal}')`)
    .replace(/CREATE DATABASE[ \t]+\[?ProjectManager\]?/g, `CREATE DATABASE ${quoted}`);
}

/**
 * sqlcmd scripting variables used by the seeds. The admin seed (027) and the
 * e2e users (028) are always skipped on the desktop: admin-account.ts creates
 * the administrator with a per-install password instead.
 */
export function substituteSeedVariables(content: string): string {
  return content
    .replace(/\$\(SEED_ADMIN_PASSWORD_HASH\)/g, "__SKIP__")
    .replace(/\$\(E2E_SEED\)/g, "0")
    .replace(/\$\(E2E_USER_PASSWORD_HASH\)/g, "__SKIP__");
}

async function readScript(file: string, dbName: string): Promise<string> {
  const raw = await fs.readFile(file, "utf-8");
  return retargetDatabase(raw.replace(/^﻿/, ""), dbName);
}

async function listSqlFiles(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir))
      .filter((f) => f.toLowerCase().endsWith(".sql"))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

async function listProcFiles(procsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(procsDir)).sort();
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(procsDir, entry);
    if ((await fs.stat(full)).isDirectory()) files.push(...(await listSqlFiles(full)));
  }
  return files;
}

async function hashFiles(files: string[], base: string): Promise<string> {
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(base, f).replace(/\\/g, "/"));
    h.update("\0");
    h.update(await fs.readFile(f));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}
