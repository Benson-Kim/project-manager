import { describe, expect, it } from "vitest";
import {
  isForced,
  isNoReleaseError,
  lastShippedTag,
  minimumFromYml,
  nextMinimum,
  nextVersion,
  notesFromLog,
  releaseIntent,
  releasesToPrune,
  withPolicy,
} from "../release.mjs";

const LATEST_YML = `version: 1.0.4
files:
  - url: ProjectManager-Setup-1.0.4.exe
    sha512: abc==
    size: 371500000
    isAdminRightsRequired: true
path: ProjectManager-Setup-1.0.4.exe
sha512: abc==
releaseDate: '2026-10-09T10:00:00.000Z'
`;

describe("nextVersion", () => {
  it("starts at package.json's version when nothing is released", () => {
    expect(nextVersion("1.0.0", "")).toBe("1.0.0");
  });

  it("bumps the patch of the latest release", () => {
    expect(nextVersion("1.0.0", "v1.0.7")).toBe("1.0.8");
  });

  it("follows a manual major/minor bump in package.json", () => {
    expect(nextVersion("1.1.0", "v1.0.7")).toBe("1.1.0");
  });

  it("never goes backwards when package.json is behind the releases", () => {
    expect(nextVersion("0.1.0", "v1.0.7")).toBe("1.0.8");
  });

  it("ignores tags that are not desktop versions", () => {
    expect(nextVersion("1.0.0", "docs-2026")).toBe("1.0.0");
  });
});

describe("lastShippedTag", () => {
  it("follows the newest version tag when releases were deleted but their tags stay", () => {
    const tags = ["", "v1.0.9", "v1.0.16", "v1.0.10", "backup-2026"];
    expect(lastShippedTag(tags)).toBe("v1.0.16");
    expect(nextVersion("1.0.0", lastShippedTag(tags))).toBe("1.0.17");
  });

  it("counts the latest release even when its tag was not fetched", () => {
    expect(lastShippedTag(["v1.0.12", "v1.0.11"])).toBe("v1.0.12");
  });

  it("is empty when nothing was ever shipped", () => {
    expect(lastShippedTag(["", "docs-2026"])).toBe("");
    expect(nextVersion("1.0.0", lastShippedTag([""]))).toBe("1.0.0");
  });
});

describe("isForced", () => {
  it("finds the marker in a merge commit that carries the PR title", () => {
    expect(isForced("Merge pull request #30 from x/y\n\nfix(db): data repair [force-update]")).toBe(
      true,
    );
    expect(isForced("fix: thing [Force Update]")).toBe(true);
  });

  it("is false without the marker", () => {
    expect(isForced("feat: new report [e2e]")).toBe(false);
    expect(isForced(undefined)).toBe(false);
  });
});

describe("releaseIntent", () => {
  it("holds a merge that says [no-release]", () => {
    expect(
      releaseIntent("Merge pull request #45 from x/y\n\nRisks register [no-release]\n\nRelease note: none"),
    ).toEqual({ held: true, force: false, forceIgnored: false });
    expect(releaseIntent("chore: pins [No Release]").held).toBe(true);
  });

  it("lets a hold beat a force from the message or the environment", () => {
    expect(releaseIntent("fix(db): repair [force-update] [no-release]")).toEqual({
      held: true,
      force: false,
      forceIgnored: true,
    });
    expect(releaseIntent("chore: pins [no-release]", true)).toEqual({
      held: true,
      force: false,
      forceIgnored: true,
    });
  });

  it("forces without a hold, and releases normally with neither", () => {
    expect(releaseIntent("fix(db): repair [force-update]")).toEqual({
      held: false,
      force: true,
      forceIgnored: false,
    });
    expect(releaseIntent("feat: new report [e2e]", true).force).toBe(true);
    expect(releaseIntent(undefined)).toEqual({ held: false, force: false, forceIgnored: false });
  });
});

describe("isNoReleaseError", () => {
  it("is gh's answer for a repository without releases", () => {
    expect(isNoReleaseError("gh release view --json tagName failed: release not found")).toBe(true);
  });

  it("is false for a failed lookup, so a required update is never dropped by a GitHub hiccup", () => {
    expect(isNoReleaseError("gh release view failed: HTTP 502: Bad Gateway")).toBe(false);
    expect(isNoReleaseError("error connecting to api.github.com")).toBe(false);
    expect(isNoReleaseError(undefined)).toBe(false);
  });
});

describe("nextMinimum", () => {
  it("a forced release requires itself", () => {
    expect(nextMinimum({ force: true, version: "1.0.5", previousMinimum: "1.0.2" })).toBe("1.0.5");
  });

  it("an optional release carries the previous minimum forward", () => {
    expect(nextMinimum({ force: false, version: "1.0.6", previousMinimum: "1.0.5" })).toBe("1.0.5");
  });

  it("stays optional when nothing was ever forced", () => {
    expect(nextMinimum({ force: false, version: "1.0.6", previousMinimum: null })).toBeNull();
  });
});

describe("withPolicy / minimumFromYml", () => {
  it("adds minimumVersion and notes that electron-updater can read back", () => {
    const yml = withPolicy(LATEST_YML, { minimumVersion: "1.0.4", notes: "- One\n- Two" });
    expect(yml).toContain("releaseDate: '2026-10-09T10:00:00.000Z'\nminimumVersion: '1.0.4'\n");
    expect(yml.endsWith("releaseNotes: |-\n  - One\n  - Two\n")).toBe(true);
    expect(minimumFromYml(yml)).toBe("1.0.4");
  });

  it("replaces earlier policy keys instead of duplicating them", () => {
    const once = withPolicy(LATEST_YML, { minimumVersion: "1.0.3", notes: "- Old" });
    const twice = withPolicy(once, { minimumVersion: "1.0.4", notes: "- New" });
    expect(twice.match(/minimumVersion/g)).toHaveLength(1);
    expect(twice).not.toContain("- Old");
    expect(minimumFromYml(twice)).toBe("1.0.4");
  });

  it("keeps the notes when only the policy changes (force command)", () => {
    const released = withPolicy(LATEST_YML, { minimumVersion: null, notes: "- Report" });
    const forced = withPolicy(released, { minimumVersion: "1.0.4" });
    expect(forced).toContain("releaseNotes: |-\n  - Report\n");
    expect(minimumFromYml(forced)).toBe("1.0.4");
    const relaxed = withPolicy(forced, { minimumVersion: null });
    expect(minimumFromYml(relaxed)).toBeNull();
    expect(relaxed).toContain("  - Report");
  });

  it("reads no minimum from a file without one", () => {
    expect(minimumFromYml(LATEST_YML)).toBeNull();
    expect(minimumFromYml(null)).toBeNull();
  });
});

const merge = (n, body) => ({ subject: `Merge pull request #${n} from Benson-Kim/feature/x`, body });

describe("notesFromLog", () => {
  it("uses a merge's release-note lines over its title", () => {
    const notes = notesFromLog([
      merge(
        38,
        "Notes without a project (ADR-0035 amendment)\n\n" +
          "Release note: Notes can live outside a project, in a notebook everyone shares.\n" +
          "release note: Notes is in the main menu.\n",
      ),
    ]);
    expect(notes).toBe(
      "- Notes can live outside a project, in a notebook everyone shares.\n- Notes is in the main menu.",
    );
  });

  it("falls back to the PR title without commit type, plan numbers, PR number or CI tags", () => {
    const notes = notesFromLog([
      merge(
        39,
        "[force-update] Meeting action status and follow-ups (ADR-0043), a reason for the hold, and sortable sticky lists (ADR-0044)\n",
      ),
      merge(38, "Notes without a project: the shared space everyone edits (ADR-0035 amendment)\n"),
      merge(41, "fix(desktop): update click installs (#41) [e2e]\n"),
      merge(36, "feat(requirements): the register, PM-3 follow-up and ADR-0040\n"),
    ]);
    expect(notes.split("\n")).toEqual([
      "- Meeting action status and follow-ups, a reason for the hold, and sortable sticky lists",
      "- Notes without a project: the shared space everyone edits",
      "- Update click installs",
      "- The register, follow-up",
    ]);
  });

  it("never lets a plan or PR number through", () => {
    const notes = notesFromLog([
      merge(1, "Release note: Faster lists (ADR-0016, PM-6), see #12 and PR-3\n"),
      merge(2, "docs(adr): ADR-0045 read committed snapshot (#38)\n"),
      merge(3, "Risks register [no-release]\n"),
    ]);
    expect(notes).not.toMatch(/ADR|PM-\d|PR-?\d|#\d|\[/);
  });

  it("leaves out direct commits, branch merges and 'Release note: none'", () => {
    const notes = notesFromLog([
      { subject: "fix(ci): seed counts [e2e]", body: "" },
      { subject: "Merge branch 'develop' into feature/x", body: "" },
      merge(40, "chore: CI pins\n\nRelease note: none\n"),
      { subject: "fix(db): faster search", body: "Release note: Search is faster on long lists.\n" },
    ]);
    expect(notes).toBe("- Search is faster on long lists.");
  });

  it("caps long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => merge(i, `feat: change ${i}\n`));
    const notes = notesFromLog(many, 3).split("\n");
    expect(notes).toEqual(["- Change 0", "- Change 1", "- Change 2", "- …and 27 more"]);
  });
});

describe("releasesToPrune", () => {
  it("keeps the newest versions and never touches other tags", () => {
    const tags = ["v1.0.9", "v1.0.10", "v1.0.8", "backup-2026", "v1.0.11"];
    expect(releasesToPrune(tags, 2)).toEqual(["v1.0.9", "v1.0.8"]);
  });
});
