# Desktop Edition — Build, Install & Operate

The desktop edition packages the Next.js app with Electron and installs a
private **SQL Server 2022 Express** instance, so a client can run one installer
on any Windows 10/11 x64 PC — no internet, no other software — and keep working
with automatic backups. The web/Docker deployment is unaffected.

## How it works

```
Installer (elevated once, perMachine)
 ├─ copies the app to C:\Program Files\Project Manager
 └─ runs resources\setup\provision.ps1  (idempotent; also the app's "Repair")
      ├─ installs SQL Server 2022 Express, instance PROJECTMGR   (first install only)
      ├─ TCP 127.0.0.1:14330 only + firewall block rule           (not reachable from the network)
      ├─ login pm_app (random password), sa disabled
      ├─ %ProgramData%\Project Manager\Backups  (writable by the SQL service)
      └─ %ProgramData%\Project Manager\machine.json  (DB credentials + auth secret, all users)

App launch (normal user, no admin needed)
 ├─ reads machine.json, waits for SQL Server        → offers elevated Repair if anything is wrong
 ├─ applies the schema                               (electron/db-apply.ts)
 │    migrations once each, in a transaction, with a backup first when upgrading
 │    stored procedures only when they changed, seeds once each
 ├─ ensures an active admin account exists           → shows a one-time password if it created one
 ├─ starts the Next.js standalone server on 127.0.0.1:<random port>
 └─ daily verified backup → copied to the user's backup folder (OneDrive by default)
```

## Building the installer (Windows x64 developer PC)

```sh
npm ci
npm run electron:build      # fetches + verifies SQL Server media if needed, then builds everything
```

Output: `dist-installer/ProjectManager-Setup-<version>.exe` (~370 MB) plus
`ProjectManager-Setup-<version>.exe.sha256`. The script prints the size and
SHA-256 and fails if `.env` files or `node_modules` leak into the package.

Copy both files to the client PC (USB, network share, download) and check the
copy before installing — a failing USB stick can produce a truncated file:

```powershell
Get-FileHash .\ProjectManager-Setup-0.1.0.exe   # must equal the value in the .sha256 file
``` Build from a clean, committed checkout: the build
records the git commit (and whether the tree was dirty) in the app.

| Command | Purpose |
|---|---|
| `npm run electron:fetch-sql` | Download the pinned SQL Server media (`scripts/desktop/sql-express.pin.json`) and verify its SHA-256 |
| `npm run electron:build` | Full clean build → installer |
| `npm run electron:build:dir` | Same, unpacked (`dist-installer/win-unpacked`) for quick inspection |
| `npm run electron:dev` | Run the desktop host against an existing `next build` (needs a provisioned machine or `PM_MACHINE_CONFIG`) |
| `npm run electron:test-db` | Integration test of schema apply / backup / restore / admin bootstrap against a real SQL Server (see below) |

Release checklist: bump `version` in `package.json`, build, test the installer
on a clean Windows PC/VM (install → sign in with the shown admin password →
add a record → *Back up now* → reinstall → data still there).

### Optional: updates and code signing
- **Auto-update:** set `PM_UPDATE_URL` (any static HTTPS folder) when building,
  then upload `latest.yml` and the installer there. Without it, auto-update is off.
- **Code signing:** set `CSC_LINK` / `CSC_KEY_PASSWORD` (or Azure Trusted
  Signing). An unsigned installer shows Windows SmartScreen's "Windows protected
  your PC" — the user must click *More info → Run anyway*.

### Integration test

```sh
PM_TEST_SQL_HOST=127.0.0.1 PM_TEST_SQL_PORT=1433 \
PM_TEST_SQL_USER=<sysadmin login> PM_TEST_SQL_PASSWORD=... \
PM_TEST_BACKUP_DIR=<folder the SQL service account can write> \
npm run electron:test-db
```

Uses a throwaway database `PM_DesktopTest_<random>` and drops it afterwards.

## What the client does

1. Run `ProjectManager-Setup-<version>.exe`, approve the Windows admin prompt.
   First install takes 5–15 minutes (SQL Server setup).
2. Open Project Manager. On first start it shows the **admin** one-time
   password (with a *Copy password* button); the app forces a new password at
   first sign-in.
3. Work. Closing the window keeps it in the tray, where backups keep running.

Tray menu: *Back up now*, *Open backups folder*, *Choose backup copy folder…*,
*Restore from backup…*, *Reset administrator password…*, *Open log files*, *Quit*.

## Data, backups, restore

| What | Where |
|---|---|
| Database | SQL Server instance `PROJECTMGR`, database `ProjectManager` |
| Backups (on this PC, last 14) | `%ProgramData%\Project Manager\Backups` |
| Backup copies (last 30) | per user; default `%OneDrive%\Project Manager Backups`, else `Documents\Project Manager Backups` |
| App logs | `%APPDATA%\Project Manager\logs\main.log` |
| Setup/repair log | `%ProgramData%\Project Manager\logs\provision.log` |
| SQL Server setup logs | `C:\Program Files\Microsoft SQL Server\160\Setup Bootstrap\Log` |

- A backup runs at start-up when the last one is older than 24 h, then hourly
  checks while the app runs. Each is checked with `RESTORE VERIFYONLY`.
- A backup is always taken before database upgrades and before a restore.
- Point the copy folder at a different disk, network share or synced cloud
  folder — copies on the same disk do not survive a disk failure.
- **Restore:** tray → *Restore from backup…* → pick any `.bak` (also from
  another PC). Older backups are upgraded to the current schema automatically.
- **Move to a new PC:** install there, then *Restore from backup…* with the
  latest copy.

## Uninstall

Uninstalling removes the app only; the database and backups stay (client
data). To remove everything: uninstall **Microsoft SQL Server 2022** from
*Apps & features* and delete `%ProgramData%\Project Manager`.

## Troubleshooting

- *"Database setup needed"* on start → click **Repair** (re-runs provisioning
  elevated; safe to repeat). Details in `provision.log`.
- Admin locked out / password lost → tray → *Reset administrator password…*.
- Anything else → tray → *Open log files* and send `main.log`.

## Source layout

```
electron/
  main.ts            startup orchestration, windows, tray actions, backup schedule
  machine-config.ts  reads %ProgramData%\Project Manager\machine.json
  sql-service.ts     service state + elevated Repair
  db-apply.ts        migrations / procs / seeds (port of scripts/db-apply.sh)
  backup.ts          BACKUP / VERIFYONLY / copy / retention / RESTORE
  admin-account.ts   admin bootstrap and password reset (argon2id)
  next-server.ts     Next.js standalone child process (auto-restart)
  setup/provision.ps1  elevated, idempotent engine provisioning
  test/db-integration.ts
build-resources/     icon.ico/png, installerHeader.bmp + installerSidebar.bmp (wizard logo,
                     24-bit, from icon.png), installer.nsh (NSIS hook that runs provision.ps1)
electron-builder.config.cjs
scripts/desktop/     build.mjs, fetch-sql-express.mjs, sql-express.pin.json, test-db.mjs
```
