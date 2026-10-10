// One-command, repeatable build of the Windows desktop installer.
//
//   npm run electron:build        → dist-installer/ProjectManager-Setup-<version>.exe
//   npm run electron:build:dir    → dist-installer/win-unpacked (no installer)
//   node scripts/desktop/build.mjs --stage-only   (used by electron:dev)
//   add --skip-next to reuse an existing `next build` while iterating
//
// Steps: verify pinned SQL Server media → next build → assemble standalone
// (static + public, strip .env files) → bundle the Electron main process with
// esbuild into build/desktop-app → electron-builder → report.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { sha256, verifySqlMedia } from "./fetch-sql-express.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const stageOnly = args.has("--stage-only");
const dirOnly = args.has("--dir");
const skipNext = args.has("--skip-next");
const appDir = join(root, "build", "desktop-app");
const standalone = join(root, ".next", "standalone");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
// CI stamps each release with its own version (scripts/desktop/release.mjs plan).
const version = process.env.PM_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version "${version}" (expected x.y.z)`);

const step = (m) => console.log(`\n▶ ${m}`);
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
const git = (a) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
};

// 1. SQL Server media -------------------------------------------------------
if (!stageOnly) {
  step("Verifying pinned SQL Server Express media");
  if (!(await verifySqlMedia())) run("node scripts/desktop/fetch-sql-express.mjs");
  if (!(await verifySqlMedia())) throw new Error("SQL Server media missing or checksum mismatch");
}

// 2. Next.js standalone -----------------------------------------------------
if (!skipNext || !existsSync(join(standalone, "server.js"))) {
  step("Building the Next.js app (standalone)");
  rmSync(join(root, ".next"), { recursive: true, force: true });
  run("npm run build");
}
step("Assembling the standalone server");
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
// Next copies the developer's .env* into the standalone output — never ship them.
for (const f of readdirSync(standalone)) {
  if (f === ".env" || f.startsWith(".env.")) {
    rmSync(join(standalone, f), { force: true });
    console.log(`  removed ${f} from standalone output`);
  }
}
if (!existsSync(join(standalone, "node_modules", "argon2"))) {
  throw new Error("argon2 missing from the standalone output (needed for the admin account)");
}

// 3. Electron main process --------------------------------------------------
step("Bundling the Electron main process");
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
await esbuild({
  entryPoints: [join(root, "electron", "main.ts")],
  outfile: join(appDir, "main.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  logLevel: "warning",
});
for (const f of ["splash.html", "splash-logo.png"]) cpSync(join(root, "electron", f), join(appDir, f));
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty = git(["status", "--porcelain"]).length > 0;
writeFileSync(
  join(appDir, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      productName: "Project Manager",
      version,
      description: "Project Manager desktop edition",
      author: pkg.author,
      main: "main.js",
      private: true,
      buildInfo: { commit, dirty, builtAt: new Date().toISOString() },
    },
    null,
    2,
  ),
);
console.log(`  version ${version}, commit ${commit || "?"}${dirty ? " (uncommitted changes!)" : ""}`);

if (stageOnly) process.exit(0);

// 4. Installer --------------------------------------------------------------
step(dirOnly ? "Packaging (unpacked directory)" : "Packaging the installer");
run(
  `npx electron-builder --win --x64 --projectDir "${appDir}" --config "${join(root, "electron-builder.config.cjs")}" ` +
    `--publish never${dirOnly ? " --dir" : ""}`,
);

// 5. Report -----------------------------------------------------------------
step("Checks");
const unpacked = join(root, "dist-installer", "win-unpacked", "resources");
const countSql = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true }).filter((f) => String(f).toLowerCase().endsWith(".sql")).length
    : 0;
const problems = [];
for (const rel of [
  "standalone/server.js",
  "standalone/.next/server",
  "standalone/.next/static",
  "standalone/node_modules/next",
  "standalone/node_modules/argon2",
  "standalone/public",
  "setup/provision.ps1",
  "setup/remove-all-users-install.ps1",
  "sql-express/SQLEXPR_x64_ENU.exe",
  "icon.ico",
]) {
  if (!existsSync(join(unpacked, rel))) problems.push(`missing ${rel}`);
}
for (const sub of ["migrations", "procs", "seed"]) {
  const want = countSql(join(root, "db", sub));
  const got = countSql(join(unpacked, "db", sub));
  if (want !== got) problems.push(`db/${sub}: ${got} of ${want} .sql files packaged`);
}
const links = readdirSync(join(unpacked, "standalone"), { recursive: true })
  .map(String)
  .filter((rel) => lstatSync(join(unpacked, "standalone", rel)).isSymbolicLink());
if (links.length) problems.push(`symlinks/junctions in package (not portable): ${links.join(", ")}`);
const leakedEnv = readdirSync(join(unpacked, "standalone")).filter((f) => f.startsWith(".env"));
if (leakedEnv.length) problems.push(`.env files in package: ${leakedEnv.join(", ")}`);
if (existsSync(join(unpacked, "app.asar.unpacked"))) problems.push("app.asar.unpacked exists — node_modules leaked into the app");
if ((await sha256(join(unpacked, "sql-express", "SQLEXPR_x64_ENU.exe"))) !== JSON.parse(readFileSync(join(root, "scripts", "desktop", "sql-express.pin.json"), "utf-8")).sha256) {
  problems.push("packaged SQL Server media differs from the pinned file (was it re-signed?)");
}
const hasFeed = process.env.PM_UPDATE_FEED !== "off";
// electron-builder writes app-update.yml (the feed address) only for installer builds, not --dir.
if (hasFeed && !dirOnly && !existsSync(join(unpacked, "app-update.yml"))) problems.push("resources/app-update.yml missing (update feed)");
if (problems.length) throw new Error(`Package check failed:\n  - ${problems.join("\n  - ")}`);
console.log(`  app.asar ${(statSync(join(unpacked, "app.asar")).size / 1024).toFixed(0)} KB; server, db scripts, SQL media, provisioning present; no .env files`);
if (!dirOnly) {
  const exe = join(root, "dist-installer", `ProjectManager-Setup-${version}.exe`);
  console.log(`\n✔ ${exe}`);
  const hash = await sha256(exe);
  // Ship this next to the installer so a copy (USB, download) can be checked on
  // the target PC: Get-FileHash <exe> must print the same value.
  writeFileSync(`${exe}.sha256`, `${hash} *ProjectManager-Setup-${version}.exe\n`);
  console.log(`  size   ${(statSync(exe).size / 1048576).toFixed(1)} MB`);
  console.log(`  sha256 ${hash}  (also in ${basename(exe)}.sha256)`);
  if (hasFeed) {
    // What the release workflow publishes: latest.yml tells installed apps about
    // this version, the .blockmap lets them download only the changed blocks.
    const feed = join(root, "dist-installer", "latest.yml");
    if (!existsSync(feed) || !readFileSync(feed, "utf-8").includes(`version: ${version}`)) {
      throw new Error("dist-installer/latest.yml is missing or describes another version");
    }
    if (!existsSync(`${exe}.blockmap`)) throw new Error(`${basename(exe)}.blockmap is missing`);
    console.log(`  update feed files: latest.yml, ${basename(exe)}.blockmap`);
  }
}
