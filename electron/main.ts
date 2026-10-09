import { app, BrowserWindow, clipboard, dialog, session, shell } from "electron";
import { createRequire } from "module";
import path from "path";
import { ensureAdminAccount, resetAdminPassword, type Argon2Like } from "./admin-account";
import {
  backupDatabase,
  latestBackup,
  restoreDatabase,
  type BackupKind,
  type BackupResult,
} from "./backup";
import { waitForSql } from "./db";
import { applyDatabaseSchema } from "./db-apply";
import { createLogger, describeError } from "./log";
import { readMachineConfig, SetupRequiredError, type MachineConfig } from "./machine-config";
import { NextServer } from "./next-server";
import { paths } from "./paths";
import { getServiceState, runElevatedRepair } from "./sql-service";
import {
  destroyTray,
  initTray,
  setTrayUpdateActions,
  setTrayUpdateReady,
  showTrayHint,
} from "./tray";
import { setupAutoUpdater } from "./updater";
import { SettingsStore } from "./user-settings";

// A fixed, explicit profile folder (otherwise Electron derives it from the
// package name). Must be set before anything touches app paths.
app.setName("Project Manager");
app.setPath("userData", path.join(app.getPath("appData"), "Project Manager"));
app.setAppUserModelId("com.burton.projectmanager");

const log = createLogger(path.join(app.getPath("userData"), "logs"));
const settings = new SettingsStore(app.getPath("userData"));

const BACKUP_INTERVAL_MS = 24 * 60 * 60_000;
const BACKUP_CHECK_MS = 60 * 60_000;

let config: MachineConfig | null = null;
let server: NextServer | null = null;
let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let quitting = false;
let busy: Promise<unknown> | null = null; // backup/restore in progress

process.on("uncaughtException", (err) => log.error("uncaughtException", err));
process.on("unhandledRejection", (err) => log.error("unhandledRejection", err));

// ---------------------------------------------------------------------------
function loadArgon2(): Argon2Like {
  // argon2 is a native module already shipped (and loadable) inside the Next
  // standalone bundle — reuse it instead of packing a second copy.
  const req = createRequire(path.join(paths.standaloneDir, "server.js"));
  return req("argon2") as Argon2Like;
}

function setSplashStatus(message: string): void {
  log.info(`[startup] ${message}`);
  splash?.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(message)}`)
    .catch(() => undefined);
}

function createSplash(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: "#0f172a",
    icon: paths.icon,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(paths.splash).catch(() => undefined);
  return win;
}

function createMainWindow(url: string): BrowserWindow {
  const origin = new URL(url).origin;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    show: false,
    title: "Project Manager",
    icon: paths.icon,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  // Only our own local server is shown in-app; anything else opens in the browser.
  const isOwn = (target: string) => {
    try {
      return new URL(target).origin === new URL(server?.url ?? origin).origin;
    } catch {
      return false;
    }
  };
  const openExternally = (target: string) => {
    if (/^https?:\/\//i.test(target) || /^mailto:/i.test(target))
      shell.openExternal(target).catch(() => undefined);
  };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!isOwn(target)) openExternally(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, target) => {
    if (!isOwn(target)) {
      e.preventDefault();
      openExternally(target);
    }
  });

  win.once("ready-to-show", () => {
    splash?.close();
    splash = null;
    win.show();
  });
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!settings.get().trayHintShown) {
      showTrayHint();
      settings.set({ trayHintShown: true });
    }
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  win.loadURL(url).catch((err) => log.error("[window] load failed", err));
  return win;
}

function showMain(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function message(
  type: "info" | "warning" | "error",
  title: string,
  text: string,
  detail?: string,
) {
  const opts = { type, title, message: text, detail, buttons: ["OK"] };
  if (mainWindow?.isVisible()) await dialog.showMessageBox(mainWindow, opts);
  else await dialog.showMessageBox(opts);
}

async function showAdminCredentials(password: string, reason: string): Promise<void> {
  for (;;) {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Administrator sign-in",
      message: reason,
      detail:
        `Username:  admin\nPassword:  ${password}\n\n` +
        "You will be asked to choose your own password when you first sign in. " +
        "Keep this until then — it is shown only once.",
      buttons: ["Copy password", "I have written it down"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) clipboard.writeText(password);
    else return;
  }
}

// ---------------------------------------------------------------------------
// Database engine readiness (with an elevated repair path).

async function ensureDatabaseEngine(): Promise<MachineConfig> {
  try {
    const cfg = readMachineConfig();
    const state = await getServiceState(cfg.sql.instanceName);
    if (state === "missing") throw new SetupRequiredError("The database engine is not installed.");
    setSplashStatus(
      state === "running" ? "Connecting to the database…" : "Starting the database engine…",
    );
    await waitForSql(cfg.sql, state === "running" ? 30_000 : 90_000);
    return cfg;
  } catch (err) {
    log.error("[startup] database engine not ready", err);
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "Database setup needed",
      message: "Project Manager needs to finish setting up its database engine.",
      detail:
        `${err instanceof Error ? err.message : String(err)}\n\n` +
        "Click Repair and approve the Windows administrator prompt. A first-time setup takes 5–15 minutes.",
      buttons: ["Repair", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) throw new Error("Database setup was not completed.");
    setSplashStatus("Repairing the database engine (this can take several minutes)…");
    const code = await runElevatedRepair(paths.provisionScript, paths.sqlInstaller, log);
    if (code !== 0) {
      throw new Error(
        `Database repair failed (code ${code}). Details: ${path.join(process.env.ProgramData ?? "C:\\ProgramData", "Project Manager", "logs", "provision.log")}`,
      );
    }
    const cfg = readMachineConfig();
    await waitForSql(cfg.sql, 90_000);
    return cfg;
  }
}

// ---------------------------------------------------------------------------
// Backups

async function runBackup(kind: BackupKind): Promise<BackupResult> {
  if (!config) throw new Error("Database not ready");
  const task = backupDatabase(kind, {
    target: config.sql,
    backupDir: config.backupDir,
    copyDir: settings.get().backupCopyDir,
    log,
  });
  busy = task.finally(() => {
    busy = null;
  });
  return task;
}

async function backupIfDue(): Promise<void> {
  if (!config || busy) return;
  try {
    const last = await latestBackup(config.backupDir, config.sql.database);
    if (last && Date.now() - last.time.getTime() < BACKUP_INTERVAL_MS) return;
    const result = await runBackup("daily");
    if (result.copyError) {
      await message(
        "warning",
        "Backup copy failed",
        "Today's backup was saved on this PC, but copying it to your backup folder failed.",
        `${settings.get().backupCopyDir}\n\n${result.copyError}\n\nUse the tray menu → "Choose backup copy folder…" to pick another location.`,
      );
    }
  } catch (err) {
    log.error("[backup] scheduled backup failed", err);
    await message(
      "error",
      "Backup failed",
      "The automatic backup failed.",
      `${describeError(err)}\n\nLog: ${log.file}`,
    );
  }
}

async function backupNowAction(): Promise<void> {
  try {
    if (busy) await busy;
    const r = await runBackup("manual");
    await message(
      r.copyError ? "warning" : "info",
      "Backup complete",
      r.copyError ? "Backup saved on this PC, but the copy failed." : "Backup complete.",
      `${r.file}${r.copy ? `\n\nCopied to:\n${r.copy}` : ""}${r.copyError ? `\n\nCopy error: ${r.copyError}` : ""}`,
    );
  } catch (err) {
    log.error("[backup] manual backup failed", err);
    await message("error", "Backup failed", "The backup failed.", describeError(err));
  }
}

async function chooseBackupCopyFolder(): Promise<void> {
  const r = await dialog.showOpenDialog({
    title: "Where should backup copies be kept?",
    message: "Choose a folder on another drive, a network share, or a OneDrive folder.",
    defaultPath: settings.get().backupCopyDir,
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return;
  settings.set({ backupCopyDir: r.filePaths[0] });
  log.info(`[backup] copy folder set to ${r.filePaths[0]}`);
  await backupNowAction();
}

async function restoreAction(): Promise<void> {
  if (!config || !server) return;
  const pick = await dialog.showOpenDialog({
    title: "Restore Project Manager data from a backup",
    defaultPath: settings.get().backupCopyDir,
    filters: [{ name: "SQL Server backup", extensions: ["bak"] }],
    properties: ["openFile"],
  });
  if (pick.canceled || !pick.filePaths[0]) return;
  const file = pick.filePaths[0];
  const { response } = await dialog.showMessageBox({
    type: "warning",
    title: "Restore backup",
    message: "Replace ALL current data with this backup?",
    detail: `${file}\n\nA safety backup of the current data is taken first. The app will be unavailable for a moment.`,
    buttons: ["Restore", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;

  const cfg = config;
  const srv = server;
  const task = (async () => {
    if (busy) await busy;
    await backupDatabase("pre-restore", {
      target: cfg.sql,
      backupDir: cfg.backupDir,
      copyDir: settings.get().backupCopyDir,
      log,
    });
    await srv.stopAndWait();
    try {
      await restoreDatabase(file, { target: cfg.sql, backupDir: cfg.backupDir, log });
      // An older backup may predate the current schema: upgrade it.
      await applyDatabaseSchema({ target: cfg.sql, dbDir: paths.dbDir, log });
      const pwd = await ensureAdminAccount(cfg.sql, loadArgon2(), log);
      if (pwd)
        await showAdminCredentials(
          pwd,
          "The restored data had no active administrator, so one was created.",
        );
    } finally {
      const url = await srv.start();
      mainWindow?.loadURL(url).catch(() => undefined);
    }
  })();
  busy = task.finally(() => {
    busy = null;
  });
  try {
    await task;
    await message("info", "Restore complete", "Your data was restored from the backup.");
  } catch (err) {
    log.error("[restore] failed", err);
    await message(
      "error",
      "Restore failed",
      "The restore did not complete.",
      `${describeError(err)}\n\nA safety backup of the previous data is in:\n${cfg.backupDir}`,
    );
  }
}

async function resetAdminAction(): Promise<void> {
  if (!config) return;
  const { response } = await dialog.showMessageBox({
    type: "question",
    title: "Reset administrator password",
    message: "Create a new one-time password for the 'admin' account?",
    detail: "Anyone signed in as admin will be signed out.",
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  try {
    const pwd = await resetAdminPassword(config.sql, loadArgon2(), log);
    await showAdminCredentials(pwd, "The administrator password was reset.");
  } catch (err) {
    log.error("[admin] reset failed", err);
    await message("error", "Reset failed", "The password could not be reset.", describeError(err));
  }
}

// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  log.info(`=== Project Manager ${app.getVersion()} starting (packaged=${app.isPackaged}) ===`);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  splash = createSplash();

  try {
    config = await ensureDatabaseEngine();
    const cfg = config;

    setSplashStatus("Checking the database…");
    await applyDatabaseSchema({
      target: cfg.sql,
      dbDir: paths.dbDir,
      log,
      backupBeforeMigrations: async () => {
        setSplashStatus("Backing up your data before upgrading…");
        await backupDatabase("pre-upgrade", {
          target: cfg.sql,
          backupDir: cfg.backupDir,
          copyDir: settings.get().backupCopyDir,
          log,
        });
        setSplashStatus("Upgrading the database…");
      },
    });

    const adminPassword = await ensureAdminAccount(cfg.sql, loadArgon2(), log);

    setSplashStatus("Starting Project Manager…");
    server = new NextServer({
      standaloneDir: paths.standaloneDir,
      db: cfg.sql,
      authSecret: cfg.authSecret,
      log,
      onRestarted: (url) => mainWindow?.loadURL(url).catch(() => undefined),
      onFatal: (msg) => {
        void message(
          "error",
          "Project Manager stopped",
          msg,
          `Please restart the app.\nLog: ${log.file}`,
        );
      },
    });
    const url = await server.start();

    if (adminPassword) {
      splash?.hide();
      await showAdminCredentials(
        adminPassword,
        "Welcome! Sign in with this administrator account.",
      );
    }

    mainWindow = createMainWindow(url);
    initTray(
      paths.icon,
      {
        open: showMain,
        backupNow: () => void backupNowAction(),
        openBackupsFolder: () => void shell.openPath(settings.get().backupCopyDir),
        chooseBackupCopyFolder: () => void chooseBackupCopyFolder(),
        restore: () => void restoreAction(),
        resetAdminPassword: () => void resetAdminAction(),
        openLogs: () => void shell.openPath(path.dirname(log.file)),
        quit: () => app.quit(),
      },
      app.getVersion(),
    );
    const updater = setupAutoUpdater(log, {
      getWindow: () => mainWindow,
      prepareToQuit: async () => {
        quitting = true;
        // Never cut a backup/restore off half-way for an update.
        if (busy) await busy.catch(() => undefined);
      },
      onReadyChanged: setTrayUpdateReady,
    });
    if (updater) {
      setTrayUpdateActions({
        checkForUpdates: () => void updater.checkNow(),
        installUpdate: () => void updater.installNow(),
      });
    }

    setTimeout(() => void backupIfDue(), 30_000);
    setInterval(() => void backupIfDue(), BACKUP_CHECK_MS);
  } catch (err) {
    log.error("[startup] failed", err);
    splash?.close();
    splash = null;
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: "Project Manager could not start",
      message: "Project Manager could not start.",
      detail: `${err instanceof Error ? err.message : String(err)}\n\nLog file: ${log.file}`,
      buttons: ["Open log folder", "Close"],
      defaultId: 1,
    });
    if (response === 0) await shell.openPath(path.dirname(log.file));
    quitting = true;
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMain);
  app.on("window-all-closed", () => {
    /* keep running in the tray */
  });
  app.on("before-quit", (e) => {
    quitting = true;
    // Never cut a backup/restore off half-way.
    if (busy) {
      e.preventDefault();
      log.info("[quit] waiting for backup/restore to finish");
      busy.finally(() => app.quit());
    }
  });
  app.on("will-quit", () => {
    server?.stop();
    destroyTray();
    log.info("=== quit ===");
  });
  app.whenReady().then(bootstrap);
}
