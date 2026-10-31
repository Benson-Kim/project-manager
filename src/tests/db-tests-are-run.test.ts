import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: every behaviour suite in db/tests is invoked by the CI db-apply job.
 *
 * The suites in db/tests are plain scripts — nothing discovers them. Each one runs
 * only because `.github/workflows/ci.yml` names it on its own `node db/tests/<x>.cjs`
 * line. A suite nobody added to that list is never run, and the suite passing locally
 * once is mistaken for coverage thereafter: the file exists, the README describes it,
 * and CI goes green without executing a line of it.
 *
 * This is the same failure as e2e/risks-issues*.spec.ts never being enrolled in a
 * Playwright project (see e2e-specs-are-run.test.ts). That one shipped. This test is
 * the other half of the lesson, since db/tests is the only place the stored procedures'
 * behaviour — the access checks in particular — is actually executed.
 */
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

/** Every `node db/tests/<name>.cjs` the workflow invokes. */
const invoked = new Set(
  [...workflow.matchAll(/node\s+db\/tests\/([\w.-]+\.cjs)/g)].map(([, name]) => name),
);

const suites = readdirSync("db/tests").filter((name) => name.endsWith(".cjs"));

describe("every db/tests suite is run by CI", () => {
  it("finds the suites and the workflow's invocations", () => {
    expect(suites.length).toBeGreaterThanOrEqual(12);
    expect(invoked.size).toBeGreaterThanOrEqual(12);
  });

  it.each(suites)("%s is invoked by the db-apply job", (suite) => {
    expect(
      invoked.has(suite),
      `db/tests/${suite} is never invoked in .github/workflows/ci.yml, so CI does not run it`,
    ).toBe(true);
  });

  it("every invocation names a suite that exists, so a rename cannot leave a dead line", () => {
    const present = new Set(suites);
    for (const name of invoked) expect(present, name).toContain(name);
  });

  it("the risks & issues procs are covered, since access control is the module's substance", () => {
    expect(suites).toContain("risk-issue-procs.cjs");
    expect(invoked.has("risk-issue-procs.cjs")).toBe(true);
  });
});
