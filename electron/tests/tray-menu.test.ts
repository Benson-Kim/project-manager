import { describe, expect, it, vi } from "vitest";
import { COPY_NOW_LABEL, trayMenuTemplate, type TrayActions } from "../tray-menu";

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

const labels = (actions: TrayActions, readyVersion: string | null = null, copyOverdue = false) =>
  trayMenuTemplate(actions, { version: "1.0.9", readyVersion, copyOverdue })
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

  it("offers to back up and copy first, after a ready update, only while copies are overdue", () => {
    expect(labels(everything)).not.toContain(COPY_NOW_LABEL);
    expect(labels(base, null, true)[0]).toBe(COPY_NOW_LABEL);
    expect(labels(everything, "1.0.10", true).slice(0, 2)).toEqual([
      "Install update 1.0.10 (restarts the app)",
      COPY_NOW_LABEL,
    ]);
    const backupNow = vi.fn();
    const item = trayMenuTemplate(
      { ...base, backupNow },
      { version: "1.0.9", readyVersion: null, copyOverdue: true },
    )[0]!;
    (item.click as () => void)();
    expect(backupNow).toHaveBeenCalledOnce();
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
