import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Route Handlers sit outside action() and the proxy matcher, so nothing else applies the
 * same-origin, session and licence gates to them. Every handler under /api/files must be built
 * with fileRoute, and a write handler anywhere else under /api must be on the allow-list below.
 */
const API = join("src", "app", "api");
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const OPEN_WRITES: Record<string, string> = {
  "auth/[...nextauth]": "sign-in and sign-out change only the caller's own session",
  "internal/todo-alerts/dispatch":
    "scheduler-only bearer token; records push deliveries, not project data",
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /^route\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function exportedMethods(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s+(?:(?:const|let|var)\s*)?\{([^}]*)\}/gm)) {
    for (const item of m[1].split(",")) {
      const name = item
        .split(/\s+as\s+|:/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  return [...names].filter((name) => METHODS.has(name)).sort();
}

const routes = walk(API).map((file) => {
  const path = relative(API, file).replace(/\\/g, "/");
  const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return {
    path,
    dir: path.split("/").slice(0, -1).join("/"),
    source,
    methods: exportedMethods(source),
  };
});

const isFilesRoute = (dir: string) => dir === "files" || dir.startsWith("files/");

describe("API route handler guardrails", () => {
  it("reads method exports in every form the routes use", () => {
    expect(routes.find((r) => r.path === "files/route.ts")?.methods).toEqual(["POST"]);
    expect(routes.find((r) => r.dir === "auth/[...nextauth]")?.methods).toEqual(["GET", "POST"]);
  });

  it("builds every method handler under /api/files with fileRoute", () => {
    const files = routes.filter((r) => isFilesRoute(r.dir));
    expect(files.length).toBeGreaterThan(0);
    const bad = files.flatMap((r) =>
      r.methods
        .filter((m) => !new RegExp(`^export const ${m}\\s*=\\s*fileRoute\\b`, "m").test(r.source))
        .map((m) => `${r.path} ${m}`),
    );
    expect(bad).toEqual([]);
  });

  it("allows a write handler outside /api/files only on the allow-list", () => {
    const bad = routes
      .filter((r) => !isFilesRoute(r.dir) && !(r.dir in OPEN_WRITES))
      .flatMap((r) => r.methods.filter((m) => WRITES.has(m)).map((m) => `${r.path} ${m}`));
    expect(bad).toEqual([]);
  });

  it("keeps the allow-list to routes that exist and still write", () => {
    for (const dir of Object.keys(OPEN_WRITES)) {
      const route = routes.find((r) => r.dir === dir);
      expect(
        route?.methods.some((m) => WRITES.has(m)),
        dir,
      ).toBe(true);
    }
  });
});
