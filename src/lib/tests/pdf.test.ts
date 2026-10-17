import { describe, expect, it } from "vitest";
import { PdfWriter, pdfString, textWidth, toWinAnsiText, wrapText } from "../pdf";

const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("pdf strings (ADR-0030)", () => {
  it("escapes the delimiters, so typed text cannot end a string or add operators", () => {
    expect(pdfString("Réquisition (copie) \\ test")).toBe(
      "(R\\351quisition \\(copie\\) \\\\ test)",
    );
    expect(pdfString(") Tj ET 1 0 0 RG BT (x")).toBe("(\\) Tj ET 1 0 0 RG BT \\(x)");
  });

  it("writes WinAnsi bytes as octal and keeps the file ASCII", () => {
    expect(pdfString("–·€’")).toBe("(\\226\\267\\200\\222)");
    expect(pdfString("a\nb\tc\u0000d")).toBe("(a b c d)");
    expect(pdfString("日本 😀")).toBe("(?? ?)");
  });

  it("maps characters the fonts cannot show", () => {
    expect(toWinAnsiText("Café\u0007 Ω")).toBe("Café  ?");
  });
});

describe("measuring and wrapping", () => {
  it("measures Helvetica widths", () => {
    expect(textWidth("0", 10)).toBeCloseTo(5.56);
    expect(textWidth("é", 10)).toBe(textWidth("e", 10));
    expect(textWidth("W", 10, true)).toBeCloseTo(9.44);
  });

  it("wraps on spaces and breaks only an over-long word", () => {
    const width = Math.max(textWidth("alpha beta", 10), textWidth("gamma delta", 10));
    const lines = wrapText("alpha beta gamma delta", width, 10);
    expect(lines).toEqual(["alpha beta", "gamma delta"]);
    const long = wrapText("x".repeat(40), textWidth("xxxxxxxxxx", 10), 10);
    expect(long.every((l) => textWidth(l, 10) <= textWidth("xxxxxxxxxx", 10))).toBe(true);
    expect(long.join("")).toBe("x".repeat(40));
    expect(wrapText("one\n\ntwo", 500, 10)).toEqual(["one", "", "two"]);
  });
});

describe("the document", () => {
  it("is a well-formed PDF with a correct cross-reference table", () => {
    const pdf = new PdfWriter({ title: "T (1)", landscape: true, footer: "Foot" });
    pdf.paragraph("Heading", 14, true);
    pdf.table(
      [
        { header: "Name", width: 200 },
        { header: "Amount", width: 80, align: "right" },
      ],
      Array.from({ length: 120 }, (_, i) => [`Row ${i}`, "1,234.56"]),
    );
    const text = decode(pdf.toBytes());
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(text)).toBe(false);
    const pages = Number(/\/Count (\d+)/.exec(text)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\(Amount\) Tj/g)!.length).toBe(pages);
    expect(text).toContain(`(Foot  \\267  ${pages} / ${pages}) Tj`);
    expect(text).toContain("/Title (T \\(1\\))");
    expect(text).not.toMatch(/\/JavaScript|\/JS|\/Launch|\/URI|\/AcroForm|\/EmbeddedFile/);

    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) =>
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
    );
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });
});
