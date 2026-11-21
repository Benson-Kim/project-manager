// One-command, repeatable build of the Windows desktop installer.
//
//   npm run electron:build        → dist-installer/Modulus-Setup-<version>.exe
//   npm run electron:build:dir    → dist-installer/win-unpacked (no installer)
//   node scripts/desktop/build.mjs --stage-only   (used by electron:dev)
//   node scripts/desktop/build.mjs --package-only (CI: packages the staged app, the only step given the signing secrets)
//   add --skip-next to reuse an existing `next build` while iterating
//
// Steps: verify pinned SQL Server media → next build → assemble standalone
// (static + public, strip .env files) → bundle the Electron main process with
// esbuild into build/desktop-app → electron-builder → report.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { sha256, verifySqlMedia } from "./fetch-sql-express.mjs";
import { licensingConfig } from "./licensing.cjs";
import { assertStandaloneEntries } from "./standalone-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const stageOnly = args.has("--stage-only");
const dirOnly = args.has("--dir");
const skipNext = args.has("--skip-next");
const packageOnly = args.has("--package-only");
const full = args.has("--full");
if (full) process.env.MODULUS_FULL_INSTALLER = "1";
else delete process.env.MODULUS_FULL_INSTALLER;
if (stageOnly && packageOnly) throw new Error("Use --stage-only or --package-only, not both");
const appDir = join(root, "build", "desktop-app");
const standalone = join(root, ".next", "standalone");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
// CI stamps each release with its own version (scripts/desktop/release.mjs plan).
const version = process.env.PM_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version "${version}" (expected x.y.z)`);
const licensing = licensingConfig(process.env);

const step = (m) => console.log(`\n▶ ${m}`);
const SIGNING_SECRETS = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"];
const withoutSigningSecrets = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !SIGNING_SECRETS.includes(k)));
const run = (cmd, { signing = false } = {}) =>
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...(signing ? process.env : withoutSigningSecrets(process.env)), NEXT_TELEMETRY_DISABLED: "1" } });
const git = (a) => {
  try {
    return execFileSync("git", a, { cwd: root, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
};

// 1. SQL Server media -------------------------------------------------------
if (full && !stageOnly) {
  step("Verifying pinned SQL Server Express media");
  if (!(await verifySqlMedia())) run("node scripts/desktop/fetch-sql-express.mjs");
  if (!(await verifySqlMedia())) throw new Error("SQL Server media missing or checksum mismatch");
}

if (packageOnly) {
  const staged = join(appDir, "package.json");
  if (!existsSync(join(appDir, "main.js")) || !existsSync(staged) || !existsSync(join(standalone, "server.js"))) {
    throw new Error("No staged app in build/desktop-app: run build.mjs --stage-only first");
  }
  const stagedVersion = JSON.parse(readFileSync(staged, "utf-8")).version;
  if (stagedVersion !== version) throw new Error(`The staged app is ${stagedVersion}, not ${version}: stage it again with the same PM_VERSION`);
}

if (!packageOnly) {
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
  // When copying a traced file fails, `next build` still exits 0 with a route
  // missing its chunks. Check that, and that nothing else was traced in.
  assertStandaloneEntries(standalone);
  const serverDir = join(root, ".next", "server");
  const missing = new Set();
  for (const f of readdirSync(serverDir, { recursive: true })) {
    if (!String(f).endsWith(".nft.json")) continue;
    const trace = join(serverDir, String(f));
    for (const file of JSON.parse(readFileSync(trace, "utf-8")).files) {
      const inRepo = relative(root, resolve(dirname(trace), file));
      if (!inRepo.startsWith("..") && !existsSync(join(standalone, inRepo))) missing.add(inRepo);
    }
  }
  if (missing.size) {
    throw new Error(`Traced files missing from the standalone output:\n  ${[...missing].slice(0, 20).join("\n  ")}`);
  }

  // 3. Electron main process --------------------------------------------------
  step("Bundling the Electron main process");
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
  await esbuild({
    entryPoints: {
      main: join(root, "electron", "main.ts"),
      "grammar-worker": join(root, "electron", "grammar-worker.ts"),
      preload: join(root, "electron", "preload.ts"),
      "licence-preload": join(root, "electron", "licence", "licence-preload.ts"),
    },
    outdir: appDir,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
    define: {
      __LICENCE_PUBLIC_KEYS__: JSON.stringify(licensing.publicKeys),
      __LICENCE_SERVICE_URL__: JSON.stringify(licensing.serviceUrl),
    },
    sourcemap: false,
    logLevel: "warning",
  });
  for (const f of ["splash.html", "splash-logo.png"]) cpSync(join(root, "electron", f), join(appDir, f));
  cpSync(join(root, "electron", "licence", "licence.html"), join(appDir, "licence.html"));
  const grammarWasm = "harper_wasm_slim_bg.wasm";
  cpSync(join(root, "node_modules", "harper.js", "dist", grammarWasm), join(appDir, grammarWasm));
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const dirty = git(["status", "--porcelain"]).length > 0;
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        productName: "Modulus",
        version,
        description: "Modulus desktop edition",
        author: pkg.author,
        main: "main.js",
        private: true,
        ...(licensing.enforce ? { licensing: "enforce" } : {}),
        buildInfo: { commit, dirty, builtAt: new Date().toISOString() },
      },
      null,
      2,
    ),
  );
  console.log(`  version ${version}, commit ${commit || "?"}${dirty ? " (uncommitted changes!)" : ""}`);
  console.log(`  licensing ${licensing.enforce ? "enforced" : "off"}, ${Object.keys(licensing.publicKeys).length} public key(s)`);
}

if (stageOnly) process.exit(0);

// 4. Installer --------------------------------------------------------------
step(dirOnly ? "Packaging (unpacked directory)" : "Packaging the installer");
run(
  `npx electron-builder --win --x64 --projectDir "${appDir}" --config "${join(root, "electron-builder.config.cjs")}" ` +
    `--publish never${dirOnly ? " --dir" : ""}`,
  { signing: true },
);

// 5. Report -----------------------------------------------------------------
step("Checks");
const out = join(root, "dist-installer", ...(full ? ["full"] : []));
const unpacked = join(out, "win-unpacked", "resources");
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
  "icon.ico",
]) {
  if (!existsSync(join(unpacked, rel))) problems.push(`missing ${rel}`);
}
const media = join(unpacked, "sql-express", "SQLEXPR_x64_ENU.exe");
if (full !== existsSync(media)) problems.push(full ? "missing sql-express/SQLEXPR_x64_ENU.exe" : "the update installer carries the SQL Server media");
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
if (full && existsSync(media) && (await sha256(media)) !== JSON.parse(readFileSync(join(root, "scripts", "desktop", "sql-express.pin.json"), "utf-8")).sha256) {
  problems.push("packaged SQL Server media differs from the pinned file (was it re-signed?)");
}
const hasFeed = process.env.PM_UPDATE_FEED !== "off";
// electron-builder writes app-update.yml (the feed address) only for installer builds, not --dir.
if (hasFeed && !dirOnly && !existsSync(join(unpacked, "app-update.yml"))) problems.push("resources/app-update.yml missing (update feed)");
if (problems.length) throw new Error(`Package check failed:\n  - ${problems.join("\n  - ")}`);
console.log(`  app.asar ${(statSync(join(unpacked, "app.asar")).size / 1024).toFixed(0)} KB; server, db scripts, ${full ? "SQL media, " : ""}provisioning present; no .env files`);
if (!dirOnly) {
  const exe = join(out, `Modulus-Setup-${full ? "Full-" : ""}${version}.exe`);
  console.log(`\n✔ ${exe}`);
  const hash = await sha256(exe);
  // Ship this next to the installer so a copy (USB, download) can be checked on
  // the target PC: Get-FileHash <exe> must print the same value.
  writeFileSync(`${exe}.sha256`, `${hash} *${basename(exe)}\n`);
  console.log(`  size   ${(statSync(exe).size / 1048576).toFixed(1)} MB`);
  console.log(`  sha256 ${hash}  (also in ${basename(exe)}.sha256)`);
  if (hasFeed && !full) {
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
