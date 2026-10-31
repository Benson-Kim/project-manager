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

const RELEASE_TAGS = /\s*\[(e2e|skip ci|ci skip|verify|force[- ]update|no[- ]release)\]/gi;

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

/** Next release: one patch above the last version shipped, or package.json's version when that is higher. */
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

/**
 * What a push to develop asks of the release. "[no-release]" holds it back: nothing is
 * published, and the next release ships these changes. A hold beats a force, so a forced
 * update has to go on the merge that does release.
 */
export function releaseIntent(message, forceEnv = false) {
  const held = /\[no[- ]release\]/i.test(message ?? "");
  const forced = forceEnv || isForced(message);
  return { held, force: forced && !held, forceIgnored: forced && held };
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

const COMMIT_TYPE = /^(feat|fix|docs|chore|refactor|perf|test|build|ci|style|revert)(\([^)]*\))?!?:\s*/i;
/** Decision records, plan items and PR numbers: they mean nothing to the people who use the app. */
const PLAN_REFS = /\s*\([^()]*\b(ADR|PM|PR)[- ]?\d+[^()]*\)|\s*\(#\d+\)|\b(ADR|PM|PR)[- ]?\d+\b|#\d+\b/gi;
const NOTE_LINE = /^\s*release note:\s*(.*)$/gim;

/** A PR title or release-note line as the people who use the app should read it ("" when nothing is left). */
export function userFacing(text) {
  const cleaned = String(text ?? "")
    .replace(RELEASE_TAGS, "")
    .trim()
    .replace(COMMIT_TYPE, "")
    .replace(PLAN_REFS, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:]*\b(and|or|with|plus)\s*$/i, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
  return cleaned && cleaned[0].toUpperCase() + cleaned.slice(1);
}

/**
 * The "What's new" lines installed apps show, one or more per PR merged since the previous
 * release (first-parent history). A merge commit's `Release note:` lines win; "Release note:
 * none" leaves the PR out; otherwise its title is used. A direct commit appears only with a
 * release note of its own.
 */
export function notesFromLog(entries, max = 25) {
  const lines = [];
  for (const { subject, body = "" } of entries) {
    const written = [...body.matchAll(NOTE_LINE)].map((m) => m[1].trim());
    let notes = written;
    if (!written.length) {
      if (!/^Merge pull request #\d+ from \S+/.test(subject)) continue;
      notes = [body.split("\n").find((l) => l.trim()) ?? ""];
    }
    for (const note of notes) {
      if (/^none\.?$/i.test(note)) continue;
      const text = userFacing(note);
      if (text) lines.push(`- ${text}`);
    }
  }
  if (lines.length > max) return [...lines.slice(0, max), `- …and ${lines.length - max} more`].join("\n");
  return lines.join("\n");
}

const newestFirst = (tags) => tags.filter((t) => TAG_RE.test(t)).sort((a, b) => compareVersions(b, a));

/**
 * The last version shipped: the newest version tag, or "" when there is none. Releases are
 * deleted by hand to free storage and their tags stay, so the newest release alone can be
 * far behind (or missing) and would reuse a version number.
 */
export function lastShippedTag(tags) {
  return newestFirst(tags)[0] ?? "";
}

/** Release tags beyond the newest `keep`, oldest last. Non-version tags are never touched. */
export function releasesToPrune(tags, keep) {
  return newestFirst(tags).slice(keep);
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

/** gh's answer for a repository without releases; any other gh failure is not "no release". */
export function isNoReleaseError(message) {
  return /release not found/i.test(String(message ?? ""));
}

/**
 * The newest release's tag, or "" when there is none yet. A failed lookup throws:
 * taken for "no release", it would publish without the previous minimumVersion.
 */
function latestReleaseTag() {
  try {
    return gh(["release", "view", "--json", "tagName", "-q", ".tagName"]) || "";
  } catch (err) {
    if (isNoReleaseError(err.message)) return "";
    throw err;
  }
}

/** A release's latest.yml; throws when it cannot be read, so its policy is never dropped silently. */
function releaseYml(tag) {
  try {
    return gh(["release", "download", tag, "-p", "latest.yml", "-O", "-"]);
  } catch (err) {
    throw new Error(`Could not read latest.yml of ${tag}, so its update policy cannot be carried: ${err.message}`);
  }
}

function plan() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  const latestRelease = latestReleaseTag();
  const previous = lastShippedTag([latestRelease, ...git(["tag", "--list", "v*"]).split("\n")]);
  const version = nextVersion(pkg.version, previous);
  const { held, force, forceIgnored } = releaseIntent(
    git(["log", "-1", "--format=%B"]),
    process.env.FORCE_UPDATE === "true",
  );
  let skip = held;
  if (!held && previous && !force) {
    // exit 0 = no differences in app paths since the last release
    skip = sh("git", ["diff", "--quiet", previous, "HEAD", "--", ...APP_PATHS], { allowFail: true }) !== null;
  }
  output({ version, previous, latest_release: latestRelease, force: String(force), skip: String(skip) });
  if (previous !== latestRelease) {
    console.log(
      latestRelease
        ? `::notice::${previous} has no release any more; the update policy is carried from ${latestRelease}.`
        : `::notice::No release is left to carry an update policy from; ${version} starts without one.`,
    );
  }
  if (forceIgnored) console.log("::warning::[force-update] is ignored on a [no-release] merge; nothing was published.");
  if (held) console.log("[no-release]: no new desktop release; the next release ships these changes.");
  else if (skip) console.log(`Nothing that reaches the app changed since ${previous}: no new desktop release.`);
}

function finalize() {
  const version = process.env.VERSION;
  const previous = process.env.PREVIOUS || "";
  const latestRelease = process.env.LATEST_RELEASE || "";
  const force = process.env.FORCE === "true";
  if (!version) throw new Error("VERSION is required");
  const ymlPath = join(dist, "latest.yml");
  const yml = readFileSync(ymlPath, "utf-8");
  if (!yml.includes(`version: ${version}`)) throw new Error(`latest.yml is not for ${version}`);

  const previousMinimum = latestRelease ? minimumFromYml(releaseYml(latestRelease)) : null;
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
