# Desktop Edition — Build, Install & Operate

The desktop edition packages the Next.js app with Electron and installs a
private **SQL Server 2022 Express** instance, so a client can run one installer
on any Windows 10/11 x64 PC — no internet, no other software — and keep working
with automatic backups. The web/Docker deployment is unaffected.

## How it works

```
Installer (per user, no admin rights needed)
 ├─ copies the app to %LOCALAPPDATA%\Programs\Project Manager
 ├─ removes a pre-1.0 copy installed for all users (C:\Program Files), keeping data   (admin prompt, once)
 └─ only if %ProgramData%\Project Manager\machine.json is missing (a new PC):
    runs resources\setup\provision.ps1  (admin prompt, once; idempotent; also the app's "Repair")
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
`ProjectManager-Setup-<version>.exe.sha256`, and the update-feed files
`latest.yml` and `ProjectManager-Setup-<version>.exe.blockmap`. The script
prints the size and SHA-256 and fails if `.env` files or `node_modules` leak
into the package.

For clients, prefer the installer from the latest
[GitHub Release](https://github.com/Benson-Kim/project-manager/releases/latest)
(built by CI, see **Updates**) over a local build.

Copy both files to the client PC (USB, network share, download) and check the
copy before installing — a failing USB stick can produce a truncated file:

```powershell
Get-FileHash .\ProjectManager-Setup-1.0.0.exe   # must equal the value in the .sha256 file
```

Build from a clean, committed checkout: the build records the git commit (and
whether the tree was dirty) in the app.

| Command | Purpose |
|---|---|
| `npm run electron:fetch-sql` | Download the pinned SQL Server media (`scripts/desktop/sql-express.pin.json`) and verify its SHA-256 |
| `npm run electron:build` | Full clean build → installer |
| `npm run electron:build:dir` | Same, unpacked (`dist-installer/win-unpacked`) for quick inspection |
| `npm run electron:dev` | Run the desktop host against an existing `next build` (needs a provisioned machine or `PM_MACHINE_CONFIG`) |
| `npm run electron:test-db` | Integration test of schema apply / backup / restore / admin bootstrap against a real SQL Server (see below) |
| `npm run desktop:force-update` | Make the latest release **required** for every installed app (see **Updates**) |

Before a big release, test the installer on a clean Windows PC/VM (install →
sign in with the shown admin password → add a record → *Back up now* → install
the next version over it → data still there).

### Code signing (optional)
Set `CSC_LINK` / `CSC_KEY_PASSWORD` (or Azure Trusted Signing). An unsigned
installer shows Windows SmartScreen's "Windows protected your PC" on first
install — the user must click *More info → Run anyway*. Updates installed by
the app itself do not show it.

## Updates

Every merged PR on `develop` whose CI is fully green (lint, types, unit, build,
database, e2e) becomes a desktop release, so nobody has to send installers
around:

```
PR merged → CI green on develop → desktop-release.yml (Windows runner)
  ├─ skipped if nothing that reaches the app changed (docs, CI, tests only)
  ├─ version = latest release + 1 patch (or package.json's version if higher)
  ├─ npm run electron:build (PM_VERSION, feed = this repo's GitHub Releases)
  ├─ GitHub Release vX.Y.Z: installer, .sha256, .blockmap, latest.yml, notes from the merged PR titles
  └─ keeps the newest 10 releases
```

What installed apps do (`electron/updater.ts`):

- Check 30 s after start and every 4 hours (tray → *Check for updates* checks now).
- Download a new version **in the background**. Only the changed blocks are
  downloaded (`.blockmap`), so an update is far smaller than the installer.
- **Optional update (default):** a Windows notification and a tray item
  *Install update X.Y.Z*. Nothing installs until the user clicks *Restart and
  update*; quitting does not install it. A reminder comes once a day.
- **Required update:** a warning ("save your work"), then the app restarts to
  install it after 5 minutes (or at once with *Restart now*).
- Installing: the app closes, the installer runs silently (2–3 minutes, no
  window) and the app reopens.
  No administrator approval: the app is installed per user and the database
  engine is already set up. On start the database is upgraded, with a backup
  first.
- Offline or GitHub unreachable: logged only, the user is not bothered.

### Making an update required (the "force" command)

| How | When to use |
|---|---|
| Put `[force-update]` in the PR title (or the commit message pushed to `develop`) | The fix itself must reach everyone |
| `npm run desktop:force-update` | Make the latest published release required (needs `gh auth login`) |
| `npm run desktop:force-update -- 1.0.7` | Only PCs below 1.0.7 must update |
| `npm run desktop:force-update -- --off` | Make updates optional again |

The rule lives in `latest.yml` as `minimumVersion` and is carried into every
later release, so a PC that skipped a required version is still made to
update. Logic: `scripts/desktop/release.mjs` and `electron/update-policy.ts`
(both unit-tested).

### Notes
- PCs installed from a build without a feed (before 1.0.0, or built with
  `PM_UPDATE_FEED=off`) need one manual install of the latest release; from
  then on they update themselves. Run it **signed in as the person who uses
  the app**. On a PC with a pre-1.0 version it removes the old copy (one admin
  prompt); the database, backups and settings stay.
- Each Windows account that uses the app installs it once (no admin rights
  needed once the PC's database engine is set up). They share the same data.
- Feed settings at build time: `PM_UPDATE_GITHUB=owner/repo` (default: this
  repo), `PM_UPDATE_URL=<https folder>` for a self-hosted feed, or
  `PM_UPDATE_FEED=off`.
- Releases are public (the repository is public); they contain the app and the
  SQL Server Express media, never `.env` files or secrets.

### Integration test

```sh
PM_TEST_SQL_HOST=127.0.0.1 PM_TEST_SQL_PORT=1433 \
PM_TEST_SQL_USER=<sysadmin login> PM_TEST_SQL_PASSWORD=... \
PM_TEST_BACKUP_DIR=<folder the SQL service account can write> \
npm run electron:test-db
```

Uses a throwaway database `PM_DesktopTest_<random>` and drops it afterwards.

## What the client does

1. Sign in to Windows **as the person who will use the app** (not as the
   administrator account) and run `ProjectManager-Setup-<version>.exe`.
   On a new PC Windows asks once for administrator approval (type the admin
   password if this person is not an administrator) to set up the database
   engine; that takes 5–15 minutes. Updates never ask again.
2. Open Project Manager. On first start it shows the **admin** one-time
   password (with a *Copy password* button); the app forces a new password at
   first sign-in.
3. Work. Closing the window keeps it in the tray, where backups keep running.

Tray menu: *Install update X.Y.Z* (when one is ready), *Back up now*, *Open
backups folder*, *Choose backup copy folder…*, *Restore from backup…*, *Reset
administrator password…*, *Open log files*, *Check for updates*, the version,
*Quit*.

## Data, backups, restore

| What | Where |
|---|---|
| App | `%LOCALAPPDATA%\Programs\Project Manager` (per user) |
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

Uninstalling (Settings → Apps, no admin rights needed) removes the app for
that Windows account only; the database and backups stay (client data). To remove everything: uninstall **Microsoft SQL Server 2022** from
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
  updater.ts         background download, optional/required update prompts
  update-policy.ts   required-update rule + release-notes text (tests/)
  setup/provision.ps1  idempotent engine provisioning (asks for admin approval itself)
  setup/remove-all-users-install.ps1  removes a pre-1.0 all-users copy (keeps data)
  tests/             update-policy.test.ts (vitest), db-integration.ts (npm run electron:test-db)
build-resources/     icon.ico/png, installerHeader.bmp + installerSidebar.bmp (wizard logo,
                     24-bit, from icon.png), installer.nsh (NSIS hook that runs provision.ps1)
electron-builder.config.cjs
scripts/desktop/     build.mjs, fetch-sql-express.mjs, sql-express.pin.json, test-db.mjs,
                     release.mjs (CI release steps + force command; tests/)
.github/workflows/desktop-release.yml   called by ci.yml after a green push to develop
```
