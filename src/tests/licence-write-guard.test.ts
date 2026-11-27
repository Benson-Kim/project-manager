import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The read-only licence check has one owner, refuseIfReadOnly. action() and fileRoute() call it, so a
 * server action built with action() and a route built with fileRoute() cannot skip it. This walks the
 * tree and fails when a server action is written some other way, or when anything else reads the
 * licence status to make the same decision.
 */
const SRC = "src";

const NOT_ACTION_BUILT: Record<string, string> = {
  "modules/auth/actions/index.ts":
    "sign-in, sign-out and the caller's own password change no project data",
  "components/ui/data-view/save-view-preference.ts": "a user's own view layout, not shared data",
  "modules/todo-items/actions/index.ts": "pollDueAlertsAction only reads the caller's due alerts",
};

const WRAPPERS = ["action", "boardMutation"];

/** Factories that return a set of actions, each member built with a wrapper, and the file that holds each. */
const FACTORIES: Record<string, string> = {
  customColumnActions: "lib/custom-columns/actions.ts",
};

const CHECK_OWNERS = new Set([
  "lib/licence/gate.ts",
  "lib/licence/write-check.ts",
  "lib/licence/messages.ts",
]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const isTest = (path: string) => /(^|[\\/])tests?[\\/]|\.test\.tsx?$/.test(path);

const files = walk(SRC)
  .filter((file) => !isTest(file))
  .map((file) => ({
    path: relative(SRC, file).replace(/\\/g, "/"),
    source: readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
  }));

const serverActionFiles = files.filter((f) => /^\s*["']use server["']/m.test(f.source));

const wrapped = new RegExp(`^\\s+(\\w+):\\s*(${WRAPPERS.join("|")})\\(`, "gm");

/** The members of each factory that are built with a wrapper. */
const builtMembers = new Map(
  Object.entries(FACTORIES).map(([factory, path]) => {
    const source = files.find((f) => f.path === path)?.source ?? "";
    return [factory, new Set([...source.matchAll(wrapped)].map((m) => m[1]))];
  }),
);

/** In one file, each const that holds a factory's actions, mapped to that factory's built members. */
function factoryResults(source: string): Map<string, Set<string>> {
  return new Map(
    [...source.matchAll(/^const\s+(\w+)\s*=\s*(\w+)\(/gm)].flatMap((m) => {
      const built = builtMembers.get(m[2]);
      return built ? [[m[1], built] as const] : [];
    }),
  );
}

function isWrapperBuilt(exported: string, results: Map<string, Set<string>>): boolean {
  if (new RegExp(`^const\\s+\\w+\\s*=\\s*(${WRAPPERS.join("|")})\\b`).test(exported)) return true;
  const member = /^const\s+\w+\s*=\s*(\w+)\.(\w+);$/.exec(exported);
  return !!member && !!results.get(member[1])?.has(member[2]);
}

describe("licence write guard", () => {
  it("finds the server action files and the two wrappers", () => {
    expect(serverActionFiles.length).toBeGreaterThan(5);
    expect(files.some((f) => f.path === "lib/action.ts")).toBe(true);
    expect(files.some((f) => f.path === "modules/file-storage/handlers/file-route.ts")).toBe(true);
  });

  it("has action() and fileRoute() call refuseIfReadOnly", () => {
    for (const path of ["lib/action.ts", "modules/file-storage/handlers/file-route.ts"]) {
      const file = files.find((f) => f.path === path);
      expect(file?.source, path).toMatch(/await refuseIfReadOnly\(\)/);
    }
  });

  it("builds every exported server action with action()", () => {
    const bad = serverActionFiles.flatMap((file) => {
      const results = factoryResults(file.source);
      return [...file.source.matchAll(/^export\s+(?!type\b|interface\b)(.*)$/gm)]
        .filter((m) => !isWrapperBuilt(m[1], results))
        .map((m) => `${file.path}: export ${m[1].slice(0, 60)}`)
        .filter((entry) => !(entry.split(":")[0] in NOT_ACTION_BUILT));
    });
    expect(bad).toEqual([]);
  });

  it("builds every member a factory returns with a wrapper", () => {
    for (const [factory, path] of Object.entries(FACTORIES)) {
      const source = files.find((f) => f.path === path)?.source ?? "";
      const body = source.slice(source.indexOf(`export function ${factory}`));
      const returned = body.slice(body.lastIndexOf("return {"));
      const indent = /\n(\s+)\w+:/.exec(returned)?.[1] ?? "";
      const members = [...returned.matchAll(new RegExp(`^${indent}(\\w+):`, "gm"))].map(
        (m) => m[1],
      );
      const built = builtMembers.get(factory) ?? new Set();
      expect(members.length, factory).toBeGreaterThan(0);
      expect(
        members.filter((m) => !built.has(m)),
        factory,
      ).toEqual([]);
    }
  });

  it("keeps every wrapper a thin call to action()", () => {
    const wrapper = files.find((f) => f.path === "modules/boards/actions/board-mutation.ts");
    expect(wrapper?.source).toMatch(/return action\(/);
  });

  it("keeps the allow-list to files that exist and still break the rule", () => {
    for (const path of Object.keys(NOT_ACTION_BUILT)) {
      expect(
        serverActionFiles.some((f) => f.path === path),
        path,
      ).toBe(true);
    }
  });

  it("lets every list, read and search action keep working while the licence is inactive", () => {
    const actions = serverActionFiles.flatMap((file) =>
      [
        ...file.source.matchAll(
          /^export const ((?:list|read|search)\w*Action) = action\(\{([\s\S]*?)^\}\);/gm,
        ),
      ].map((m) => ({ path: file.path, name: m[1], body: m[2] })),
    );
    expect(actions.length).toBeGreaterThan(0);
    const bad = actions
      .filter((a) => !/^\s+licence: "read",\r?$/m.test(a.body))
      .map((a) => `${a.path}: ${a.name}`);
    expect(bad).toEqual([]);
  });

  it("lets nothing but the owner read the licence status to decide on a write", () => {
    const bad = files
      .filter((f) => !CHECK_OWNERS.has(f.path))
      .filter((f) => /\b(allowsChanges|currentLicenceStatus)\b/.test(f.source))
      .map((f) => f.path);
    expect(bad).toEqual([]);
  });
});
