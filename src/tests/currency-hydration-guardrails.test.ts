import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: Intl's currency list comes from the runtime's own ICU build, and the builds disagree —
 * Node 22 lists 162 currencies, Chrome 139 lists 159, and the two name ZWL differently. A component
 * that calls listCurrencies() in render therefore emits server HTML the browser cannot hydrate, and
 * React answers a mismatch by discarding the whole form and rendering it again, losing whatever had
 * already been chosen in it (ADR-0051). The list may only be read through useSyncExternalStore,
 * whose server snapshot is empty, so the server and the hydrating render agree on the markup.
 */
const ROOTS = ["src/modules", "src/app", "src/components"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("the currency list never reaches a server render", () => {
  it("is read only through useSyncExternalStore, which has an empty server snapshot", () => {
    for (const path of ROOTS.flatMap(sources)) {
      const body = readFileSync(path, "utf8").replace(/import[\s\S]*?from\s+"[^"]*";/g, "");
      for (const line of body.split("\n").filter((l) => l.includes("listCurrencies"))) {
        expect(line, `${path} must not call listCurrencies() in render`).toMatch(
          /useSyncExternalStore\([^)]*listCurrencies/,
        );
      }
    }
  });
});
