import { normalize, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules, pathTo, sourceFiles, specifiers } from "./import-graph";

/**
 * Guardrails for ADR-0026 (file storage):
 *  - the storage engine (src/lib/files), the attachment repository and the
 *    route-handler logic are server-only: no "use client" module may reach
 *    them, nor any Node built-in (node:fs …), through its imports;
 *  - only the two /api/files route files use the handlers.
 */
const SERVER_ONLY = [
  normalize("src/lib/files/"),
  normalize("src/modules/file-storage/repository/"),
  normalize("src/modules/file-storage/handlers/"),
];

const forbidden = (spec: string, resolved: string | null) =>
  spec.startsWith("node:") ||
  (resolved !== null && SERVER_ONLY.some((dir) => resolved.startsWith(dir)));

const show = (trail: string[] | null) => (trail ? trail.join(" → ") : "");

describe("file-storage boundaries (ADR-0026)", () => {
  it("finds the attachments component among the client modules", () => {
    expect(clientModules).toContain(normalize("src/components/ui/attachments/attachments.tsx"));
  });

  it("the walker finds the engine from the route files (it works)", () => {
    expect(pathTo(normalize("src/app/api/files/route.ts"), forbidden)).not.toBeNull();
  });

  it.each(clientModules)("%s never reaches server-only file code", (file) => {
    const trail = pathTo(file, forbidden);
    expect(trail, show(trail)).toBeNull();
  });

  it("only the /api/files routes import the handlers", () => {
    const importers = sourceFiles.filter(
      (f) =>
        !f.startsWith(normalize("src/modules/file-storage/handlers/")) &&
        specifiers(f).some((s) => s.startsWith("@/modules/file-storage/handlers/")),
    );
    expect(importers.map((f) => f.split(sep).join("/")).sort()).toEqual([
      "src/app/api/files/[id]/route.ts",
      "src/app/api/files/route.ts",
    ]);
  });
});
