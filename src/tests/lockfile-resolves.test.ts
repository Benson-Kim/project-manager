import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: package-lock.json must resolve completely, on every platform.
 * `npm ci` on Linux refuses a lockfile that names a dependency it holds no
 * entry for ("Missing: @emnapi/runtime@1.11.3 from lock file"). npm 11.6 on
 * Windows writes exactly that when it prunes the dependencies of optional
 * packages it did not install locally (the wasm32 variants of sharp and
 * tailwind's oxide), and a local `npm ci --dry-run` cannot see it because
 * those packages are skipped here too. This walks every entry's dependencies
 * up the node_modules chain the way npm does.
 */
interface LockEntry {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

function resolves(packages: Record<string, LockEntry>, from: string, name: string): boolean {
  let base = from;
  for (;;) {
    if (packages[`${base ? `${base}/` : ""}node_modules/${name}`]) return true;
    if (!base) return false;
    const i = base.lastIndexOf("/node_modules/");
    base = i >= 0 ? base.slice(0, i) : "";
  }
}

describe("package-lock.json", () => {
  it("holds an entry for every dependency any entry names", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, LockEntry>;
    };
    const missing: string[] = [];
    for (const [path, entry] of Object.entries(lock.packages)) {
      const peerMeta = entry.peerDependenciesMeta ?? {};
      const names = new Set([
        ...Object.keys(entry.dependencies ?? {}),
        ...Object.keys(entry.optionalDependencies ?? {}),
        ...Object.keys(entry.peerDependencies ?? {}).filter((n) => !peerMeta[n]?.optional),
      ]);
      for (const name of names) {
        if (!resolves(lock.packages, path, name))
          missing.push(`${name} needed by ${path || "(root)"}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
