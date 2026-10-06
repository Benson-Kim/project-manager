import { app } from "electron";
import path from "path";

/**
 * Every on-disk location the desktop host needs, for both the packaged app
 * (process.resourcesPath) and a local run (`npm run electron:dev`, where the
 * bundle lives in build/desktop-app and the repo root is two levels up).
 */
const repoRoot = path.join(__dirname, "..", "..");

export const isPackaged = app.isPackaged;

export const paths = {
  standaloneDir: isPackaged ? path.join(process.resourcesPath, "standalone") : path.join(repoRoot, ".next", "standalone"),
  dbDir: isPackaged ? path.join(process.resourcesPath, "db") : path.join(repoRoot, "db"),
  provisionScript: isPackaged
    ? path.join(process.resourcesPath, "setup", "provision.ps1")
    : path.join(repoRoot, "electron", "setup", "provision.ps1"),
  sqlInstaller: isPackaged
    ? path.join(process.resourcesPath, "sql-express", "SQLEXPR_x64_ENU.exe")
    : path.join(repoRoot, "installers", "sql-express", "SQLEXPR_x64_ENU.exe"),
  icon: isPackaged ? path.join(process.resourcesPath, "icon.ico") : path.join(repoRoot, "build-resources", "icon.ico"),
  splash: path.join(__dirname, "splash.html"),
  preload: path.join(__dirname, "preload.js"),
};
