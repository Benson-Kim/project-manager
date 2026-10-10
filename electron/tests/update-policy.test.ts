import { describe, expect, it } from "vitest";
import { compareVersions, isMandatory, releaseNotesText } from "../update-policy";

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
