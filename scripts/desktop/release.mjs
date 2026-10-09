// Desktop release helper: .github/workflows/desktop-release.yml runs the CI
// commands; people run the force command. Needs git and the GitHub CLI (gh).
//
//   node scripts/desktop/release.mjs plan       (CI) version, previous tag, skip?, required?
//   node scripts/desktop/release.mjs finalize   (CI) update policy into latest.yml + release notes
//   node scripts/desktop/release.mjs prune      (CI) keep the newest KEEP_RELEASES releases
//   npm run desktop:force-update                 make the latest release required for every PC
//   npm run desktop:force-update -- 1.0.7        PCs below 1.0.7 must update
//   npm run desktop:force-update -- --off        updates are optional again
//
// How "required" works: latest.yml (the file installed apps read) gets a
// `minimumVersion`. An app older than that installs the update after a short
// warning; otherwise updates are optional. Each new release carries the
// previous minimumVersion forward, so a PC that skipped a required version is
// still made to update.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist-installer");

export const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** Paths whose changes reach the installed app. Docs/CI/test-only merges are not released. */
export const APP_PATHS = [
  "src",
  "public",
  "db",
  "electron",
  "build-resources",
  "scripts/desktop",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "electron-builder.config.cjs",
  ":(exclude)**/tests/**",
  ":(exclude)**/*.test.ts",
  ":(exclude)**/*.md",
];

const RELEASE_TAGS = /\s*\[(e2e|skip ci|ci skip|verify|force[- ]update)\]/gi;

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`Not a version: ${v}`);
  return m.slice(1).map(Number);
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** Next release: one patch above the latest release, or package.json's version when that is higher. */
export function nextVersion(pkgVersion, latestTag) {
  if (!latestTag || !TAG_RE.test(latestTag)) return pkgVersion;
  const [M, m, p] = parseVersion(latestTag);
  const bumped = `${M}.${m}.${p + 1}`;
  return compareVersions(pkgVersion, bumped) > 0 ? pkgVersion : bumped;
}

/** "[force-update]" in a commit message or PR title makes the release required. */
export function isForced(text) {
  return /\[force[- ]update\]/i.test(text ?? "");
}

export function nextMinimum({ force, version, previousMinimum }) {
  return force ? version : previousMinimum || null;
}

export function minimumFromYml(yml) {
  const m = /^minimumVersion:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(yml ?? "");
  return m ? m[1] : null;
}

/**
 * latest.yml with our policy keys set: minimumVersion (null removes it) and
 * releaseNotes (undefined keeps the existing notes).
 */
export function withPolicy(yml, { minimumVersion, notes }) {
  const replaceNotes = notes !== undefined;
  const kept = [];
  let skippingBlock = false;
  for (const line of yml.replace(/\r\n/g, "\n").split("\n")) {
    if (skippingBlock && /^\s/.test(line)) continue;
    skippingBlock = false;
    if (/^minimumVersion:/.test(line)) continue;
    if (replaceNotes && /^releaseNotes:/.test(line)) {
      skippingBlock = true;
      continue;
    }
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  if (minimumVersion) kept.push(`minimumVersion: '${minimumVersion}'`);
  if (replaceNotes && notes) kept.push("releaseNotes: |-", ...notes.split("\n").map((l) => `  ${l}`));
  return `${kept.join("\n")}\n`;
}

/** One line per merged PR / direct commit since the previous release (first-parent history). */
export function notesFromLog(entries, max = 25) {
  const lines = [];
  for (const { subject, body } of entries) {
    const pr = /^Merge pull request #(\d+) from \S+/.exec(subject);
    let title = subject;
    if (pr) title = `${(body ?? "").split("\n").find((l) => l.trim()) ?? subject} (#${pr[1]})`;
    else if (/^Merge (branch|remote-tracking branch) /.test(subject)) continue;
    title = title.replace(RELEASE_TAGS, "").trim();
    if (title) lines.push(`- ${title}`);
  }
  if (lines.length > max) return [...lines.slice(0, max), `- …and ${lines.length - max} more`].join("\n");
  return lines.join("\n");
}

/** Release tags beyond the newest `keep`, oldest last. Non-version tags are never touched. */
export function releasesToPrune(tags, keep) {
  return tags
    .filter((t) => TAG_RE.test(t))
    .sort((a, b) => compareVersions(b, a))
    .slice(keep);
}

// ---------------------------------------------------------------------------
// Commands (git + gh)

function sh(cmd, args, { allowFail = false, input } = {}) {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf-8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`${cmd} ${args.join(" ")} failed: ${err.stderr || err.message}`);
  }
}

const gh = (args, opts) => sh("gh", args, opts);
const git = (args, opts) => sh("git", args, opts);

function output(values) {
  for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
  }
}

function latestReleaseTag() {
  return gh(["release", "view", "--json", "tagName", "-q", ".tagName"], { allowFail: true }) || "";
}

function releaseYml(tag) {
  return gh(["release", "download", tag, "-p", "latest.yml", "-O", "-"], { allowFail: true });
}

function plan() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  const previous = latestReleaseTag();
  const version = nextVersion(pkg.version, previous);
  const force = process.env.FORCE_UPDATE === "true" || isForced(git(["log", "-1", "--format=%B"]));
  let skip = false;
  if (previous && !force) {
    // exit 0 = no differences in app paths since the last release
    skip = sh("git", ["diff", "--quiet", previous, "HEAD", "--", ...APP_PATHS], { allowFail: true }) !== null;
  }
  output({ version, previous, force: String(force), skip: String(skip) });
  if (skip) console.log(`Nothing that reaches the app changed since ${previous}: no new desktop release.`);
}

function finalize() {
  const version = process.env.VERSION;
  const previous = process.env.PREVIOUS || "";
  const force = process.env.FORCE === "true";
  if (!version) throw new Error("VERSION is required");
  const ymlPath = join(dist, "latest.yml");
  const yml = readFileSync(ymlPath, "utf-8");
  if (!yml.includes(`version: ${version}`)) throw new Error(`latest.yml is not for ${version}`);

  const previousMinimum = previous ? minimumFromYml(releaseYml(previous)) : null;
  const minimumVersion = nextMinimum({ force, version, previousMinimum });
  const range = previous ? [`${previous}..HEAD`] : ["-1"];
  const log = git(["log", "--first-parent", "--format=%s%x1f%b%x1e", ...range]);
  const entries = log
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [subject, body] = r.split("\x1f");
      return { subject: subject.trim(), body: body ?? "" };
    });
  const notes = notesFromLog(entries);

  writeFileSync(ymlPath, withPolicy(yml, { minimumVersion, notes }));
  const header = force
    ? "**Required update.** Installed apps warn the user, then restart to install it.\n\n"
    : minimumVersion
      ? `Installed apps older than ${minimumVersion} must update; newer ones may choose when.\n\n`
      : "Installed apps download this in the background and offer to install it; nobody is forced.\n\n";
  const body =
    header +
    (notes || "- Maintenance release") +
    "\n\n---\nNew PC: download `ProjectManager-Setup-" +
    version +
    ".exe` (check it with the `.sha256` file) and run it. Installed apps update themselves.\n";
  writeFileSync(join(dist, "release-notes.md"), body);
  console.log(body);
  output({ minimum: minimumVersion ?? "" });
}

function prune() {
  const keep = Number(process.env.KEEP_RELEASES || 10);
  const tags = (gh(["release", "list", "--limit", "200", "--json", "tagName", "-q", ".[].tagName"]) || "")
    .split("\n")
    .filter(Boolean);
  for (const tag of releasesToPrune(tags, keep)) {
    console.log(`Deleting old release ${tag}`);
    gh(["release", "delete", tag, "--yes", "--cleanup-tag"]);
  }
}

function force(args) {
  const off = args.includes("--off");
  const wanted = args.find((a) => !a.startsWith("--"));
  const latest = latestReleaseTag();
  if (!latest) throw new Error("No desktop release has been published yet.");
  const latestVersion = latest.replace(/^v/, "");
  const minimumVersion = off ? null : (wanted ?? latestVersion).replace(/^v/, "");
  if (minimumVersion && compareVersions(minimumVersion, latestVersion) > 0) {
    throw new Error(`${minimumVersion} is newer than the latest release ${latest}.`);
  }
  const yml = releaseYml(latest);
  if (!yml) throw new Error(`${latest} has no latest.yml (not a desktop release?)`);
  const next = withPolicy(yml, { minimumVersion });
  const tmp = mkdtempSync(join(tmpdir(), "pm-release-"));
  try {
    writeFileSync(join(tmp, "latest.yml"), next);
    gh(["release", "upload", latest, join(tmp, "latest.yml"), "--clobber"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(
    minimumVersion
      ? `Done: PCs older than ${minimumVersion} will install ${latest} after a 5-minute warning (apps check on start and every 4 hours).`
      : `Done: updates to ${latest} are optional again.`,
  );
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const commands = { plan, finalize, prune, force: () => force(rest) };
  try {
    if (!commands[command]) throw new Error(`Usage: release.mjs ${Object.keys(commands).join("|")}`);
    commands[command]();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
