import fs from "fs/promises";
import path from "path";
import { connect, quoteName, sql, type DbTarget } from "./db";
import type { Logger } from "./log";

/**
 * Native SQL Server backups for the desktop edition.
 *
 * Flow: BACKUP DATABASE into `backupDir` (%ProgramData%\Project Manager\Backups,
 * which the provisioning script makes writable for the SQL Server service —
 * the service cannot write into a user's Documents/OneDrive), verify it, then
 * copy it to the user's chosen copy folder (OneDrive / network share / USB) so
 * a dead disk or stolen laptop doesn't take the backups with it.
 *
 * Express edition does not support WITH COMPRESSION; a project-management
 * database is small, so plain backups are fine.
 */
export type BackupKind = "daily" | "manual" | "pre-upgrade" | "pre-restore";

export interface BackupOptions {
  target: DbTarget;
  backupDir: string;
  copyDir?: string;
  log: Logger;
  keepLocal?: number;
  keepCopies?: number;
}

export interface BackupResult {
  file: string;
  copy?: string;
  copyError?: string;
  bytes: number;
}

const BAK = /\.bak$/i;

export function backupFileName(database: string, kind: BackupKind, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${database}_${stamp}_${kind}.bak`;
}

export async function backupDatabase(kind: BackupKind, opts: BackupOptions): Promise<BackupResult> {
  const { target, log } = opts;
  await fs.mkdir(opts.backupDir, { recursive: true });
  const file = path.join(opts.backupDir, backupFileName(target.database, kind));

  const pool = await connect(target, "master", 1);
  try {
    log.info(`[backup] ${kind} -> ${file}`);
    await pool
      .request()
      .input("file", sql.NVarChar, file)
      .input("name", sql.NVarChar, `Project Manager ${kind} backup`)
      .batch(
        `BACKUP DATABASE ${quoteName(target.database)} TO DISK = @file ` +
          `WITH INIT, FORMAT, CHECKSUM, NAME = @name`,
      );
    await pool
      .request()
      .input("file", sql.NVarChar, file)
      .batch("RESTORE VERIFYONLY FROM DISK = @file WITH CHECKSUM");
  } finally {
    await pool.close();
  }

  const { size } = await fs.stat(file);
  const result: BackupResult = { file, bytes: size };
  await prune(opts.backupDir, target.database, opts.keepLocal ?? 14, log);

  if (opts.copyDir) {
    try {
      await fs.mkdir(opts.copyDir, { recursive: true });
      const copy = path.join(opts.copyDir, path.basename(file));
      await fs.copyFile(file, copy);
      result.copy = copy;
      await prune(opts.copyDir, target.database, opts.keepCopies ?? 30, log);
    } catch (err) {
      // The local backup is still good; surface the copy problem to the user.
      result.copyError = err instanceof Error ? err.message : String(err);
      log.warn(`[backup] copy to ${opts.copyDir} failed: ${result.copyError}`);
    }
  }
  log.info(`[backup] ok (${(size / 1048576).toFixed(1)} MB)${result.copy ? `, copied to ${result.copy}` : ""}`);
  return result;
}

/** Newest backup of this database in `dir`, or null. */
export async function latestBackup(dir: string, database: string): Promise<{ file: string; time: Date } | null> {
  const files = await listBackups(dir, database);
  return files[0] ?? null;
}

async function listBackups(dir: string, database: string) {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const prefix = `${database}_`.toLowerCase();
  const out: { file: string; time: Date }[] = [];
  for (const n of names) {
    if (!BAK.test(n) || !n.toLowerCase().startsWith(prefix)) continue;
    const file = path.join(dir, n);
    try {
      out.push({ file, time: (await fs.stat(file)).mtime });
    } catch {
      /* deleted meanwhile */
    }
  }
  return out.sort((a, b) => b.time.getTime() - a.time.getTime());
}

async function prune(dir: string, database: string, keep: number, log: Logger) {
  const files = await listBackups(dir, database);
  for (const old of files.slice(keep)) {
    try {
      await fs.unlink(old.file);
      log.info(`[backup] pruned ${old.file}`);
    } catch (err) {
      log.warn(`[backup] could not prune ${old.file}: ${String(err)}`);
    }
  }
}

/**
 * Replace the database with the contents of `bakFile`. The caller must stop
 * the app server first. Works for backups from another PC too: data/log
 * files are relocated onto this instance's paths.
 */
export async function restoreDatabase(
  bakFile: string,
  opts: { target: DbTarget; backupDir: string; log: Logger },
): Promise<void> {
  const { target, log } = opts;
  // SQL Server reads the file as its service account: stage it in backupDir.
  let source = bakFile;
  if (path.resolve(path.dirname(bakFile)).toLowerCase() !== path.resolve(opts.backupDir).toLowerCase()) {
    source = path.join(opts.backupDir, `restore-source_${Date.now()}.bak.tmp`);
    await fs.copyFile(bakFile, source);
  }

  const db = quoteName(target.database);
  const pool = await connect(target, "master", 1); // one connection: SINGLE_USER must be ours
  try {
    // Validates checksums when the backup has them (ours always do).
    await pool.request().input("src", sql.NVarChar, source).batch("RESTORE VERIFYONLY FROM DISK = @src");
    const files = await pool
      .request()
      .input("src", sql.NVarChar, source)
      .query<{ LogicalName: string; Type: string }>("RESTORE FILELISTONLY FROM DISK = @src");

    const current = await pool
      .request()
      .input("db", sql.NVarChar, target.database)
      .query<{ type_desc: string; physical_name: string }>(
        "SELECT type_desc, physical_name FROM sys.master_files WHERE database_id = DB_ID(@db) ORDER BY file_id",
      );
    const defaults = await pool
      .request()
      .query<{ dataPath: string; logPath: string }>(
        "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(4000)) AS dataPath, " +
          "CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS NVARCHAR(4000)) AS logPath",
      );
    const currentData = current.recordset.filter((f) => f.type_desc === "ROWS").map((f) => f.physical_name);
    const currentLog = current.recordset.filter((f) => f.type_desc === "LOG").map((f) => f.physical_name);

    const request = pool.request().input("src", sql.NVarChar, source);
    const moves: string[] = [];
    let dataIndex = 0;
    let logIndex = 0;
    files.recordset.forEach((f, i) => {
      const isLog = f.Type === "L";
      const existing = isLog ? currentLog[logIndex] : currentData[dataIndex];
      const suffix = isLog ? (logIndex === 0 ? "_log.ldf" : `_log${logIndex}.ldf`) : dataIndex === 0 ? ".mdf" : `_${dataIndex}.ndf`;
      const dir = isLog ? defaults.recordset[0].logPath : defaults.recordset[0].dataPath;
      const dest = existing ?? path.join(dir, `${target.database}${suffix}`);
      if (isLog) logIndex++;
      else dataIndex++;
      request.input(`l${i}`, sql.NVarChar, f.LogicalName).input(`p${i}`, sql.NVarChar, dest);
      moves.push(`MOVE @l${i} TO @p${i}`);
    });

    log.info(`[restore] restoring ${target.database} from ${bakFile}`);
    const exists = currentData.length > 0;
    if (exists) await pool.request().batch(`ALTER DATABASE ${db} SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
    try {
      await request.batch(
        `RESTORE DATABASE ${db} FROM DISK = @src WITH REPLACE, RECOVERY, ${moves.join(", ")}`,
      );
    } finally {
      await pool
        .request()
        .batch(`IF DB_ID(N'${target.database.replace(/'/g, "''")}') IS NOT NULL ALTER DATABASE ${db} SET MULTI_USER`);
    }
    log.info("[restore] done");
  } finally {
    await pool.close();
    if (source !== bakFile) await fs.unlink(source).catch(() => undefined);
  }
}
