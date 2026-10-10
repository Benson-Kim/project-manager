/**
 * Pure update rules (no Electron imports, unit-tested in tests/update-policy.test.ts).
 *
 * Updates are optional by default. A release is *required* for this PC when
 * its latest.yml carries a `minimumVersion` newer than the running version.
 * The release pipeline (scripts/desktop/release.mjs) sets it on a forced
 * release and carries it into every later release, so a PC that skipped the
 * forced version is still made to update.
 */

type Version = [number, number, number];

function parseVersion(v: string): Version {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) throw new Error(`Not a version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1, 0 or 1 like a sort comparator; prerelease suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** True when the release says this version may no longer be used. */
export function isMandatory(currentVersion: string, info: { minimumVersion?: unknown }): boolean {
  if (typeof info.minimumVersion !== "string") return false;
  try {
    return compareVersions(currentVersion, info.minimumVersion) < 0;
  } catch {
    return false; // a malformed policy must never lock anyone into a restart loop
  }
}

/**
 * Release notes as plain text for a native dialog. latest.yml carries text;
 * electron-updater falls back to the GitHub release body (HTML) or a list of
 * per-version notes, so all three shapes are handled.
 */
export function releaseNotesText(notes: unknown, max = 800): string {
  const raw =
    typeof notes === "string"
      ? notes
      : Array.isArray(notes)
        ? notes
            .map((n) => (n && typeof n === "object" && "note" in n ? String(n.note ?? "") : ""))
            .join("\n")
        : "";
  const text = raw
    .replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
