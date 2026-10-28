import { describe, expect, it } from "vitest";
import {
  checkAnswer,
  compareVersions,
  installOutcome,
  isMandatory,
  isNewer,
  releaseNotesText,
} from "../update-policy";

describe("isNewer", () => {
  it("is true only for a later version", () => {
    expect(isNewer("1.0.12", "1.0.11")).toBe(true);
    expect(isNewer("1.0.11", "1.0.11")).toBe(false);
    expect(isNewer("1.0.9", "1.0.11")).toBe(false);
  });

  it("is false for something that is not a version", () => {
    expect(isNewer("latest", "1.0.11")).toBe(false);
  });
});

describe("checkAnswer", () => {
  it("never offers an update downloaded earlier once the feed has a newer one", () => {
    // 1.0.11 downloaded overnight, 1.0.12 published since: the PC goes straight to 1.0.12.
    expect(checkAnswer("1.0.11", "1.0.12", false)).toBe("downloading");
  });

  it("offers the downloaded update while it is still the newest, or the feed cannot be read", () => {
    expect(checkAnswer("1.0.12", "1.0.12", false)).toBe("offer-ready");
    expect(checkAnswer("1.0.12", null, false)).toBe("offer-ready");
    expect(checkAnswer("1.0.12", null, true)).toBe("offer-ready");
    expect(checkAnswer("1.0.12", "garbage", false)).toBe("offer-ready");
  });

  it("reports the check when nothing is downloaded", () => {
    expect(checkAnswer(null, "1.0.12", false)).toBe("downloading");
    expect(checkAnswer(null, null, false)).toBe("up-to-date");
    expect(checkAnswer(null, null, true)).toBe("failed");
  });
});

describe("installOutcome", () => {
  it("is updated when the version the app restarted for now runs, or a newer one", () => {
    expect(installOutcome("1.0.9", "1.0.9")).toBe("updated");
    expect(installOutcome("1.0.10", "1.0.9")).toBe("updated");
  });

  it("is not-installed when the silent install left the old version in place", () => {
    expect(installOutcome("1.0.8", "1.0.9")).toBe("not-installed");
  });

  it("is none without an attempt or with a value that is not a version", () => {
    expect(installOutcome("1.0.8", undefined)).toBe("none");
    expect(installOutcome("1.0.8", "latest")).toBe("none");
    expect(installOutcome("1.0.8", 9)).toBe("none");
  });
});

describe("compareVersions", () => {
  it("orders by major, minor, then patch", () => {
    expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("v1.0.4", "1.0.4")).toBe(0);
  });

  it("throws on something that is not a version", () => {
    expect(() => compareVersions("latest", "1.0.0")).toThrow(/Not a version/);
  });
});

describe("isMandatory", () => {
  it("is optional when the release sets no minimum", () => {
    expect(isMandatory("1.0.3", {})).toBe(false);
  });

  it("is required when this PC runs a version below the minimum", () => {
    expect(isMandatory("1.0.3", { minimumVersion: "1.0.5" })).toBe(true);
  });

  it("is optional once the PC is at or above the minimum", () => {
    expect(isMandatory("1.0.5", { minimumVersion: "1.0.5" })).toBe(false);
    expect(isMandatory("1.0.6", { minimumVersion: "1.0.5" })).toBe(false);
  });

  it("ignores a malformed minimum instead of forcing a restart loop", () => {
    expect(isMandatory("1.0.3", { minimumVersion: "soon" })).toBe(false);
    expect(isMandatory("1.0.3", { minimumVersion: 5 })).toBe(false);
  });
});

describe("releaseNotesText", () => {
  it("keeps plain text from latest.yml", () => {
    expect(releaseNotesText("- Datasheet view\n- Faster search")).toBe(
      "- Datasheet view\n- Faster search",
    );
  });

  it("turns a GitHub HTML body into plain lines", () => {
    expect(releaseNotesText("<ul><li>Fix &amp; tidy</li><li>New <b>report</b></li></ul>")).toBe(
      "- Fix & tidy\n- New report",
    );
  });

  it("joins per-version notes", () => {
    expect(
      releaseNotesText([
        { version: "1.0.2", note: "Two" },
        { version: "1.0.1", note: "One" },
      ]),
    ).toBe("Two\nOne");
  });

  it("returns an empty string when there are no notes", () => {
    expect(releaseNotesText(null)).toBe("");
  });

  it("truncates long notes with an ellipsis", () => {
    const text = releaseNotesText("x".repeat(50), 10);
    expect(text).toHaveLength(10);
    expect(text.endsWith("…")).toBe(true);
  });
});
