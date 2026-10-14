import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sniff, sniffFile, type ByteSource } from "../files/sniff";

/** A ByteSource over an in-memory buffer. */
function source(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}

/**
 * A minimal ZIP whose central directory lists `names` (the parser reads only
 * the end record and the directory, like any ZIP reader). Options break it.
 */
function zip(names: string[], opts: { zip64?: boolean; badSignature?: boolean } = {}): Buffer {
  const local = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...new Array(26).fill(0)]);
  const entries = names.map((name) => {
    const n = Buffer.from(name, "utf8");
    const e = Buffer.alloc(46 + n.length);
    e.writeUInt32LE(opts.badSignature ? 0x12345678 : 0x02014b50, 0);
    e.writeUInt16LE(n.length, 28);
    n.copy(e, 46);
    return e;
  });
  const cd = Buffer.concat(entries);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(opts.zip64 ? 0xffffffff : local.length, 16);
  return Buffer.concat([local, cd, eocd]);
}

const DOCX = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "docProps/core.xml"];
const XLSX = ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"];
const PPTX = ["[Content_Types].xml", "ppt/presentation.xml"];

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("sniff (ADR-0026 §4): magic bytes decide, the extension must agree", () => {
  it.each([
    ["a.pdf", text("%PDF-1.7\n%..."), "application/pdf"],
    ["a.png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "image/png"],
    ["a.jpg", bytes(0xff, 0xd8, 0xff, 0xe0, 0), "image/jpeg"],
    ["a.JPEG", bytes(0xff, 0xd8, 0xff, 0xdb), "image/jpeg"],
    [
      "mail.msg",
      bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0),
      "application/vnd.ms-outlook",
    ],
    ["notes.txt", text("Hello, été\r\nsecond line"), "text/plain; charset=utf-8"],
    ["data.csv", text("﻿a,b\n1,2\n"), "text/csv; charset=utf-8"],
    ["mail.eml", text("Received: from x\r\nSubject: hi\r\n\r\nbody"), "message/rfc822"],
    ["mail.eml", text("MIME-Version: 1.0\nFrom: a@b.c\n"), "message/rfc822"],
  ])("%s is accepted as %s", async (name, content, type) => {
    expect(await sniff(source(content), name)).toEqual({ ok: true, contentType: type });
  });

  it.each([
    [".docx", DOCX, "wordprocessingml.document"],
    [".xlsx", XLSX, "spreadsheetml.sheet"],
    [".pptx", PPTX, "presentationml.presentation"],
  ])("an Office %s is recognised by its parts", async (ext, names, type) => {
    const result = await sniff(source(zip(names)), `file${ext}`);
    expect(result.ok && result.contentType.endsWith(type)).toBe(true);
  });

  it.each([
    ["a PDF named .docx", "a.docx", text("%PDF-1.4")],
    ["a PNG named .jpg", "a.jpg", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ["a JPEG named .pdf", "a.pdf", bytes(0xff, 0xd8, 0xff)],
    ["a Word file named .xlsx", "a.xlsx", zip(DOCX)],
    ["a plain ZIP named .docx", "a.docx", zip(["readme.txt", "src/main.c"])],
    ["a ZIP without [Content_Types].xml", "a.docx", zip(["word/document.xml"])],
    ["an Office file with macros", "a.docx", zip([...DOCX, "word/vbaProject.bin"])],
    ["a ZIP mixing Word and Excel parts", "a.docx", zip([...DOCX, "xl/workbook.xml"])],
    ["a Zip64 archive", "a.docx", zip(DOCX, { zip64: true })],
    ["a damaged central directory", "a.docx", zip(DOCX, { badSignature: true })],
    ["a ZIP named .zip", "a.zip", zip(DOCX)],
    ["an OLE file named .doc", "old.doc", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)],
    ["an executable named .txt", "a.txt", text("MZ\u0090\u0000\u0003")],
    ["text with a NUL byte", "a.txt", bytes(0x61, 0x00, 0x62)],
    ["invalid UTF-8", "a.csv", bytes(0x61, 0xff, 0xfe, 0x62)],
    ["UTF-16 text", "a.txt", bytes(0xff, 0xfe, 0x61, 0x00)],
    ["an e-mail without headers", "a.eml", text("Hello there\nno headers")],
    ["HTML named .html", "a.html", text("<!doctype html><script>alert(1)</script>")],
    ["SVG named .svg", "a.svg", text("<svg onload=alert(1)>")],
    ["text without an extension", "README", text("hello")],
  ])("refuses %s", async (_label, name, content) => {
    expect(await sniff(source(content), name)).toEqual({ ok: false, reason: "type" });
  });

  it("refuses an empty file", async () => {
    expect(await sniff(source(new Uint8Array(0)), "a.pdf")).toEqual({ ok: false, reason: "empty" });
  });

  it("checks UTF-8 across chunk boundaries and the whole file", async () => {
    const big = Buffer.alloc(200 * 1024, "a");
    big.write("é", 64 * 1024 - 1, "utf8"); // a two-byte character split over the first boundary
    expect((await sniff(source(big), "big.txt")).ok).toBe(true);
    big[150 * 1024] = 0;
    expect((await sniff(source(big), "big.txt")).ok).toBe(false);
  });

  it("reads the first header of a long e-mail line by line", async () => {
    const eml = text(`X-Long: ${"y".repeat(5000)}\r\nSubject: s\r\n\r\nb`);
    expect((await sniff(source(eml), "long.eml")).ok).toBe(true);
  });
});

describe("sniffFile reads the file on disk", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "pm-sniff-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("sniffs a stored temp file", async () => {
    const file = path.join(dir, "upload");
    await writeFile(file, zip(XLSX));
    const result = await sniffFile(file, "Budget.xlsx");
    expect(result.ok).toBe(true);
  });
});
