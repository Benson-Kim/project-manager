import { Menu, Tray, nativeImage } from "electron";
import { trayMenuTemplate, type TrayActions } from "./tray-menu";

let tray: Tray | null = null;
let actions: TrayActions | null = null;
let appVersion = "";
let readyVersion: string | null = null;

function refresh(): void {
  if (!tray || !actions) return;
  tray.setContextMenu(
    Menu.buildFromTemplate(trayMenuTemplate(actions, { version: appVersion, readyVersion })),
  );
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

/** A short Windows notification from the tray, for news that needs no answer. */
export function showTrayNotice(title: string, content: string): void {
  tray?.displayBalloon({ title, content, iconType: "info" });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
  actions = null;
}
