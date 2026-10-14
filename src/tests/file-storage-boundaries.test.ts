import { readFileSync } from "node:fs";
import { normalize, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { clientModules, pathTo, sourceFiles, specifiers } from "./import-graph";

/**
 * Guardrails for ADR-0026 (file storage):
 *  - the storage engine (src/lib/files), the attachment repository and the
 *    route-handler logic are server-only: no "use client" module may reach
 *    them, nor any Node built-in (node:fs …), through its imports;
 *  - only the two /api/files route files use the handlers;
 *  - every method a route file under src/app/api/files exports is built with
 *    fileRoute. Those routes are outside the proxy, so a plain function there
 *    would serve files with no session check.
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

const METHODS = "GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS";
const FILE_ROUTE_IMPORT =
  /import\s*\{[^}]*\bfileRoute\b[^}]*\}\s*from\s*["']@\/modules\/file-storage\/handlers\/file-route["']/;

/** Why a route file's source is not gated by fileRoute, or [] when it is. */
function ungatedExports(source: string): string[] {
  const problems: string[] = [];
  for (const m of source.matchAll(
    new RegExp(`export\\s+(?:async\\s+)?function\\s+(${METHODS})\\b`, "g"),
  )) {
    problems.push(`${m[1]} is a plain function`);
  }
  for (const m of source.matchAll(
    new RegExp(`export\\s+(?:const|let|var)\\s+(${METHODS})\\s*=(?!\\s*fileRoute\\s*[<(])`, "g"),
  )) {
    problems.push(`${m[1]} is not fileRoute(…)`);
  }
  if (new RegExp(`export\\s*\\{[^}]*\\b(?:${METHODS})\\b[^}]*\\}`).test(source)) {
    problems.push("a method is re-exported");
  }
  if (/export\s*\*/.test(source)) problems.push("export * may re-export a method");
  if (
    new RegExp(`export\\s+(?:const|let|var)\\s+(?:${METHODS})\\b`).test(source) &&
    !FILE_ROUTE_IMPORT.test(source)
  ) {
    problems.push("fileRoute is not imported from @/modules/file-storage/handlers/file-route");
  }
  return problems;
}

describe("/api/files route files are gated by fileRoute (ADR-0026 §3)", () => {
  const routes = sourceFiles.filter(
    (f) => f.startsWith(normalize("src/app/api/files/")) && /route\.tsx?$/.test(f),
  );

  it("finds the route files (the walker works)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });

  it.each(routes)("%s exports only fileRoute handlers", (file) => {
    expect(ungatedExports(readFileSync(file, "utf8"))).toEqual([]);
  });

  it.each([
    ["a plain function", "export async function GET(request: Request) {}"],
    ["an arrow function", "export const POST = async (request: Request) => new Response();"],
    ["a re-export", 'export { GET } from "./elsewhere";'],
    ["a wildcard re-export", 'export * from "./elsewhere";'],
    ["a local fileRoute", "const fileRoute = (h) => h;\nexport const GET = fileRoute(h);"],
  ])("the check catches %s", (_l, source) => {
    expect(ungatedExports(source)).not.toEqual([]);
  });
});
