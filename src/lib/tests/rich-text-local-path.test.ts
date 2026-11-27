import { describe, expect, it, vi } from "vitest";
import { activateLocalPathLink } from "@/components/ui/rich-text/local-path-view";
import {
  BLOCKED_LOCAL_EXTENSIONS,
  isAllowedLinkHref,
  localPathProblem,
  parseLinkInput,
} from "../rich-text/links";
import { sanitizeRichText } from "../rich-text/sanitize";

const FOLDER = String.raw`C:\Users\maina\Documents\CIUSS Pilot 2025`;

describe("local folder links (ADR-0075)", () => {
  it("accepts a drive folder path, with either slash and a trailing slash", () => {
    expect(parseLinkInput(`  ${FOLDER}  `)).toEqual({ kind: "localPath", path: FOLDER });
    expect(localPathProblem("D:/Shared/Reports/")).toBeNull();
    expect(localPathProblem(String.raw`C:\Projects\Plan v2.0`)).toBeNull();
    expect(localPathProblem(String.raw`C:\Reports\summary.pdf`)).toBeNull();
  });

  it.each(BLOCKED_LOCAL_EXTENSIONS)("refuses .%s as an executable", (extension) => {
    expect(localPathProblem(String.raw`C:\Tools\setup.${extension}`)).toBe("executable");
    expect(localPathProblem(String.raw`C:\Tools\SETUP.${extension.toUpperCase()}`)).toBe(
      "executable",
    );
  });

  it("refuses executables hidden behind trailing dots, spaces or slashes", () => {
    for (const path of [
      String.raw`C:\a\run.exe.`,
      String.raw`C:\a\run.exe. `,
      String.raw`C:\a\run.lnk\ `,
      "C:/a/run.bat/",
    ]) {
      expect(localPathProblem(path)).toBe("executable");
    }
  });

  it("refuses UNC shares, traversal, control and unsafe characters, file: and script URLs", () => {
    for (const path of [
      String.raw`\\attacker\share\folder`,
      "//attacker/share",
      String.raw`C:\Users\..\Windows\System32`,
      String.raw`C:\Users\.\x`,
      `C:\\Users\\a${String.fromCharCode(0)}b`,
      `C:\\Users\\a${String.fromCharCode(10)}b`,
      String.raw`C:\a\b.txt:hidden`,
      String.raw`C:\a\<script>`,
      String.raw`C:\a\"x"`,
      String.raw`C:\a\b|c`,
      String.raw`C:\a\b?c`,
      String.raw`C:\a\b*c`,
      "file:///C:/Users/x",
      "javascript:alert(1)",
      "C:",
      "Users\\x",
      `C:\\${"a".repeat(300)}`,
    ]) {
      expect(localPathProblem(path), path).toBe("invalid");
    }
    expect(parseLinkInput("file:///C:/Users/x")).toEqual({ kind: "refused", reason: "invalid" });
    expect(parseLinkInput("javascript:alert(1)")).toEqual({ kind: "refused", reason: "invalid" });
    expect(parseLinkInput(String.raw`C:\Tools\setup.exe`)).toEqual({
      kind: "refused",
      reason: "executable",
    });
    expect(isAllowedLinkHref(FOLDER)).toBe(false);
  });

  it("still reads web and e-mail addresses as links", () => {
    expect(parseLinkInput("example.com/page")).toEqual({
      kind: "url",
      href: "https://example.com/page",
    });
    expect(parseLinkInput("a@b.co")).toEqual({ kind: "url", href: "mailto:a@b.co" });
  });
});

const KEYBOARD = 'tabindex="0" role="link"';

describe("sanitizer keeps local folder links only as data-local-path", () => {
  it("sets its own tabindex and role and drops the ones that came in", () => {
    const hostile = 'tabindex="-1" role="button"';
    expect(sanitizeRichText(`<p><a data-local-path="${FOLDER}" ${hostile}>x</a></p>`)).toBe(
      `<p><a data-local-path="${FOLDER}" ${KEYBOARD}>x</a></p>`,
    );
    expect(sanitizeRichText(`<p><a href="https://example.com" ${hostile}>x</a></p>`)).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer">x</a></p>',
    );
    expect(sanitizeRichText(`<p><a ${KEYBOARD}>x</a></p>`)).toBe("<p><span>x</span></p>");
  });

  it("keeps a valid folder link with no href", () => {
    const html = sanitizeRichText(`<p><a data-local-path="${FOLDER}">Pilot folder</a></p>`);
    expect(html).toBe(`<p><a data-local-path="${FOLDER}" ${KEYBOARD}>Pilot folder</a></p>`);
  });

  it("drops executables, UNC, file: and javascript: to plain text", () => {
    for (const anchor of [
      String.raw`<a data-local-path="C:\Tools\setup.exe">x</a>`,
      String.raw`<a data-local-path="C:\Tools\run.ps1">x</a>`,
      String.raw`<a data-local-path="C:\Tools\app.lnk">x</a>`,
      String.raw`<a data-local-path="C:\Tools\go.bat">x</a>`,
      String.raw`<a data-local-path="\\attacker\share">x</a>`,
      `<a href="file:///C:/Users/x">x</a>`,
      `<a href="javascript:alert(1)">x</a>`,
      `<a data-local-path="javascript:alert(1)">x</a>`,
    ]) {
      expect(sanitizeRichText(`<p>${anchor}</p>`), anchor).toBe("<p><span>x</span></p>");
    }
  });

  it("never pairs a local path with an href and strips event handlers", () => {
    const html = sanitizeRichText(
      `<p><a href="javascript:alert(1)" data-local-path="${FOLDER}" onclick="alert(1)">x</a></p>`,
    );
    expect(html).toBe("<p><span>x</span></p>");
    const kept = sanitizeRichText(
      `<p><a data-local-path="${FOLDER}" onmouseover="alert(1)" style="x">x</a></p>`,
    );
    expect(kept).toBe(`<p><a data-local-path="${FOLDER}" ${KEYBOARD}>x</a></p>`);
  });

  it("escapes markup inside the stored path", () => {
    const html = sanitizeRichText(
      `<p><a data-local-path='C:\\a\\"><img src=x onerror=alert(1)>'>x</a></p>`,
    );
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("data-local-path");
  });

  it("judges the decoded path, so entities cannot smuggle a share, a program or a quote", () => {
    for (const encoded of [
      "&#92;&#92;attacker&#92;share",
      "C:&#92;Tools&#92;setup&#46;exe",
      "C:&#92;a&#34; onmouseover=&#34;alert(1)",
      "&#106;avascript:alert(1)",
    ]) {
      const html = sanitizeRichText(`<p><a data-local-path="${encoded}">x</a></p>`);
      expect(html, encoded).toBe("<p><span>x</span></p>");
    }
  });
});

describe("activating a folder link", () => {
  const press = (type: string, init: object, inEditor = false) => {
    const anchor = {
      closest: (selector: string): unknown =>
        selector.startsWith("a[") ? anchor : inEditor ? {} : null,
      getAttribute: () => FOLDER,
      hasAttribute: () => false,
    };
    const event = { type, ...init, target: anchor, preventDefault: vi.fn() };
    const open = vi.fn(async () => ({ ok: true as const }));
    activateLocalPathLink(event as unknown as Event, { open, showPath: vi.fn(), fail: vi.fn() });
    return { open, preventDefault: event.preventDefault };
  };

  it.each([
    ["click", { button: 0 }],
    ["keydown", { key: "Enter" }],
  ])("opens the folder on %s", (type, init) => {
    const { open, preventDefault } = press(type, init);
    expect(open).toHaveBeenCalledWith(FOLDER);
    expect(preventDefault).toHaveBeenCalled();
  });

  it.each([
    ["Enter inside the editor", "keydown", { key: "Enter" }, true],
    ["a held Enter", "keydown", { key: "Enter", repeat: true }, false],
    ["another key", "keydown", { key: " " }, false],
    ["a right click", "click", { button: 2 }, false],
  ])("ignores %s", (_name, type, init, inEditor) => {
    const { open, preventDefault } = press(type, init, inEditor);
    expect(open).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
