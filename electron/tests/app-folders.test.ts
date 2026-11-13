import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_ID, APP_NAME, backupCopyDir, carryOverProfile, programDataDir } from "../app-folders";

const root = "C:\\ProgramData";
const has =
  (...files: string[]) =>
  (file: string) =>
    files.includes(file);

describe("programDataDir", () => {
  it("reads the new folder once it has a config", () => {
    const both = has(
      path.join(root, "Modulus", "machine.json"),
      path.join(root, "Project Manager", "machine.json"),
    );
    expect(programDataDir(root, both)).toBe(path.join(root, "Modulus"));
  });

  it("keeps reading the old folder on a PC set up before the rename", () => {
    const old = has(path.join(root, "Project Manager", "machine.json"));
    expect(programDataDir(root, old)).toBe(path.join(root, "Project Manager"));
  });

  it("names the new folder on a PC not set up yet", () => {
    expect(programDataDir(root, has())).toBe(path.join(root, "Modulus"));
  });
});

describe("backupCopyDir", () => {
  const base = "C:\\Users\\a\\OneDrive";
  const legacy = path.join(base, "Project Manager Backups");
  const current = path.join(base, "Modulus Backups");

  it("keeps the old folder while it is the only one", () => {
    expect(backupCopyDir(base, has(legacy))).toBe(legacy);
  });

  it("uses the new folder otherwise", () => {
    expect(backupCopyDir(base, has())).toBe(current);
    expect(backupCopyDir(base, has(legacy, current))).toBe(current);
  });
});

describe("carryOverProfile", () => {
  let appData = "";
  afterEach(() => fs.rmSync(appData, { recursive: true, force: true }));
  const make = (file: string, text = "x") => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };

  it("copies the settings once and leaves the caches and the old folder behind", () => {
    appData = fs.mkdtempSync(path.join(os.tmpdir(), "app-folders-"));
    const legacy = path.join(appData, "Project Manager");
    make(path.join(legacy, "settings.json"), "{}");
    make(path.join(legacy, "Local Storage", "leveldb", "000003.log"));
    make(path.join(legacy, "Cache", "data_0"));
    make(path.join(legacy, "Code Cache", "js", "index"));

    expect(carryOverProfile(appData)).toBeNull();
    const current = path.join(appData, "Modulus");
    expect(fs.readFileSync(path.join(current, "settings.json"), "utf8")).toBe("{}");
    expect(fs.existsSync(path.join(current, "Local Storage", "leveldb", "000003.log"))).toBe(true);
    expect(fs.existsSync(path.join(current, "Cache"))).toBe(false);
    expect(fs.existsSync(path.join(current, "Code Cache"))).toBe(false);
    expect(fs.existsSync(path.join(legacy, "settings.json"))).toBe(true);

    make(path.join(legacy, "settings.json"), "changed");
    expect(carryOverProfile(appData)).toBeNull();
    expect(fs.readFileSync(path.join(current, "settings.json"), "utf8")).toBe("{}");
  });

  it("does nothing for a new user", () => {
    appData = fs.mkdtempSync(path.join(os.tmpdir(), "app-folders-"));
    expect(carryOverProfile(appData)).toBeNull();
    expect(fs.existsSync(path.join(appData, "Modulus"))).toBe(false);
  });
});

describe("installer config", () => {
  const config = fs.readFileSync(
    path.join(__dirname, "..", "..", "electron-builder.config.cjs"),
    "utf8",
  );

  it("installs under the same name and id the app runs as", () => {
    expect(config).toContain(`appId: "${APP_ID}",`);
    expect(config).toContain(`productName: "${APP_NAME}",`);
    expect(config).toContain(`shortcutName: "${APP_NAME}",`);
  });
});
