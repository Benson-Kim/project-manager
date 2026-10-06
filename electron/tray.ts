import { Menu, Tray, nativeImage } from "electron";

export interface TrayActions {
  open(): void;
  backupNow(): void;
  openBackupsFolder(): void;
  chooseBackupCopyFolder(): void;
  restore(): void;
  resetAdminPassword(): void;
  openLogs(): void;
  quit(): void;
}

let tray: Tray | null = null;

export function initTray(iconPath: string, actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Project Manager");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Project Manager", click: actions.open },
      { type: "separator" },
      { label: "Back up now", click: actions.backupNow },
      { label: "Open backups folder", click: actions.openBackupsFolder },
      { label: "Choose backup copy folder…", click: actions.chooseBackupCopyFolder },
      { label: "Restore from backup…", click: actions.restore },
      { type: "separator" },
      { label: "Reset administrator password…", click: actions.resetAdminPassword },
      { label: "Open log files", click: actions.openLogs },
      { type: "separator" },
      { label: "Quit Project Manager", click: actions.quit },
    ]),
  );
  tray.on("double-click", actions.open);
  return tray;
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
}
