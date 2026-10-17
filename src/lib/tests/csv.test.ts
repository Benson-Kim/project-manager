import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../csv";

describe("csv", () => {
  it("neutralises spreadsheet formulas in text", () => {
    for (const attack of ['=HYPERLINK("http://x")', "+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(attack).replace(/^"/, "").startsWith("'"), attack).toBe(true);
    }
    expect(csvCell({ number: "=1+1" })).toBe("'=1+1");
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
