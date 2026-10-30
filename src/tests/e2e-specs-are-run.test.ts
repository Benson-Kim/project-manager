import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: every spec in e2e/ is claimed by a Playwright project.
 *
 * playwright.config.ts selects specs with an explicit `testMatch` allowlist of
 * filenames per project, not a glob. A spec whose name is missing from every
 * list is silently never run — the suite stays green, the count goes up by
 * nothing, and the module ships with its browser coverage switched off. That is
 * exactly what happened to e2e/risks-issues*.spec.ts on its first push (CI run
 * 41071026771: 257 tests, none of them the new module's).
 *
 * Reading the config's regexes rather than running Playwright keeps this in the
 * Vitest job, which runs on every push whether or not [e2e] is in the message.
 */
const config = readFileSync("playwright.config.ts", "utf8");

/** Every `testMatch: /…/` in the config, as a live regex. */
const matchers = [...config.matchAll(/testMatch:\s*\n?\s*(\/(?:[^/\\]|\\.)+\/)/g)].map(
  ([, source]) => {
    const body = source.slice(1, source.lastIndexOf("/"));
    return new RegExp(body);
  },
);

/** Specs that are deliberately not in the suite, and why. */
const STANDALONE: Record<string, string> = {
  "demo-screenshots.spec.ts":
    "captures demo/documentation screenshots on demand against a running server; its own header says it is excluded",
};

const specs = readdirSync("e2e")
  .filter((name) => name.endsWith(".spec.ts"))
  .filter((name) => !(name in STANDALONE));

describe("every e2e spec is run by some Playwright project", () => {
  it("reads the config's testMatch patterns and the spec files", () => {
    // Five projects declare one each: setup, viewer-setup, public, app, app-viewer.
    expect(matchers.length).toBeGreaterThanOrEqual(5);
    expect(specs.length).toBeGreaterThanOrEqual(30);
  });

  it("every standalone spec still exists, so the exemption cannot outlive its file", () => {
    const present = new Set(readdirSync("e2e"));
    for (const name of Object.keys(STANDALONE)) expect(present, name).toContain(name);
  });

  it.each(specs)("%s is claimed by a project", (spec) => {
    expect(
      matchers.some((pattern) => pattern.test(spec)),
      `${spec} matches no testMatch in playwright.config.ts, so Playwright never runs it`,
    ).toBe(true);
  });
});
