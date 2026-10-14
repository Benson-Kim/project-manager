import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * A static import graph of src/ for boundary guardrails (what a "use client"
 * module can reach). A "use server" module is a boundary: the client bundles a
 * reference to it, not its imports. Type-only imports are erased, so they are
 * not edges. Paths are normalised relative paths ("src/lib/x.ts").
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

export const sourceFiles = walk("src").map((f) => normalize(f));
const source = new Map(sourceFiles.map((f) => [f, readFileSync(f, "utf8")]));

export function directive(file: string): "client" | "server" | null {
  const head = (source.get(file) ?? "")
    .replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, "")
    .trimStart();
  if (/^["']use client["']/.test(head)) return "client";
  if (/^["']use server["']/.test(head)) return "server";
  return null;
}

/** Value imports, re-exports and dynamic imports of a file. */
export function specifiers(file: string): string[] {
  const text = source.get(file) ?? "";
  const found: string[] = [];
  for (const m of text.matchAll(
    /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm,
  )) {
    found.push(m[1]!);
  }
  for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push(m[1]!);
  return found;
}

/** A specifier resolved to a file in src/, or null for packages and builtins. */
export function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join("src", spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(from), spec)
      : null;
  if (base === null) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    const file = normalize(candidate);
    if (source.has(file)) return file;
  }
  return null;
}

/**
 * The chain of modules from `start` to the first import `isForbidden` accepts
 * (given the raw specifier and its resolved file, if any), or null.
 */
export function pathTo(
  start: string,
  isForbidden: (spec: string, resolved: string | null) => boolean,
): string[] | null {
  const seen = new Set<string>();
  const queue: Array<{ file: string; trail: string[] }> = [{ file: start, trail: [start] }];
  while (queue.length > 0) {
    const { file, trail } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      const next = resolveImport(file, spec);
      if (isForbidden(spec, next)) return [...trail, next ?? spec];
      if (next && directive(next) !== "server") queue.push({ file: next, trail: [...trail, next] });
    }
  }
  return null;
}

export const clientModules = sourceFiles.filter((f) => directive(f) === "client");
