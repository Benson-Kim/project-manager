import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { appIdentity, programDataDir } from "../app-folders";

const read = (file: string) =>
  fs.readFileSync(path.join(__dirname, "..", "..", file), "utf8").replaceAll("\r\n", "\n");

describe("beta database separation", () => {
  it("gives the beta app its own machine folder, never the client's", () => {
    const beta = appIdentity({ channel: "beta" });
    for (const found of [true, false]) {
      expect(programDataDir("root", () => found, beta)).toBe(path.join("root", "Modulus Beta"));
    }
  });

  it("keeps the client and dev machine folder", () => {
    const client = appIdentity(null);
    expect(programDataDir("root", () => false, client)).toBe(path.join("root", "Modulus"));
    const notRenamed = (file: string) => file.includes("Project Manager");
    expect(programDataDir("root", notRenamed, client)).toBe(path.join("root", "Project Manager"));
  });

  it("names a separate database and login only under -Beta", () => {
    const script = read("electron/setup/provision.ps1");
    expect(script).toContain("$Database = 'ProjectManager'\n$AppLogin = 'pm_app'\nif ($Beta) {");
    expect(script).toContain("$Database = 'ModulusBeta'\n  $AppLogin = 'pm_beta'");
    expect(script).toContain("if ($Beta) { $argList += ' -Beta' }");
    const sql = script.slice(script.indexOf("$loginSql = @"));
    expect(sql).not.toContain("pm_app");
    expect(sql).not.toContain("'ProjectManager'");
  });

  it("keeps a beta installer away from the installed client app", () => {
    const hooks = read("build-resources/installer.nsh");
    const skip = hooks.indexOf("!ifdef PM_BETA\n    Goto pm_legacy_done");
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(hooks.indexOf("-InstallDir"));
    expect(hooks).toContain("$R3${PM_SETUP_ARGS}'");
    expect(hooks).toContain('!define PM_SETUP_ARGS ""');
  });
});
