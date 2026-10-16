import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail for ADR-0033: the server edition's app connects as an EXECUTE-only login, never as
 * sa, and the operator's scripts never pick the app's credentials up by accident. The behaviour
 * itself is proven in CI (db/verify/app_login.sql, and db/tests plus Playwright run as the app
 * login); these checks stop the configuration from drifting back.
 */
function text(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text(path).split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** The `- name:` steps of a workflow, each as its own block of text. */
function steps(workflow: string): string[] {
  return text(workflow)
    .split(/\n\s+- name: /)
    .slice(1);
}

function stepEnv(step: string, key: string): string | undefined {
  return new RegExp(`\\n\\s+${key}: "?([^"\\n]+)"?`).exec(step)?.[1];
}

const LOGIN_SQL = "db/security/app-login.sql";
const ADMIN_SCRIPTS = [
  "scripts/db-apply.sh",
  "scripts/backup.sh",
  "scripts/restore.sh",
  "scripts/restore-rehearsal.sh",
];

describe("app database login (ADR-0033)", () => {
  it("gives the app container its own login, never sa or the sa password", () => {
    const compose = text("docker-compose.yml");
    const app = compose.slice(compose.indexOf("\n  app:"), compose.indexOf("\nvolumes:"));
    expect(app).toMatch(/\n\s+DB_USER: "\$\{DB_APP_USER:-pm_web\}"/);
    expect(app).toMatch(/\n\s+DB_PASSWORD: "\$\{DB_APP_PASSWORD:\?/);
    expect(app).not.toMatch(/DB_USER:\s*"?sa"?\s*\n/);
    expect(app).not.toContain("MSSQL_SA_PASSWORD");
  });

  it("defaults the app to the same login db-apply creates", () => {
    expect(text("src/lib/env.ts")).toContain('DB_USER: z.string().min(1).default("pm_web")');
    expect(text("scripts/db-apply.sh")).toContain('DB_APP_USER="${DB_APP_USER:-pm_web}"');
    const example = envFile(".env.example");
    expect(example.DB_USER).toBe(example.DB_APP_USER);
    expect(example.DB_PASSWORD).toBe(example.DB_APP_PASSWORD);
    expect(example.DB_USER).not.toBe("sa");
  });

  it("keeps the admin scripts off the app's DB_USER / DB_PASSWORD", () => {
    for (const script of ADMIN_SCRIPTS) {
      const code = text(script)
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("#"))
        .join("\n");
      expect(code, script).not.toMatch(/\$\{?DB_(USER|PASSWORD)\b/);
      expect(code, script).toContain(
        'DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-${MSSQL_SA_PASSWORD:-}}"',
      );
    }
  });

  it("grants the role EXECUTE on schema dbo and nothing else", () => {
    const login = text(LOGIN_SQL);
    expect(login.match(/^[ \t]*GRANT\b.*$/gm)).toEqual([
      "GRANT EXECUTE ON SCHEMA::dbo TO app_executor;",
    ]);
    expect(login).not.toMatch(/sp_add(srv)?rolemember|ALTER SERVER ROLE|ALTER ROLE db_|\bDENY\b/i);
    expect(login).toMatch(/ALTER ROLE app_executor ADD MEMBER ' \+ QUOTENAME\(@Login\)/);
    expect(login).toContain("CHECK_POLICY = ON");
  });

  it("quotes the password and the login name in every dynamic statement", () => {
    const login = text(LOGIN_SQL);
    expect(login.match(/WITH PASSWORD = ' \+ QUOTENAME\(@Password, N''''\)/g)).toHaveLength(2);
    expect(login).not.toMatch(/\+\s*@(Password|Login)\s*\+/);
    expect(text("scripts/db-apply.sh")).toContain(`sed "s/'/''/g"`);
  });

  it("keeps every proc on static SQL, where ownership chaining carries EXECUTE to the tables", () => {
    const procs = readdirSync("db/procs", { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".sql"));
    expect(procs.length).toBeGreaterThan(100);
    const dynamic = procs.filter((f) =>
      /sp_executesql|\bEXEC(UTE)?\s*\(\s*(@|N?')|\bEXECUTE\s+AS\b/i.test(text(join("db/procs", f))),
    );
    expect(dynamic).toEqual([]);
  });

  it("runs the CI app and proc checks as the app login and verifies its rights", () => {
    const ci = steps(".github/workflows/ci.yml");
    const asApp = ci.filter((s) => /npm run e2e|node db\/tests\//.test(s));
    expect(asApp.length).toBeGreaterThanOrEqual(2);
    for (const step of asApp) {
      expect(stepEnv(step, "DB_USER"), step.split("\n")[0]).toBe("pm_web");
    }
    expect(ci.some((s) => s.includes("-i db/verify/app_login.sql"))).toBe(true);
    for (const step of ci.filter((s) => s.includes("sh scripts/db-apply.sh"))) {
      expect(stepEnv(step, "DB_APP_PASSWORD"), step.split("\n")[0]).toBeTruthy();
    }
  });
});
