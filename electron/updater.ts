import { app, BrowserWindow, dialog, Notification, type MessageBoxOptions } from "electron";
import type { UpdateInfo } from "electron-updater";
import fs from "fs";
import path from "path";
import type { Logger } from "./log";
import { paths } from "./paths";
import { isMandatory, releaseNotesText } from "./update-policy";

const FIRST_CHECK_MS = 30_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;
/** Reminder for an update that is ready but not installed yet. */
const REMIND_AFTER_MS = 24 * 60 * 60_000;
/** Time a required update gives people to save what they are typing. */
const REQUIRED_GRACE_MS = 5 * 60_000;

export interface UpdaterHooks {
  getWindow(): BrowserWindow | null;
  /** Marks the app as quitting and waits for any backup/restore to finish. */
  prepareToQuit(): Promise<void>;
  /** Shows or clears the tray's "Install update" item. */
  onReadyChanged(version: string | null): void;
}

export interface Updater {
  /** Tray → "Check for updates": checks now and tells the user the result. */
  checkNow(): Promise<void>;
  /** Tray → "Install update …". */
  installNow(): Promise<void>;
}

/**
 * Updates from the feed baked in at build time (electron-builder writes
 * resources/app-update.yml; CI points it at this repo's GitHub Releases).
 *
 * - New versions download quietly in the background (only the changed blocks).
 * - Optional update: a Windows notification and a tray item. Nothing installs
 *   until someone clicks "Restart and update"; quitting does NOT install it.
 * - Required update (release marked with minimumVersion): a warning, then the
 *   app restarts to install after REQUIRED_GRACE_MS.
 *
 * Installing runs the NSIS installer silently. The app is installed per user,
 * so no administrator approval is needed (build-resources/installer.nsh). The
 * app reopens afterwards and upgrades the database on start (backup first).
 */
export function setupAutoUpdater(log: Logger, hooks: UpdaterHooks): Updater | null {
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) {
    log.info("[updater] no update feed configured — auto-update disabled");
    return null;
  }
  // Loaded lazily so a build without a feed never touches it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
  autoUpdater.logger = {
    info: log.info,
    warn: log.warn,
    error: (m: unknown) => log.error(String(m)),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true; // we ship the full NSIS installer

  let ready: UpdateInfo | null = null;
  let requiredTimer: NodeJS.Timeout | null = null;
  let lastNotice = { version: "", at: 0 };
  let installing = false;

  const ask = async (opts: MessageBoxOptions): Promise<number> => {
    const win = hooks.getWindow();
    const r = win?.isVisible()
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    return r.response;
  };

  const whatsNew = (info: UpdateInfo) => {
    const notes = releaseNotesText(info.releaseNotes);
    return notes ? `What's new:\n${notes}\n\n` : "";
  };

  const install = async (): Promise<void> => {
    if (installing || !ready) return;
    installing = true;
    log.info(`[updater] installing ${ready.version}`);
    try {
      await hooks.prepareToQuit();
      autoUpdater.quitAndInstall(true, true); // silent, reopen afterwards
    } catch (err) {
      installing = false;
      log.error("[updater] install failed", err);
    }
  };

  const offer = async (info: UpdateInfo): Promise<void> => {
    const response = await ask({
      type: "info",
      title: "Update ready",
      message: `Project Manager ${info.version} is ready to install.`,
      detail:
        whatsNew(info) +
        "Installing takes a few minutes: the app closes and opens again by itself. " +
        "Your data stays; if the update changes the database, a backup is taken first.\n\n" +
        'Choose Later to keep working. You can install it any time from the tray menu ("Install update").',
      buttons: ["Restart and update", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) await install();
  };

  const announce = (info: UpdateInfo): void => {
    const now = Date.now();
    if (lastNotice.version === info.version && now - lastNotice.at < REMIND_AFTER_MS) return;
    lastNotice = { version: info.version, at: now };
    if (!Notification.isSupported()) {
      void offer(info);
      return;
    }
    const n = new Notification({
      title: `Project Manager ${info.version} is ready`,
      body: "Click to install it now, or keep working and install it later from the tray menu.",
      icon: paths.icon,
    });
    n.on("click", () => void offer(info));
    n.show();
  };

  const enforce = async (info: UpdateInfo): Promise<void> => {
    if (requiredTimer) return;
    const minutes = Math.round(REQUIRED_GRACE_MS / 60_000);
    log.warn(
      `[updater] ${info.version} is required (minimumVersion ${String((info as { minimumVersion?: unknown }).minimumVersion)}); installing in ${minutes} min`,
    );
    autoUpdater.autoInstallOnAppQuit = true; // quitting early installs it too
    requiredTimer = setTimeout(() => void install(), REQUIRED_GRACE_MS);
    const response = await ask({
      type: "warning",
      title: "Required update",
      message: `Project Manager ${info.version} is a required update.`,
      detail:
        `Please save what you are working on. Project Manager will restart to install it in ${minutes} minutes.\n\n` +
        whatsNew(info) +
        "The app closes and opens again by itself. Your data stays.",
      buttons: ["Restart now", `OK, restart in ${minutes} minutes`],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) await install();
  };

  const isRequired = (info: UpdateInfo) =>
    isMandatory(app.getVersion(), info as UpdateInfo & { minimumVersion?: unknown });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    const kind = isRequired(info) ? "required" : "optional";
    log.info(`[updater] ${info.version} available (${kind}), downloading`);
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    ready = info;
    hooks.onReadyChanged(info.version);
    const required = isRequired(info);
    log.info(`[updater] ${info.version} ready to install (${required ? "required" : "optional"})`);
    if (required) void enforce(info);
    else announce(info);
  });

  // Offline, GitHub down, rate limit…: log only, never bother the user.
  autoUpdater.on("error", (err) => log.warn(`[updater] ${err?.message ?? String(err)}`));

  const check = () =>
    autoUpdater.checkForUpdates().catch((e) => {
      log.warn(`[updater] check failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
  setTimeout(() => void check(), FIRST_CHECK_MS);
  setInterval(() => void check(), CHECK_INTERVAL_MS);

  return {
    async checkNow() {
      if (ready) return offer(ready);
      let result: Awaited<ReturnType<typeof autoUpdater.checkForUpdates>> = null;
      let failure: unknown = null;
      try {
        result = await autoUpdater.checkForUpdates();
      } catch (err) {
        failure = err;
      }
      if (ready) return offer(ready);
      await ask({
        type: failure ? "warning" : "info",
        title: "Updates",
        message: failure
          ? "Could not check for updates."
          : result?.isUpdateAvailable
            ? `Project Manager ${result.updateInfo.version} is downloading.`
            : `You have the latest version (${app.getVersion()}).`,
        detail: failure
          ? "Check the internet connection and try again later."
          : result?.isUpdateAvailable
            ? "You will be told when it is ready to install."
            : undefined,
        buttons: ["OK"],
      });
    },
    installNow: install,
  };
}
