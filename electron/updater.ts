import { app, BrowserWindow, dialog } from "electron";
import fs from "fs";
import path from "path";
import type { Logger } from "./log";

/**
 * Auto-update is only active when the build was given an update feed
 * (PM_UPDATE_URL at build time → electron-builder writes app-update.yml).
 * Without one there is nothing to check, so we don't spam errors.
 */
export function setupAutoUpdater(getWindow: () => BrowserWindow | null, log: Logger, beforeQuit: () => void): void {
  if (!app.isPackaged || !fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) {
    log.info("[updater] no update feed configured — auto-update disabled");
    return;
  }
  // Loaded lazily so a build without a feed never touches it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");
  autoUpdater.logger = { info: log.info, warn: log.warn, error: (m: unknown) => log.error(String(m)), debug: () => {} };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (info) => {
    const win = getWindow();
    const opts = {
      type: "info" as const,
      title: "Update available",
      message: `Project Manager ${info.version} is available. Download it now?`,
      detail: "If the update changes the database, a backup is taken automatically first.",
      buttons: ["Download", "Later"],
      defaultId: 0,
    };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response === 0) autoUpdater.downloadUpdate().catch((e) => log.error("[updater] download failed", e));
  });

  autoUpdater.on("update-downloaded", async () => {
    const win = getWindow();
    const opts = {
      type: "info" as const,
      title: "Update ready",
      message: "The update has been downloaded. Restart Project Manager to install it?",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
    };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response === 0) {
      beforeQuit();
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => log.error("[updater]", err));
  setTimeout(() => autoUpdater.checkForUpdates().catch((e) => log.error("[updater] check failed", e)), 15_000);
}
