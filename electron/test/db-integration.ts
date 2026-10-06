/**
 * Integration test for the desktop database host against a real SQL Server.
 * Uses a throwaway database (PM_DesktopTest_<random>) and drops it afterwards.
 *
 *   PM_TEST_SQL_HOST / PM_TEST_SQL_PORT / PM_TEST_SQL_USER / PM_TEST_SQL_PASSWORD
 *   PM_TEST_BACKUP_DIR  — folder the SQL Server service account can write to
 *
 * Run: npm run electron:test-db
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureAdminAccount, resetAdminPassword, type Argon2Like } from "../admin-account";
import { backupDatabase, latestBackup, restoreDatabase } from "../backup";
import { connect, quoteName, type DbTarget } from "../db";
import { applyDatabaseSchema, retargetDatabase, splitBatches } from "../db-apply";
import { consoleLogger as log } from "../log";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require("argon2") as Argon2Like & { verify(hash: string, pw: string): Promise<boolean> };

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

const repoRoot = process.cwd(); // scripts/desktop/test-db.mjs runs from the repo root
const target: DbTarget = {
  host: env("PM_TEST_SQL_HOST"),
  port: Number(env("PM_TEST_SQL_PORT")),
  user: env("PM_TEST_SQL_USER"),
  password: env("PM_TEST_SQL_PASSWORD"),
  database: `PM_DesktopTest_${crypto.randomBytes(3).toString("hex")}`,
};
const backupDir = env("PM_TEST_BACKUP_DIR");

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  await fn();
  passed++;
  console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
}

async function scalar<T>(sqlText: string): Promise<T> {
  const pool = await connect(target, target.database, 1);
  try {
    const r = await pool.request().query(sqlText);
    return Object.values(r.recordset[0] as Record<string, unknown>)[0] as T;
  } finally {
    await pool.close();
  }
}

async function exec(sqlText: string, database = target.database) {
  const pool = await connect(target, database, 1);
  try {
    await pool.request().batch(sqlText);
  } finally {
    await pool.close();
  }
}

async function main() {
  console.log(`Desktop DB integration test → ${target.host}:${target.port} / ${target.database}`);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "pm-desktop-test-"));
  const copyDir = path.join(work, "copies");
  const dbDir = path.join(repoRoot, "db");

  try {
    await test("unit: GO splitting and database retargeting", async () => {
      assert.deepEqual(splitBatches("SELECT 1\nGO\n  go -- c\nSELECT 2\r\nGO\r\n"), ["SELECT 1", "SELECT 2"]);
      assert.deepEqual(splitBatches("SELECT 'GOOD'\nGO"), ["SELECT 'GOOD'"]);
      const s = retargetDatabase("USE ProjectManager;\nIF DB_ID(N'ProjectManager') IS NULL CREATE DATABASE ProjectManager;", "X");
      assert.equal(s, "USE [X];\nIF DB_ID(N'X') IS NULL CREATE DATABASE [X];");
      assert.equal(retargetDatabase("[ProjectManager] NVARCHAR(255)", "X"), "[ProjectManager] NVARCHAR(255)");
    });

    await test("fresh install: database, migrations, procs, seeds", async () => {
      let backups = 0;
      const r = await applyDatabaseSchema({ target, dbDir, log, backupBeforeMigrations: async () => void backups++ });
      assert.equal(r.createdDatabase, true);
      assert.equal(r.migrationsApplied.length, (await fs.readdir(path.join(dbDir, "migrations"))).length);
      assert.equal(r.procsApplied, true);
      assert.ok(r.seedsApplied.length > 20);
      assert.equal(backups, 0, "no backup for a brand-new database");
      assert.ok((await scalar<number>("SELECT COUNT(*) FROM app.Project WHERE IsDeleted = 0")) > 0, "seeded projects");
      assert.equal(
        await scalar<number>("SELECT OBJECTPROPERTY(OBJECT_ID(N'dbo.usp_Project_List'), 'ExecIsQuotedIdentOn')"),
        1,
        "procs created with QUOTED_IDENTIFIER ON",
      );
      assert.equal(await scalar<number>("SELECT COUNT(*) FROM auth.[User]"), 0, "admin seed skipped on desktop");
    });

    await test("second launch: nothing re-applied, deleted seed rows stay deleted", async () => {
      await exec("UPDATE app.Project SET IsDeleted = 1 WHERE ProjectId = 1");
      await exec("UPDATE app.ActivityStatus SET Name = N'To do' WHERE Name = N'Not Started'");
      const r = await applyDatabaseSchema({ target, dbDir, log });
      assert.deepEqual(r.migrationsApplied, []);
      assert.equal(r.procsApplied, false);
      assert.deepEqual(r.seedsApplied, []);
      assert.equal(await scalar<boolean>("SELECT IsDeleted FROM app.Project WHERE ProjectId = 1"), true);
      assert.equal(await scalar<number>("SELECT COUNT(*) FROM app.ActivityStatus WHERE Name = N'Not Started'"), 0);
    });

    await test("admin account: created once with a verifiable argon2id hash, reset works", async () => {
      const pwd = await ensureAdminAccount(target, argon2, log);
      assert.ok(pwd && /^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/.test(pwd));
      const hash = await scalar<string>("SELECT PasswordHash FROM auth.[User] WHERE Username = N'admin'");
      assert.ok(await argon2.verify(hash, pwd!));
      assert.equal(await scalar<boolean>("SELECT MustChangePassword FROM auth.[User] WHERE Username = N'admin'"), true);
      assert.equal(await ensureAdminAccount(target, argon2, log), null, "not recreated when present");
      const pwd2 = await resetAdminPassword(target, argon2, log);
      const hash2 = await scalar<string>("SELECT PasswordHash FROM auth.[User] WHERE Username = N'admin'");
      assert.ok(await argon2.verify(hash2, pwd2));
      assert.equal(await scalar<number>("SELECT COUNT(*) FROM auth.[User] WHERE Username = N'admin'"), 1);
    });

    await test("upgrade: backup first; failing migration rolls back completely", async () => {
      const upgradeDir = path.join(work, "db-upgrade");
      await fs.cp(dbDir, upgradeDir, { recursive: true });
      await fs.writeFile(
        path.join(upgradeDir, "migrations", "900_ok.sql"),
        "USE ProjectManager;\nGO\nCREATE TABLE app.DesktopTestOk (Id INT NOT NULL);\nGO\n",
      );
      await fs.writeFile(
        path.join(upgradeDir, "migrations", "901_broken.sql"),
        "USE ProjectManager;\nGO\nCREATE TABLE app.DesktopTestBroken (Id INT NOT NULL);\nGO\nSELECT 1/0;\nGO\n",
      );
      let backups = 0;
      await assert.rejects(
        applyDatabaseSchema({ target, dbDir: upgradeDir, log, backupBeforeMigrations: async () => void backups++ }),
        /901_broken\.sql/,
      );
      assert.equal(backups, 1, "backup taken before upgrading");
      assert.equal(await scalar<number>("SELECT COUNT(*) FROM app.SchemaMigrations WHERE MigrationId = N'900_ok.sql'"), 1);
      assert.equal(await scalar<number>("SELECT COUNT(*) FROM app.SchemaMigrations WHERE MigrationId = N'901_broken.sql'"), 0);
      assert.equal(await scalar<number | null>("SELECT OBJECT_ID(N'app.DesktopTestBroken')"), null, "partial migration rolled back");
      await fs.unlink(path.join(upgradeDir, "migrations", "901_broken.sql"));
      const r = await applyDatabaseSchema({ target, dbDir: upgradeDir, log });
      assert.deepEqual(r.migrationsApplied, [], "fixed release proceeds");
    });

    let backupFile = "";
    await test("backup: verified .bak in the backup folder, copied to the copy folder", async () => {
      const r = await backupDatabase("daily", { target, backupDir, copyDir, log });
      backupFile = r.file;
      assert.ok(r.bytes > 100_000);
      assert.ok(r.copy && (await fs.stat(r.copy)).size === r.bytes);
      assert.equal(r.copyError, undefined);
      const latest = await latestBackup(backupDir, target.database);
      assert.equal(latest?.file, r.file);
    });

    await test("restore: from the off-machine copy brings the data back", async () => {
      const name = await scalar<string>("SELECT ProjectName FROM app.Project WHERE ProjectId = 2");
      await exec("UPDATE app.Project SET ProjectName = N'CHANGED AFTER BACKUP' WHERE ProjectId = 2");
      const copy = path.join(copyDir, path.basename(backupFile));
      await restoreDatabase(copy, { target, backupDir, log });
      assert.equal(await scalar<string>("SELECT ProjectName FROM app.Project WHERE ProjectId = 2"), name);
      assert.equal(await scalar<string>("SELECT user_access_desc FROM sys.databases WHERE name = DB_NAME()"), "MULTI_USER");
      const r = await applyDatabaseSchema({ target, dbDir, log });
      assert.deepEqual(r.migrationsApplied, []);
    });

    console.log(`\nAll ${passed} checks passed.`);
  } finally {
    await exec(
      `IF DB_ID(N'${target.database}') IS NOT NULL BEGIN ALTER DATABASE ${quoteName(target.database)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${quoteName(target.database)}; END`,
      "master",
    ).catch((e) => console.error("cleanup failed:", e));
    for (const f of await fs.readdir(backupDir).catch(() => [] as string[])) {
      if (f.startsWith(target.database)) await fs.unlink(path.join(backupDir, f)).catch(() => undefined);
    }
    await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("\n✘ FAILED:", err);
  process.exit(1);
});
