import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: a page or layout without "use client" renders on the server, and Next.js refuses to
 * render one that hands a function to an event prop ("Event handlers cannot be passed to Client
 * Component props"). Such a page needs its button moved into a client component.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /^(page|layout|template|not-found|loading)\.tsx$/.test(name) ? [p] : [];
  });
}

const serverPages = walk(join("src", "app")).filter(
  (path) => !/^\s*["']use client["']/.test(readFileSync(path, "utf8")),
);

describe("server pages pass no event handlers", () => {
  it("finds the server pages", () => {
    expect(serverPages.length).toBeGreaterThan(10);
  });

  it.each(serverPages)("%s", (path) => {
    expect(readFileSync(path, "utf8")).not.toMatch(/\son[A-Z]\w*=\{/);
  });
});
