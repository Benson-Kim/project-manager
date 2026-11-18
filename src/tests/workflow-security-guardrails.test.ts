import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("secret scanning workflow", () => {
  const workflow = read(".github/workflows/secret-scan.yml");

  it("runs on push and pull request over the full history", () => {
    expect(workflow).toMatch(/^on:\s*\n\s+push:\s*\n\s+pull_request:/m);
    expect(workflow).toMatch(/fetch-depth:\s*0/);
    expect(workflow).toMatch(/gitleaks"? git /);
  });

  it("installs a pinned gitleaks release only after its SHA-256 matches", () => {
    expect(workflow).toMatch(/GITLEAKS_VERSION:\s*"\d+\.\d+\.\d+"/);
    expect(workflow).toMatch(/GITLEAKS_SHA256:\s*"[0-9a-f]{64}"/);
    const download = workflow.indexOf("curl ");
    const verify = workflow.indexOf("sha256sum -c");
    const extract = workflow.indexOf("tar -xzf");
    expect(download).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(download);
    expect(extract).toBeGreaterThan(verify);
  });

  it("uses only actions pinned to a commit and a config that exists", () => {
    for (const [, ref] of workflow.matchAll(/uses:\s*\S+@(\S+)/g))
      expect(ref).toMatch(/^[0-9a-f]{40}$/);
    expect(workflow).not.toContain("gitleaks/gitleaks-action");
    expect(read(".gitleaks.toml")).toMatch(/useDefault\s*=\s*true/);
  });
});

describe("backup rehearsal workflow", () => {
  const workflow = read(".github/workflows/backup.yml");

  it("never falls back to a built-in database password", () => {
    expect(workflow).not.toMatch(/secrets\.MSSQL_SA_PASSWORD\s*\|\|/);
    expect(workflow).toMatch(/secrets\.MSSQL_SA_PASSWORD != ''/);
  });
});

describe("desktop release workflow", () => {
  const workflow = read(".github/workflows/desktop-release.yml");
  const build = read("scripts/desktop/build.mjs");

  it("refuses to publish an unsigned installer unless that is chosen explicitly", () => {
    expect(workflow).toMatch(/PM_ALLOW_UNSIGNED_RELEASE" != "true"[\s\S]*?exit 1/);
    expect(workflow).toMatch(/verify-signature\.mjs \$allow/);
  });

  it("keeps the signing secrets out of every build step except the packaging", () => {
    for (const secret of ["AZURE_CLIENT_SECRET", "CSC_KEY_PASSWORD"]) {
      const steps = workflow
        .split(/\n\s+- name: /)
        .filter((step) =>
          step.includes(
            `secrets.${secret === "CSC_KEY_PASSWORD" ? "WIN_CSC_KEY_PASSWORD" : secret}`,
          ),
        );
      expect(steps).toHaveLength(1);
      expect(steps[0]).toContain("Build installer");
    }
  });

  it("builds the app in a step without secrets and only packages it in the signing step", () => {
    const steps = workflow.split(/\n\s+- name: /);
    const stage = steps.find((s) => s.startsWith("Stage the app"));
    const pack = steps.find((s) => s.startsWith("Build installer"));
    expect(stage).toContain("build.mjs --stage-only");
    expect(stage).not.toContain("secrets.");
    expect(pack).toContain("build.mjs --package-only");
    expect(pack).not.toMatch(/npm (run|ci)/);
    expect(steps.indexOf(stage!)).toBeLessThan(steps.indexOf(pack!));
    expect(build).toMatch(/if \(!packageOnly\) \{\r?\n {2}\/\/ 2\. Next\.js standalone/);
    expect(build).toMatch(/if \(packageOnly\) \{[\s\S]*?stagedVersion !== version/);
  });

  it("hands the secrets only to electron-builder, not to the web build or other children", () => {
    expect(build).toMatch(/SIGNING_SECRETS = \[[^\]]*AZURE_CLIENT_SECRET[^\]]*CSC_KEY_PASSWORD/);
    expect(build).toMatch(/signing \? process\.env : withoutSigningSecrets\(process\.env\)/);
    const signingCalls = build.match(/signing: true/g) ?? [];
    expect(signingCalls).toHaveLength(1);
    expect(build.slice(build.indexOf("npx electron-builder"))).toMatch(/\{ signing: true \}/);
  });
});

describe("licence service tooling", () => {
  it("ignores the local deploy files and pins the deploy tool", () => {
    const ignore = read(".gitignore").split(/\r?\n/);
    for (const entry of ["wrangler.toml", ".dev.vars", ".wrangler/"])
      expect(ignore).toContain(entry);
    const pkg = JSON.parse(read("services/licence/package.json"));
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("dependency updates", () => {
  it("never automerges what ships in the installer", () => {
    const config = JSON.parse(read("renovate.json"));
    expect(config.lockFileMaintenance.automerge).toBe(false);
    expect(config.vulnerabilityAlerts.automerge).toBe(false);
    const rules = config.packageRules as { matchDepTypes?: string[]; automerge?: boolean }[];
    for (const rule of rules.filter((r) => r.automerge))
      expect(rule.matchDepTypes).toEqual(["devDependencies"]);
  });
});
