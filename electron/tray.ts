import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";

export interface TrayActions {
  open(): void;
  backupNow(): void;
  openBackupsFolder(): void;
  chooseBackupCopyFolder(): void;
  restore(): void;
  resetAdminPassword(): void;
  openLogs(): void;
  quit(): void;
  /** Present only when the build has an update feed. */
  checkForUpdates?(): void;
  installUpdate?(): void;
}

let tray: Tray | null = null;
let actions: TrayActions | null = null;
let appVersion = "";
let readyVersion: string | null = null;

function buildMenu(a: TrayActions): Menu {
  const update: MenuItemConstructorOptions[] = [];
  if (readyVersion && a.installUpdate) {
    update.push(
      { label: `Install update ${readyVersion} (restarts the app)`, click: a.installUpdate },
      { type: "separator" },
    );
  }
  return Menu.buildFromTemplate([
    ...update,
    { label: "Open Project Manager", click: a.open },
    { type: "separator" },
    { label: "Back up now", click: a.backupNow },
    { label: "Open backups folder", click: a.openBackupsFolder },
    { label: "Choose backup copy folder…", click: a.chooseBackupCopyFolder },
    { label: "Restore from backup…", click: a.restore },
    { type: "separator" },
    { label: "Reset administrator password…", click: a.resetAdminPassword },
    { label: "Open log files", click: a.openLogs },
    ...(a.checkForUpdates
      ? [{ label: "Check for updates", click: a.checkForUpdates } as MenuItemConstructorOptions]
      : []),
    { label: `Version ${appVersion}`, enabled: false },
    { type: "separator" },
    { label: "Quit Project Manager", click: a.quit },
  ]);
}

function refresh(): void {
  if (!tray || !actions) return;
  tray.setContextMenu(buildMenu(actions));
  tray.setToolTip(
    readyVersion ? `Project Manager — update ${readyVersion} ready` : "Project Manager",
  );
}

export function initTray(iconPath: string, trayActions: TrayActions, version: string): Tray {
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  actions = trayActions;
  appVersion = version;
  refresh();
  tray.on("double-click", trayActions.open);
  return tray;
}

/** Adds (or removes, with null) the "Install update …" item. */
export function setTrayUpdateReady(version: string | null): void {
  readyVersion = version;
  refresh();
}

/** The update feed came up after the tray was built: add its menu items. */
export function setTrayUpdateActions(
  update: Pick<TrayActions, "checkForUpdates" | "installUpdate">,
): void {
  if (!actions) return;
  actions = { ...actions, ...update };
  refresh();
}

export function showTrayHint(): void {
  tray?.displayBalloon({
    title: "Project Manager is still running",
    content: "It keeps backing up your data. Use the tray icon to open it or quit.",
    iconType: "info",
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  actions = null;
}
