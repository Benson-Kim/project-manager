import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrails for ADR-0025 (rich text):
 *  - sanitize-html is server-only: no "use client" module may reach it
 *    through its imports (a "use server" module is a boundary: the client
 *    bundles a reference to it, not its imports);
 *  - the shared schema stays isomorphic (it never imports the sanitiser);
 *  - HTML is injected in exactly two places: the theme script and
 *    RichTextView, which sanitises first.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const files = walk("src").map((f) => normalize(f));
const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

function directive(file: string): "client" | "server" | null {
  const head = (source.get(file) ?? "")
    .replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, "")
    .trimStart();
  if (/^["']use client["']/.test(head)) return "client";
  if (/^["']use server["']/.test(head)) return "server";
  return null;
}

/** Value imports, re-exports and dynamic imports (type-only imports are erased). */
function specifiers(file: string): string[] {
  const text = source.get(file) ?? "";
  const found: string[] = [];
  for (const m of text.matchAll(
    /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm,
  )) {
    found.push(m[1]);
  }
  for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push(m[1]);
  return found;
}

function resolve(from: string, spec: string): string | null {
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

/** The chain of modules from `start` to sanitize-html, or null when unreachable. */
function pathToSanitizer(start: string): string[] | null {
  const seen = new Set<string>();
  const queue: Array<{ file: string; trail: string[] }> = [{ file: start, trail: [start] }];
  while (queue.length > 0) {
    const { file, trail } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      if (spec === "sanitize-html") return [...trail, spec];
      const next = resolve(file, spec);
      if (next && directive(next) !== "server") queue.push({ file: next, trail: [...trail, next] });
    }
  }
  return null;
}

const clientModules = files.filter((f) => directive(f) === "client");

describe("rich-text boundaries (ADR-0025)", () => {
  it("finds client modules, including the editor", () => {
    expect(clientModules).toContain(normalize("src/components/ui/rich-text/rich-text-editor.tsx"));
  });

  it("finds the sanitiser through the import graph (the walker works)", () => {
    expect(
      pathToSanitizer(normalize("src/components/ui/rich-text/rich-text-view.tsx")),
    ).not.toBeNull();
    expect(pathToSanitizer(normalize("src/lib/action.ts"))).not.toBeNull();
  });

  it.each(clientModules)("%s never reaches sanitize-html", (file) => {
    const path = pathToSanitizer(file);
    expect(path, path ? path.map((p) => relative(".", p)).join(" → ") : "").toBeNull();
  });

  it("imports sanitize-html only in the sanitiser module", () => {
    const importers = files.filter((f) => specifiers(f).includes("sanitize-html"));
    expect(importers).toEqual([normalize("src/lib/rich-text/sanitize.ts")]);
  });

  it("keeps the shared schema free of the sanitiser", () => {
    expect(pathToSanitizer(normalize("src/lib/rich-text/schema.ts"))).toBeNull();
  });

  it("injects HTML only in the theme script and RichTextView", () => {
    const injectors = files.filter((f) => /dangerouslySetInnerHTML/.test(source.get(f) ?? ""));
    expect(injectors.sort()).toEqual(
      [
        normalize("src/app/layout.tsx"),
        normalize("src/components/ui/rich-text/rich-text-view.tsx"),
      ].sort(),
    );
  });
});
