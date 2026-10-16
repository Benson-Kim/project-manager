/**
 * A small PDF writer for reports (ADR-0030), with no dependency: A4 pages, the
 * standard Helvetica and Helvetica-Bold fonts (no embedding) in WinAnsi
 * encoding, text, rules, shaded boxes, wrapped paragraphs and tables that break
 * across pages and repeat their header.
 *
 * Every string is user text, so the content is pure ASCII: characters outside
 * printable ASCII are written as octal escapes of their WinAnsi byte; ( ) and
 * \ are escaped; control characters become spaces; characters WinAnsi cannot
 * encode become "?". Nothing a person types can end a string or inject an
 * operator, and the file has no JavaScript, links, forms or attachments.
 */

export type Align = "left" | "right";

const HELVETICA: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD: number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** WinAnsi bytes 0x80-0x9F that differ from Latin-1, with their widths (regular, bold). */
const WIN_ANSI_EXTRA: Record<string, [number, number, number]> = {
  "€": [0x80, 556, 556],
  "‚": [0x82, 222, 278],
  "„": [0x84, 333, 500],
  "…": [0x85, 1000, 1000],
  "‰": [0x89, 1000, 1000],
  "‹": [0x8b, 333, 333],
  Œ: [0x8c, 1000, 1000],
  "‘": [0x91, 222, 278],
  "’": [0x92, 222, 278],
  "“": [0x93, 333, 500],
  "”": [0x94, 333, 500],
  "•": [0x95, 350, 350],
  "–": [0x96, 556, 556],
  "—": [0x97, 1000, 1000],
  "™": [0x99, 1000, 1000],
  "›": [0x9b, 333, 333],
  œ: [0x9c, 944, 944],
};

/** The WinAnsi byte for one character, or null when it has none. */
function winAnsiByte(ch: string): number | null {
  const code = ch.codePointAt(0)!;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return WIN_ANSI_EXTRA[ch]?.[0] ?? null;
}

/** Text as the characters the fonts can show: control characters to spaces, the rest to "?". */
export function toWinAnsiText(text: string): string {
  let out = "";
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) out += " ";
    else out += winAnsiByte(ch) === null ? "?" : ch;
  }
  return out;
}

function charWidth(ch: string, bold: boolean): number {
  const code = ch.codePointAt(0)!;
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (code >= 0x20 && code <= 0x7e) return table[code - 0x20]!;
  const extra = WIN_ANSI_EXTRA[ch];
  if (extra) return bold ? extra[2] : extra[1];
  const base = ch.normalize("NFD")[0]!;
  const baseCode = base.codePointAt(0)!;
  if (base !== ch && baseCode >= 0x20 && baseCode <= 0x7e) return table[baseCode - 0x20]!;
  return 556;
}

/** Width of a line of text in points. */
export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of toWinAnsiText(text)) units += charWidth(ch, bold);
  return (units * size) / 1000;
}

/** Text wrapped to a width: on spaces, breaking a word only when it alone is too wide. */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    const words = toWinAnsiText(paragraph).split(/ +/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (textWidth(rest, size, bold) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** A PDF string literal: ASCII only, ( ) \ escaped, other bytes as octal. */
export function pdfString(text: string): string {
  let out = "(";
  for (const ch of toWinAnsiText(text)) {
    const byte = winAnsiByte(ch) ?? 0x3f;
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (byte >= 0x20 && byte <= 0x7e) out += ch;
    else out += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return `${out})`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export interface TableColumn {
  header: string;
  width: number;
  align?: Align;
}

export interface PdfOptions {
  title: string;
  landscape?: boolean;
  margin?: number;
  /** Printed at the foot of every page, before "n / total". */
  footer?: string;
}

export class PdfWriter {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  private pages: string[][] = [];
  private current: string[] = [];
  /** The baseline cursor, from the bottom of the page. */
  y = 0;

  constructor(private readonly options: PdfOptions) {
    const [w, h] = [595.28, 841.89];
    this.width = options.landscape ? h : w;
    this.height = options.landscape ? w : h;
    this.margin = options.margin ?? 36;
    this.newPage();
  }

  get contentWidth(): number {
    return this.width - 2 * this.margin;
  }

  newPage(): void {
    this.current = [];
    this.pages.push(this.current);
    this.y = this.height - this.margin;
  }

  /** Starts a new page unless `height` points still fit above the bottom margin (and footer). */
  ensure(height: number): void {
    if (this.y - height < this.margin + 14) this.newPage();
  }

  text(text: string, x: number, y: number, size: number, bold = false): void {
    this.current.push(
      `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(x)} ${num(y)} Td ${pdfString(text)} Tj ET`,
    );
  }

  rule(x1: number, y1: number, x2: number, y2: number, width = 0.5, grey = 0.75): void {
    this.current.push(
      `${num(grey)} G ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S 0 G`,
    );
  }

  box(x: number, y: number, w: number, h: number, grey = 0.93): void {
    this.current.push(`${num(grey)} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f 0 g`);
  }

  /** A wrapped paragraph at the cursor, moving it down. */
  paragraph(text: string, size = 10, bold = false, gapAfter = 4): void {
    const leading = size * 1.3;
    for (const line of wrapText(text, this.contentWidth, size, bold)) {
      this.ensure(leading);
      this.y -= leading;
      this.text(line, this.margin, this.y, size, bold);
    }
    this.y -= gapAfter;
  }

  /** A table at the cursor: wrapped cells, a shaded header repeated on each page. */
  table(columns: TableColumn[], rows: string[][], size = 8, strongRows: number[] = []): void {
    const pad = 3;
    const leading = size * 1.25;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = total > this.contentWidth ? this.contentWidth / total : 1;
    const widths = columns.map((c) => c.width * scale);
    const strong = new Set(strongRows);

    const layout = (cells: string[], bold: boolean) =>
      cells.map((cell, i) => wrapText(cell ?? "", Math.max(widths[i]! - 2 * pad, 4), size, bold));
    const heightOf = (wrapped: string[][]) =>
      Math.max(1, ...wrapped.map((l) => l.length)) * leading + 2 * pad;

    const draw = (wrapped: string[][], bold: boolean, shade: boolean) => {
      const h = heightOf(wrapped);
      const top = this.y;
      if (shade)
        this.box(
          this.margin,
          top - h,
          widths.reduce((a, b) => a + b, 0),
          h,
        );
      let x = this.margin;
      wrapped.forEach((lines, i) => {
        const w = widths[i]!;
        lines.forEach((line, j) => {
          const baseline = top - pad - (j + 1) * leading + size * 0.25;
          const tx =
            columns[i]!.align === "right" ? x + w - pad - textWidth(line, size, bold) : x + pad;
          this.text(line, tx, baseline, size, bold);
        });
        x += w;
      });
      this.y = top - h;
      this.rule(this.margin, this.y, this.margin + widths.reduce((a, b) => a + b, 0), this.y);
    };

    const header = layout(
      columns.map((c) => c.header),
      true,
    );
    this.ensure(heightOf(header) + leading + 2 * pad);
    draw(header, true, true);
    rows.forEach((row, index) => {
      const bold = strong.has(index);
      const wrapped = layout(row, bold);
      if (this.y - heightOf(wrapped) < this.margin + 14) {
        this.newPage();
        draw(header, true, true);
      }
      draw(wrapped, bold, false);
    });
    this.y -= 8;
  }

  /** The finished file. */
  toBytes(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1 + 1;
    const pageCount = this.pages.length;
    // 1 catalog, 2 pages, 3-4 fonts, 5 info; then a page and its content per page.
    add("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = Array.from({ length: pageCount }, (_, i) => `${6 + i * 2} 0 R`).join(" ");
    add(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    add(`<< /Title ${pdfString(this.options.title)} /Producer (Project Manager) >>`);
    this.pages.forEach((ops, i) => {
      const footer = `${this.options.footer ? `${this.options.footer}  ·  ` : ""}${i + 1} / ${pageCount}`;
      const footOps = `BT /F1 7 Tf ${num(this.margin)} ${num(this.margin - 14)} Td ${pdfString(footer)} Tj ET`;
      const stream = [...ops, footOps].join("\n");
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`,
      );
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }
}
