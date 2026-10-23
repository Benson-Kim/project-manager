import type { MenuItemConstructorOptions } from "electron";

/**
 * What the tray can do. Passwords are deliberately absent: anyone at the PC can open the
 * tray, so account recovery stays with an administrator (docs/SECURITY.md, operator runbook).
 */
export interface TrayActions {
  open(): void;
  backupNow(): void;
  openBackupsFolder(): void;
  chooseBackupCopyFolder(): void;
  restore(): void;
  openLogs(): void;
  quit(): void;
  /** Present only when the build has an update feed. */
  checkForUpdates?(): void;
  installUpdate?(): void;
  /** Present only while this PC has no attachments folder (ADR-0026 §9). */
  setUpAttachments?(): void;
}

export interface TrayState {
  version: string;
  /** A downloaded update waiting to be installed. */
  readyVersion: string | null;
}

export function trayMenuTemplate(a: TrayActions, s: TrayState): MenuItemConstructorOptions[] {
  const update: MenuItemConstructorOptions[] =
    s.readyVersion && a.installUpdate
      ? [
          { label: `Install update ${s.readyVersion} (restarts the app)`, click: a.installUpdate },
          { type: "separator" },
        ]
      : [];
  return [
    ...update,
    { label: "Open Project Manager", click: a.open },
    { type: "separator" },
    { label: "Back up now", click: a.backupNow },
    { label: "Open backups folder", click: a.openBackupsFolder },
    { label: "Choose backup copy folder…", click: a.chooseBackupCopyFolder },
    { label: "Restore from backup…", click: a.restore },
    { type: "separator" },
    ...(a.setUpAttachments
      ? [{ label: "Set up attachments (administrator)…", click: a.setUpAttachments }]
      : []),
    { label: "Open log files", click: a.openLogs },
    ...(a.checkForUpdates ? [{ label: "Check for updates", click: a.checkForUpdates }] : []),
    { label: `Version ${s.version}`, enabled: false },
    { type: "separator" },
    { label: "Quit Project Manager", click: a.quit },
  ];
}
