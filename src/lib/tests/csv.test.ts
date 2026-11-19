import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../csv";

describe("csv", () => {
  it("neutralises spreadsheet formulas in text", () => {
    for (const attack of ['=HYPERLINK("http://x")', "+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(attack).replace(/^"/, "").startsWith("'"), attack).toBe(true);
    }
    expect(csvCell({ number: "=1+1" })).toBe("'=1+1");
  });

  it("neutralises a formula that follows leading whitespace", () => {
    for (const attack of [" =1+1", "  +1", " @SUM(A1)", " \t-2+3", "\n=1+1"]) {
      expect(csvCell(attack).replace(/^"/, "").startsWith("'"), attack).toBe(true);
    }
  });

  it("neutralises before quoting, so a quoted field cannot hide a formula", () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
    expect(csvCell("\r=1")).toBe(`"'\r=1"`);
  });

  it("neutralises a value that begins with a quote then a formula character", () => {
    expect(csvCell('"=1+1')).toBe(`"'""=1+1"`);
    expect(csvCell("'=1+1")).toBe("''=1+1");
    expect(csvCell(' "+1')).toBe(`"' ""+1"`);
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("  hello")).toBe("  hello");
    expect(csvCell("'quoted'")).toBe("'quoted'");
  });

  it("keeps numbers as numbers", () => {
    expect(csvCell({ number: "-1234.50" })).toBe("-1234.50");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes per RFC 4180 and writes a BOM and CRLF rows", () => {
    expect(csvCell('Say "hi", then\nleave')).toBe('"Say ""hi"", then\nleave"');
    expect(csvCell("Rémunération")).toBe("Rémunération");
    expect(
      toCsv([
        ["a", { number: "1.00" }],
        ["b", null],
      ]),
    ).toBe(`${String.fromCharCode(0xfeff)}a,1.00\r\nb,\r\n`);
  });
});
