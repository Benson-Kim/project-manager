import { describe, expect, it } from "vitest";
import {
  isForced,
  minimumFromYml,
  nextMinimum,
  nextVersion,
  notesFromLog,
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

describe("notesFromLog", () => {
  it("uses PR titles for merges and drops CI markers", () => {
    const notes = notesFromLog([
      {
        subject: "Merge pull request #21 from Benson-Kim/docs/datasheet-phase",
        body: "docs(datasheet): standards [skip ci]\n",
      },
      { subject: "fix(ci): seed counts [e2e]", body: "" },
      { subject: "Merge branch 'develop' into feature/x", body: "" },
    ]);
    expect(notes).toBe("- docs(datasheet): standards (#21)\n- fix(ci): seed counts");
  });

  it("caps long lists", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ subject: `feat: ${i}`, body: "" }));
    const notes = notesFromLog(many, 3).split("\n");
    expect(notes).toEqual(["- feat: 0", "- feat: 1", "- feat: 2", "- …and 27 more"]);
  });
});

describe("releasesToPrune", () => {
  it("keeps the newest versions and never touches other tags", () => {
    const tags = ["v1.0.9", "v1.0.10", "v1.0.8", "backup-2026", "v1.0.11"];
    expect(releasesToPrune(tags, 2)).toEqual(["v1.0.9", "v1.0.8"]);
  });
});
