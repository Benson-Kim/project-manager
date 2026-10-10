// Bundle and run electron/tests/db-integration.ts against a real SQL Server.
// See that file for the required PM_TEST_* environment variables.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outfile = join(root, "build", "desktop-test", "electron", "tests", "db-integration.js");
await build({
  entryPoints: [join(root, "electron", "tests", "db-integration.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["argon2"],
  logLevel: "warning",
});
const r = spawnSync(process.execPath, [outfile], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
