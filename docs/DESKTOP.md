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
      ├─ login pm_app (random password): dbcreator + db_owner of its database, not sysadmin; sa disabled
      ├─ service restarts itself after a failure; signed-in users may start it (not stop or configure)
      ├─ %ProgramData%\Project Manager\Backups  (writable by the SQL service)
      ├─ %ProgramData%\Project Manager\Uploads  (attachments; writable by every local user, ADR-0026)
      └─ %ProgramData%\Project Manager\machine.json  (DB credentials, auth secret, uploadsDir; all users)

App launch (normal user, no admin needed)
 ├─ reads machine.json, waits for SQL Server        → offers elevated Repair if anything is wrong
 │    (a PC provisioned before F1 has no uploadsDir: the app runs with file uploads off
 │     and offers the one-time setup once per user; it never blocks start-up, ADR-0026 §9)
 ├─ applies the schema                               (electron/db-apply.ts)
 │    migrations once each, in a transaction, with a backup first when upgrading
 │    stored procedures only when they changed, seeds once each
 ├─ ensures an active admin account exists           → shows a one-time password if it created one
 ├─ starts the Next.js standalone server on 127.0.0.1:<random port>   (UPLOADS_DIR = uploadsDir)
 │    waits up to 3 minutes: right after Windows starts, the first start is slow
 ├─ every 30 s checks the database engine still answers; if it stopped, starts it
 │    (allowed once provisioning granted it) or tells the user once to restart the PC
 └─ daily verified backup → copied to the user's backup folder (OneDrive by default),
      new attachment files mirrored into <backup folder>\Uploads
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

### Code signing ([ADR-0034](adr/ADR-0034-desktop-update-signing.md))

Releases are signed with the office's own publisher certificate, and every
installed app verifies an update's signature (valid chain on that PC + the
publisher's subject) before installing it. One-time setup:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/desktop/make-publisher-cert.ps1 `
  -Subject "CN=Burton Project Manager, O=Burton" -OutDir C:\secure\pm-signing
```

It prints the three GitHub settings: secrets `WIN_CSC_LINK` (base64 of the
PFX) and `WIN_CSC_KEY_PASSWORD`, repository variable `PM_PUBLISHER` (the
subject). Commit the public half as `build-resources/publisher.cer`: the
installer ships it and provisioning trusts it on each PC, once, while
elevated (first install or Repair). Keep the PFX with the office's other
secrets; it is git-ignored.

- Without the secrets the release job builds unsigned (with a warning) and
  apps do not verify signatures, as before 2026-10-16.
- A certificate from a public CA works the same way: set the three values
  from its PFX and drop the `.cer`. Only such a certificate (with reputation)
  removes SmartScreen's "Windows protected your PC" on the **first** install;
  the self-issued one does not, so the user clicks *More info → Run anyway*
  once and checks the `.sha256`. Updates installed by the app never show it.
- Rotation: run the script again, replace secret, variable and `.cer`,
  release. PCs trust the new publisher at their next Repair.
- Local builds: set `CSC_LINK` (path or base64 of the PFX), `CSC_KEY_PASSWORD`
  and `PM_PUBLISHER` together; the build refuses one without the other.

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
  downloaded (`.blockmap`): a few MB, about 1% of the ~400 MB installer
  (measured between 1.0.5 and 1.0.8). The blocks are taken from the installer
  this PC was installed from (`%LOCALAPPDATA%\project-manager-updater\installer.exe`).
  electron-updater replaces that installer's blockmap with each version it downloads, so
  one update downloaded and not installed used to turn every later update into a full
  download. The app now puts the matching blockmap back before each check
  (`electron/update-cache.ts`). A PC with no such installer, or more than 10 releases
  behind, downloads one update in full.
- **Optional update (default):** a Windows notification and a tray item
  *Install update X.Y.Z*. Clicking the notification (also later, in the Action
  Center) brings the app to the front and asks *Restart and update* / *Later*.
  A newer notice replaces the older one, and quitting the app removes it, so no
  notice is left that nothing answers. Nothing installs until the user chooses
  *Restart and update*; quitting does not install it. A reminder comes once a
  day.
- **Required update:** a warning ("save your work"), then the app restarts to
  install it after 5 minutes (or at once with *Restart now*).
- Installing: the app closes, the installer runs silently (a few minutes, no
  window; 6 on a busy test PC) and the app reopens.
  No administrator approval: the app is installed per user and the database
  engine is already set up. On start the database is upgraded, with a backup
  first.
- After the restart a tray notice says *Update installed*. If the old version is
  still running, it says *Update not installed* and offers the update again;
  `main.log` has the reason. If the installer cannot start, the app stays open
  and says so.
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
update. When the previous release or its `latest.yml` cannot be read, the
release job fails instead of publishing without the rule; re-run it. Logic: `scripts/desktop/release.mjs` and `electron/update-policy.ts`
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
  `PM_UPDATE_FEED=off`. A self-hosted folder must answer HTTP range requests and
  keep the older releases' `.blockmap` files next to their installers. The app
  fetches each changed part with its own request, as it does from GitHub: a single
  multi-range request timed out on a slow PC, which then downloaded the whole installer.
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
   *Open in new window* (header, next to the bell) opens the current page in a
   window of its own, to move it to another screen. It opens where the last one
   was closed, or on a screen other than the main window's. Shift- or Ctrl-click
   on a link does the same.

Tray menu: *Install update X.Y.Z* (when one is ready), *Back up now*, *Open
backups folder*, *Choose backup copy folder…*, *Restore from backup…*, *Open log
files*, *Check for updates*, the version, *Quit*. It never resets passwords:
anyone at the PC can open it (see Troubleshooting for a lost admin password).

Window titles show the page only (*Projects*, not the browser tab's *Projects —
Project Manager · Project Manager*), and the setup wizard names the app once,
in its title bar (its footer shows *Version X.Y.Z*).

## Data, backups, restore

| What | Where |
|---|---|
| App | `%LOCALAPPDATA%\Programs\Project Manager` (per user) |
| Database | SQL Server instance `PROJECTMGR`, database `ProjectManager` |
| Backups (on this PC, last 14) | `%ProgramData%\Project Manager\Backups` |
| Backup copies (last 30) | per user; default `%OneDrive%\Project Manager Backups`, else `Documents\Project Manager Backups` |
| Attachments (ADR-0026) | `%ProgramData%\Project Manager\Uploads`, files named by their SHA-256 in `ab\cd\` shards; shared by every Windows user on the PC |
| Attachment copies | `<backup copy folder>\Uploads` — new files are added after each backup, nothing is deleted there |
| App logs | `%APPDATA%\Project Manager\logs\main.log` (rotates at 5 MB; `main.log.1`–`.3` are older) |
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
- **Attachments are not in the `.bak`.** Their bytes live in the Uploads
  folder; the database holds only names, sizes and hashes.
  - *Restore from backup…* copies the files back after the database. It
    copies every file the Uploads folder lacks, first from `Uploads` next to
    the chosen `.bak`, then from `<backup copy folder>\Uploads`. The final
    message says how many.
  - By hand (e.g. attachments were still off when you restored): copy
    `<backup copy folder>\Uploads` into `%ProgramData%\Project Manager\Uploads`,
    keeping the `ab\cd\` folders.

## Uninstall

Uninstalling (Settings → Apps, no admin rights needed) removes the app for
that Windows account only; the database and backups stay (client data). To remove everything: uninstall **Microsoft SQL Server 2022** from
*Apps & features* and delete `%ProgramData%\Project Manager`.

## Troubleshooting

- *"Database setup needed"* on start → click **Repair** (re-runs provisioning
  elevated; safe to repeat). Details in `provision.log`.
- *"Attachments need a one-time setup"* after an update, or *"File uploads are
  not set up on this PC yet"* in a record → the PC was provisioned before F1,
  and only an administrator can create the shared Uploads folder. Everything
  else works meanwhile, including locations.
  - **At the PC:** tray → *Set up attachments (administrator)…*, approve the
    prompt with an administrator account, then restart the app.
  - **Remotely** (as an administrator, or as SYSTEM from a deployment tool;
    safe to repeat; it is the same script the installer and Repair run):

    ```powershell
    $app = Get-Item 'C:\Users\*\AppData\Local\Programs\Project Manager\resources' | Select-Object -First 1
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$($app.FullName)\setup\provision.ps1" `
      -SqlInstaller "$($app.FullName)\sql-express\SQLEXPR_x64_ENU.exe"
    ```

    Exit code 0 means done. Each user gets uploads the next time they start the
    app. machine.json keeps `schemaVersion: 1`, so an older app that another
    Windows user still runs on the same PC keeps working.
- **Rule for future desktop changes:** anything that needs an administrator
  turns its feature off until IT acts. It never blocks start-up, because the
  client's staff are standard users and updates install themselves.
- *"Download failed … The stored file may have been changed, damaged or removed
  on this PC"* → the file in the Uploads folder no longer matches what was
  uploaded (edited, deleted, quarantined by antivirus, or a disk error), so the
  app refuses to hand it out. Restore it from `<backup copy folder>\Uploads`
  (same `ab\cd\<hash>` path); `main.log` names the attachment.
- Admin locked out / password lost → IT resets it with the operator runbook in
  [SECURITY.md](SECURITY.md#operator-runbook-reset-a-password-or-unlock-an-account-until-module-22),
  connecting as a Windows administrator. The tray has no password reset, on
  purpose: it needs no sign-in, so anyone at the PC could have become admin.
- An update notice keeps coming back, or every update downloads ~400 MB →
  `main.log` shows each download's size (a line "Full: …, To download: …"), and
  its `[updater]` lines say what happened at *Restart and update*. *Update not
  installed* after a restart means the silent installer stopped; run the
  latest installer by hand once (data stays).
- Notices filed under *Electron* in the Action Center, and clicking one does
  nothing → a development PC: `npm run electron:dev` leaves a Start-menu
  `Electron.lnk` with the app's ID, and Windows sends the click to that copy.
  Delete the shortcut while testing an installed build.
- *"Sign in is not possible: the database is not responding"*, or a *"The
  database has stopped"* dialog → the SQL Server service stopped (2026-10-12 a
  client's stopped at 04:59, likely an update, and every sign-in failed for
  hours). Restart the PC. Once IT has run provisioning again (the remote command
  above, safe to repeat) the service restarts after a failure and the app starts
  it by itself; PCs provisioned before that only get the dialog.
- *"The application server did not start within 180s"* → start the app again;
  the second start is faster. `main.log` shows how long `[next]` took to say
  Ready.
- Anything else → tray → *Open log files* and send `main.log`.

## Source layout

```
electron/
  main.ts            startup orchestration, windows, tray actions, backup schedule
  machine-config.ts  reads %ProgramData%\Project Manager\machine.json
  sql-service.ts     service state + elevated Repair
  db-apply.ts        migrations / procs / seeds (port of scripts/db-apply.sh)
  backup.ts          BACKUP / VERIFYONLY / copy / retention / RESTORE
  uploads-mirror.ts  copies new attachment files to <backup copy folder>\Uploads (tests/)
  admin-account.ts   admin bootstrap when no administrator is active (argon2id)
  next-server.ts     Next.js standalone child process (auto-restart)
  updater.ts         background download, optional/required update prompts, install outcome
  update-cache.ts    keeps the differential download base in step (tests/)
  update-policy.ts   required-update rule, install outcome, release-notes text (tests/)
  tray-menu.ts       the tray menu, with no password actions (tests/)
  window-title.ts    window titles without the app name (tests/)
  setup/provision.ps1  idempotent engine provisioning (asks for admin approval itself)
  setup/remove-all-users-install.ps1  removes a pre-1.0 all-users copy (keeps data)
  tests/             update-policy, update-cache, tray-menu, window-title, machine-config,
                     next-server-env, uploads-mirror, log (vitest); db-integration.ts
                     (npm run electron:test-db)
build-resources/     icon.ico/png, installerHeader.bmp + installerSidebar.bmp (wizard logo,
                     24-bit, from icon.png), installer.nsh (NSIS hooks: runs provision.ps1,
                     wizard texts and footer)
electron-builder.config.cjs
scripts/desktop/     build.mjs (refuses a standalone with build-machine files or missing traced files),
                     fetch-sql-express.mjs, sql-express.pin.json, test-db.mjs,
                     release.mjs (CI release steps + force command; tests/),
                     update-feed.cjs (the feed written into app-update.yml; tests/)
.github/workflows/desktop-release.yml   called by ci.yml after a green push to develop
```

## Security notes (whole-codebase review, 2026-10-16)

- **One PC, one database, one circle of trust.** `machine.json` (the `pm_app` password, the auth
  secret, the folders) is readable by every local Windows account, because the app runs as the
  signed-in user and must open the database. Anyone with a local account on the PC can therefore
  read and change everything in it. The desktop edition is meant for a PC whose Windows accounts
  all belong to people who may see the project data; an office that needs separate people kept
  apart runs the server edition (ADR-0032).
- **Least privilege on the instance.** Provisioning makes `pm_app` `dbcreator` (it creates and
  then owns the database) and `db_owner` of `ProjectManager`; it is not `sysadmin`, `sa` stays
  disabled and `xp_cmdshell` off. A PC provisioned before 2026-10-16 keeps the old grant until
  **Repair** runs once (the app offers it; it needs an administrator). The login block is
  executed for real by `npm run electron:test-db` (throwaway login and databases).
- **Updates are verified** ([ADR-0034](adr/ADR-0034-desktop-update-signing.md)): a
  downloaded installer must carry a valid Authenticode signature from the office's
  publisher, which provisioning trusted on the PC (`LocalMachine\\Root` +
  `TrustedPublisher`, code-signing use only). Writing a GitHub release is not enough
  to put code on a client PC; the signing key is. The first installer a PC ever runs
  is the one trust-on-first-install step: check its `.sha256`.
- **Backups leave the PC in clear.** The daily `.bak` copied to the backup folder (OneDrive by
  default) is not encrypted by SQL Server; it relies on the account's OneDrive protection and
  BitLocker on the disk. Point the copy at a folder you consider safe for project financials.
