import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  extensionOf,
  FILE_NAME_MAX,
  sanitizeFileName,
} from "../file-names";

describe("sanitizeFileName (ADR-0026 §4)", () => {
  it.each([
    ["report.pdf", "report.pdf"],
    ["  Q3   report .pdf ", "Q3 report .pdf"],
    ["../../etc/passwd", "....etcpasswd"],
    ["C:\\Users\\me\\minutes.docx", "CUsersmeminutes.docx"],
    ["a<b>c:d\"e|f?g*h.txt", "abcdefgh.txt"],
    ["line\r\nbreak.txt", "linebreak.txt"],
    ["tab\there.csv", "tabhere.csv"],
    ["bell\u0007.txt", "bell.txt"],
    ["c1\u0085control.txt", "c1control.txt"],
    ["trailing dots...", "trailing dots"],
    ["e\u0301te\u0301.txt", "\u00e9t\u00e9.txt"],
  ])("%j → %j", (raw, clean) => {
    expect(sanitizeFileName(raw)).toBe(clean);
  });

  it.each(["", "   ", "...", "/\\", "\u0000\u0001", "\ud800"])("%j has nothing left", (raw) => {
    expect(sanitizeFileName(raw)).toBeNull();
  });

  it("drops a lone surrogate but keeps a real pair", () => {
    expect(sanitizeFileName("a\ud800b\ud83d\ude00.txt")).toBe("ab\ud83d\ude00.txt");
  });

  it("caps long names at 255 characters and keeps the extension", () => {
    const name = sanitizeFileName(`${"x".repeat(400)}.docx`)!;
    expect(name).toHaveLength(FILE_NAME_MAX);
    expect(name.endsWith(".docx")).toBe(true);
  });

  it("never splits a surrogate pair when it cuts", () => {
    const name = sanitizeFileName(`${"\ud83d\ude00".repeat(200)}.pdf`)!;
    expect(name.length).toBeLessThanOrEqual(FILE_NAME_MAX);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(() => encodeURIComponent(name)).not.toThrow();
  });
});

describe("extensionOf", () => {
  it.each([
    ["a.PDF", ".pdf"],
    ["archive.tar.gz", ".gz"],
    ["noext", ""],
    [".hidden", ""],
    ["trailing.", ""],
    ["weird.ext with space", ""],
    [`long.${"x".repeat(20)}`, ""],
  ])("%j → %j", (name, ext) => {
    expect(extensionOf(name)).toBe(ext);
  });
});

describe("contentDisposition (RFC 6266 / 8187)", () => {
  it("gives an ASCII fallback and the exact UTF-8 name", () => {
    expect(contentDisposition("Procès-verbal été.pdf")).toBe(
      "attachment; filename=\"Proc_s-verbal _t_.pdf\"; filename*=UTF-8''Proc%C3%A8s-verbal%20%C3%A9t%C3%A9.pdf",
    );
  });

  it("cannot be broken out of with quotes, backslashes or CR/LF", () => {
    const header = contentDisposition('evil".pdf"\r\nSet-Cookie: x=1\\');
    expect(header).not.toMatch(/[\r\n]/);
    const fallback = header.match(/filename="([^"]*)"/)![1];
    expect(fallback).toBe("evil_.pdf___Set-Cookie: x=1_");
    expect(header).toContain("filename*=UTF-8''evil%22.pdf%22%0D%0ASet-Cookie%3A%20x%3D1%5C");
  });

  it("percent-encodes the characters RFC 8187 reserves", () => {
    expect(contentDisposition("a'(b)*.txt")).toContain("filename*=UTF-8''a%27%28b%29%2A.txt");
  });

  it("falls back to a generic name when nothing is printable", () => {
    expect(contentDisposition("")).toContain('filename="download"');
  });
});
