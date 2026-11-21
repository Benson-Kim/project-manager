// The standalone server ships only these. Output tracing follows runtime paths: a
// regression could ship the build machine's own files (uploads, temp folders), or the
// whole project when server code reads a path `next build` cannot resolve.
//
//   node scripts/desktop/standalone-check.mjs   (CI, after `next build`)
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHIPPED = new Set([".next", "node_modules", "public", "package.json", "server.js"]);

export function assertStandaloneEntries(standalone) {
  const extra = readdirSync(standalone).filter((f) => !SHIPPED.has(f));
  if (extra.length) {
    throw new Error(`Unexpected entries in the standalone output (build-machine files?): ${extra.join(", ")}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assertStandaloneEntries(join(root, ".next", "standalone"));
  console.log("standalone output holds only the server");
}
