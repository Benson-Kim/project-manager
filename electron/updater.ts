import { app, BrowserWindow, dialog, Notification, type MessageBoxOptions } from "electron";
import type { UpdateInfo } from "electron-updater";
import fs from "fs";
import path from "path";
import type { Logger } from "./log";
import { paths } from "./paths";
import { alignDifferentialBase, updaterCacheDir, type BaseState } from "./update-cache";
import {
  checkAnswer,
  installOutcome,
  isMandatory,
  isNewer,
  releaseNotesText,
  type CheckAnswer,
} from "./update-policy";
import type { SettingsStore } from "./user-settings";

const FIRST_CHECK_MS = 30_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;
/** Reminder for an update that is ready but not installed yet. */
const REMIND_AFTER_MS = 24 * 60 * 60_000;
/** Time a required update gives people to save what they are typing. */
const REQUIRED_GRACE_MS = 5 * 60_000;
/**
 * Still running this long after "Restart and update": the installer did not start. It reads
 * its whole 400 MB file before it closes the app, so this leaves room for a slow disk.
 */
const INSTALL_START_MS = 60_000;
/**
 * Windows keeps a notice in the Action Center after the app that showed it has quit, and a
 * click on it then reaches nobody. One fixed id makes each new notice replace the last.
 */
const NOTICE_ID = "update-ready";

export interface UpdaterHooks {
  getWindow(): BrowserWindow | null;
  /** Brings the main window to the front, so the update dialog opens on top of it. */
  showWindow(): void;
  /** Marks the app as quitting and waits for any backup/restore to finish. */
  prepareToQuit(): Promise<void>;
  /** The installer did not start: the app keeps running. */
  cancelQuit(): void;
  /** Shows or clears the tray's "Install update" item. */
  onReadyChanged(version: string | null): void;
  /** A short notice that needs no answer. */
  notify(title: string, body: string): void;
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
 * - New versions download quietly in the background (only the changed blocks,
 *   see update-cache.ts).
 * - Optional update: a Windows notification and a tray item. Nothing installs
 *   until someone clicks "Restart and update"; quitting does NOT install it.
 * - Required update (release marked with minimumVersion): a warning, then the
 *   app restarts to install after REQUIRED_GRACE_MS.
 * - Always the newest: the feed is asked again before a downloaded update is
 *   offered or installed, and a newer release replaces it (see checkAnswer).
 * - The next start says whether the update installed.
 *
 * Installing runs the NSIS installer silently. The app is installed per user,
 * so no administrator approval is needed (build-resources/installer.nsh). The
 * app reopens afterwards and upgrades the database on start (backup first).
 */
export function setupAutoUpdater(
  log: Logger,
  settings: Pick<SettingsStore, "get" | "set">,
  hooks: UpdaterHooks,
): Updater | null {
  const feedFile = path.join(process.resourcesPath, "app-update.yml");
  if (!app.isPackaged || !fs.existsSync(feedFile)) {
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
  // ADR-0034: with a publisherName in the feed, electron-updater checks the downloaded
  // installer's Authenticode signature (valid chain + this subject) before installing.
  const feed = fs.readFileSync(feedFile, "utf8");
  const publisher = /^publisherName:\s*(.*)$/m.exec(feed)?.[1]?.trim();
  log.info(
    publisher
      ? `[updater] installer signatures are verified against ${publisher}`
      : "[updater] releases are unsigned: installer signatures are not verified",
  );
  const cacheDir = updaterCacheDir(feed);

  let ready: UpdateInfo | null = null;
  let requiredTimer: NodeJS.Timeout | null = null;
  let installTimer: NodeJS.Timeout | null = null;
  let lastNotice = { version: "", at: 0 };
  let installing = false;
  let offering = false;
  let base: BaseState | null = null;
  // Held while it can still be clicked: a garbage-collected Notification drops its click.
  let notice: Notification | null = null;

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

  const reportLastInstall = (): void => {
    const attempted = settings.get().updateInstalling;
    if (attempted === undefined) return;
    settings.set({ updateInstalling: undefined });
    const outcome = installOutcome(app.getVersion(), attempted);
    if (outcome === "updated") {
      log.info(`[updater] updated to ${app.getVersion()}`);
      hooks.notify("Update installed", `You now have version ${app.getVersion()}.`);
    } else if (outcome === "not-installed") {
      log.error(`[updater] ${attempted} did not install; ${app.getVersion()} is still running`);
      hooks.notify(
        "Update not installed",
        `Version ${attempted} could not be installed. It will be offered again.`,
      );
    }
  };

  const installFailed = (err: unknown): void => {
    if (!installing) return;
    installing = false;
    if (installTimer) clearTimeout(installTimer);
    installTimer = null;
    hooks.cancelQuit();
    log.error("[updater] the installer did not start", err);
    void ask({
      type: "warning",
      title: "Update not installed",
      message: "The update could not be installed.",
      detail: "Try again from the tray menu.",
      buttons: ["OK"],
      noLink: true,
    });
    settings.set({ updateInstalling: undefined });
  };

  // quitAndInstall reports a refusal (no downloaded installer) as an "error" event, not a throw.
  const startInstaller = (): void => {
    const seen: { error?: unknown } = {};
    const onError = (err: Error) => {
      seen.error = err;
    };
    autoUpdater.once("error", onError);
    try {
      autoUpdater.quitAndInstall(true, true); // silent, reopen afterwards
    } finally {
      autoUpdater.removeListener("error", onError);
    }
    if (seen.error !== undefined) throw seen.error;
  };

  const install = async (): Promise<void> => {
    if (installing || !ready) return;
    installing = true;
    const version = ready.version;
    notice?.close();
    notice = null;
    log.info(`[updater] installing ${version}`);
    try {
      await hooks.prepareToQuit();
      settings.set({ updateInstalling: version });
      startInstaller();
      installTimer = setTimeout(
        () => installFailed(new Error("The app did not close to let the installer run.")),
        INSTALL_START_MS,
      );
    } catch (err) {
      installFailed(err);
    }
  };

  const offer = async (): Promise<void> => {
    const info = ready;
    if (!info || offering || installing) return;
    offering = true;
    try {
      const response = await ask({
        type: "info",
        title: "Update ready",
        message: `Project Manager ${info.version} is ready to install.`,
        detail: `${whatsNew(info)}Save your work first: the app restarts to update.`,
        buttons: ["Restart and update", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) await install();
    } finally {
      offering = false;
    }
  };

  const announce = (info: UpdateInfo): void => {
    const now = Date.now();
    if (lastNotice.version === info.version && now - lastNotice.at < REMIND_AFTER_MS) return;
    lastNotice = { version: info.version, at: now };
    if (!Notification.isSupported()) {
      void offer();
      return;
    }
    notice?.close();
    notice = new Notification({
      id: NOTICE_ID,
      title: `Update ${info.version} is ready`,
      body: "Click to install.",
      icon: paths.icon,
    });
    notice.on("click", () => {
      hooks.showWindow();
      void offerNewest();
    });
    notice.show();
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
      detail: `${whatsNew(info)}Save your work: the app restarts to update in ${minutes} minutes.`,
      buttons: ["Restart now", `Restart in ${minutes} minutes`],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) await install();
  };

  const isRequired = (info: UpdateInfo) =>
    isMandatory(app.getVersion(), info as UpdateInfo & { minimumVersion?: unknown });

  // A newer release replaces one downloaded earlier: nobody installs the version it replaced.
  const dropReady = (): void => {
    ready = null;
    hooks.onReadyChanged(null);
    notice?.close();
    notice = null;
    if (requiredTimer) clearTimeout(requiredTimer);
    requiredTimer = null;
    autoUpdater.autoInstallOnAppQuit = false;
  };

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    const kind = isRequired(info) ? "required" : "optional";
    log.info(`[updater] ${info.version} available (${kind}), downloading`);
    if (ready && isNewer(info.version, ready.version) && !installing) {
      log.info(`[updater] ${info.version} replaces ${ready.version}, which is no longer offered`);
      dropReady();
    }
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

  const alignBase = (): void => {
    if (!cacheDir) return;
    try {
      const state = alignDifferentialBase(cacheDir);
      if (state !== base) log.info(`[updater] differential download base: ${state} (${cacheDir})`);
      base = state;
    } catch (err) {
      log.warn(
        `[updater] differential download base not checked: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const checkForUpdates = () => {
    alignBase();
    return autoUpdater.checkForUpdates();
  };

  const check = () =>
    checkForUpdates().catch((e) => {
      log.warn(`[updater] check failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });

  // A notice left behind would outlive the app that can act on it.
  app.on("will-quit", () => notice?.close());

  reportLastInstall();
  setTimeout(() => void check(), FIRST_CHECK_MS);
  setInterval(() => void check(), CHECK_INTERVAL_MS);

  /** Asks the feed first, so an update downloaded earlier is never offered over a newer one. */
  const freshCheck = async (): Promise<{ answer: CheckAnswer; latest: string | null }> => {
    let result: Awaited<ReturnType<typeof autoUpdater.checkForUpdates>> = null;
    let failed = false;
    try {
      result = await checkForUpdates();
    } catch (err) {
      failed = true;
      log.warn(`[updater] check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const latest = result?.isUpdateAvailable ? result.updateInfo.version : null;
    return { answer: checkAnswer(ready?.version ?? null, latest, failed), latest };
  };

  const tell = (answer: CheckAnswer, latest: string | null) =>
    ask({
      type: answer === "failed" ? "warning" : "info",
      title: "Updates",
      message:
        answer === "failed"
          ? "Could not check for updates. Check the internet connection."
          : answer === "downloading"
            ? `Project Manager ${latest} is downloading.`
            : `You have the latest version (${app.getVersion()}).`,
      buttons: ["OK"],
    });

  const offerNewest = async (): Promise<void> => {
    const { answer, latest } = await freshCheck();
    if (answer === "offer-ready") return offer();
    await tell(answer, latest);
  };

  return {
    checkNow: offerNewest,
    async installNow() {
      const { answer, latest } = await freshCheck();
      if (answer === "offer-ready") return install();
      await tell(answer, latest);
    },
  };
}
