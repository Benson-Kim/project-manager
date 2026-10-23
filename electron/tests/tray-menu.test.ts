import { describe, expect, it } from "vitest";
import { trayMenuTemplate, type TrayActions } from "../tray-menu";

const noop = () => {};
const base: TrayActions = {
  open: noop,
  backupNow: noop,
  openBackupsFolder: noop,
  chooseBackupCopyFolder: noop,
  restore: noop,
  openLogs: noop,
  quit: noop,
};
const everything: TrayActions = {
  ...base,
  checkForUpdates: noop,
  installUpdate: noop,
  setUpAttachments: noop,
};

const labels = (actions: TrayActions, readyVersion: string | null = null) =>
  trayMenuTemplate(actions, { version: "1.0.9", readyVersion })
    .map((item) => item.label)
    .filter((label): label is string => Boolean(label));

describe("trayMenuTemplate", () => {
  it("never offers anything about passwords, whatever the app can do", () => {
    for (const actions of [base, everything]) {
      for (const ready of [null, "1.0.10"]) {
        expect(labels(actions, ready).filter((l) => /password|reset/i.test(l))).toEqual([]);
      }
    }
  });

  it("puts a ready update first", () => {
    expect(labels(everything, "1.0.10")[0]).toBe("Install update 1.0.10 (restarts the app)");
  });

  it("shows update items only for a build with an update feed", () => {
    expect(labels(base, "1.0.10").some((l) => /update/i.test(l))).toBe(false);
    expect(labels(everything)).toContain("Check for updates");
    expect(labels(everything).some((l) => l.startsWith("Install update"))).toBe(false);
  });

  it("offers the attachments setup only while it is needed", () => {
    expect(labels(base)).not.toContain("Set up attachments (administrator)…");
    expect(labels(everything)).toContain("Set up attachments (administrator)…");
  });

  it("shows the version and ends with Quit", () => {
    const items = labels(everything);
    expect(items).toContain("Version 1.0.9");
    expect(items.at(-1)).toBe("Quit Project Manager");
  });
});
