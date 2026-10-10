import { open } from "node:fs/promises";
import { extensionOf } from "@/lib/file-names";

/**
 * What an upload really is (ADR-0026 §4, STANDARDS §4): decided from its bytes,
 * never from its name or the browser's MIME type. The extension must then agree
 * with the bytes. No dependency: the formats are recognised by their magic
 * numbers, Office files by their ZIP central directory. Server only.
 */

export type SniffResult =
  { ok: true; contentType: string } | { ok: false; reason: "empty" | "type" };

/** Random access to the upload: the stored temp file, or a Buffer in tests. */
export interface ByteSource {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

const OFFICE = {
  ".docx": {
    folder: "word/",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".xlsx": {
    folder: "xl/",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  ".pptx": {
    folder: "ppt/",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
} as const;

const TEXT = {
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".eml": "message/rfc822",
} as const;

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // OLE compound file (.msg)

const startsWith = (bytes: Uint8Array, magic: readonly number[]) =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

const REFUSED: SniffResult = { ok: false, reason: "type" };

/** Sniff `source`, whose display name is `fileName`. */
export async function sniff(source: ByteSource, fileName: string): Promise<SniffResult> {
  if (source.size === 0) return { ok: false, reason: "empty" };
  const ext = extensionOf(fileName);
  const head = await source.read(0, Math.min(source.size, 16));

  if (startsWith(head, PDF)) return ext === ".pdf" ? accept("application/pdf") : REFUSED;
  if (startsWith(head, PNG)) return ext === ".png" ? accept("image/png") : REFUSED;
  if (startsWith(head, JPEG)) {
    return ext === ".jpg" || ext === ".jpeg" ? accept("image/jpeg") : REFUSED;
  }
  if (startsWith(head, ZIP)) {
    if (!(ext in OFFICE)) return REFUSED;
    const office = OFFICE[ext as keyof typeof OFFICE];
    return (await officeFolder(source)) === office.folder ? accept(office.contentType) : REFUSED;
  }
  if (startsWith(head, CFB)) {
    return ext === ".msg" ? accept("application/vnd.ms-outlook") : REFUSED;
  }
  if (ext in TEXT) {
    const firstLine = await readUtf8Text(source);
    if (firstLine === null) return REFUSED;
    if (ext === ".eml" && !/^[!-9;-~]+:[ \t]/.test(firstLine)) return REFUSED;
    return accept(TEXT[ext as keyof typeof TEXT]);
  }
  return REFUSED;
}

/** Sniff a file on disk (the received upload's temp file). */
export async function sniffFile(filePath: string, fileName: string): Promise<SniffResult> {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    return await sniff(
      {
        size,
        async read(offset, length) {
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, offset);
          return buffer.subarray(0, bytesRead);
        },
      },
      fileName,
    );
  } finally {
    await handle.close();
  }
}

function accept(contentType: string): SniffResult {
  return { ok: true, contentType };
}

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
/** An Office file's central directory is a few KB; refuse anything absurd. */
const MAX_CENTRAL_DIRECTORY = 4 * 1024 * 1024;

/**
 * Which Office part folder ("word/", "xl/" or "ppt/") a ZIP's central directory
 * lists, or null: not OOXML ([Content_Types].xml missing), more than one kind,
 * a macro project (vbaProject.bin — not allowed in .docx/.xlsx/.pptx), Zip64,
 * or a damaged directory.
 */
async function officeFolder(source: ByteSource): Promise<string | null> {
  // The end-of-central-directory record is 22 bytes plus a comment of at most 64 KB.
  const tailLength = Math.min(source.size, 22 + 0xffff);
  const tail = await source.read(source.size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null; // Zip64
  if (cdSize > MAX_CENTRAL_DIRECTORY || cdOffset + cdSize > source.size) return null;

  const cd = await source.read(cdOffset, cdSize);
  const decoder = new TextDecoder();
  const folders = new Set<string>();
  let contentTypes = false;
  let p = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > cd.length || u32(cd, p) !== CENTRAL_SIGNATURE) return null;
    const nameLength = u16(cd, p + 28);
    const extraLength = u16(cd, p + 30);
    const commentLength = u16(cd, p + 32);
    if (p + 46 + nameLength > cd.length) return null;
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLength));
    if (name === "[Content_Types].xml") contentTypes = true;
    if (/(^|\/)vbaProject\.bin$/i.test(name)) return null;
    for (const { folder } of Object.values(OFFICE))
      if (name.startsWith(folder)) folders.add(folder);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return contentTypes && folders.size === 1 ? [...folders][0]! : null;
}

/**
 * The whole file decoded as UTF-8 (a BOM is allowed): its first line, or null
 * when it is not valid UTF-8 or holds a NUL byte (binary data).
 */
async function readUtf8Text(source: ByteSource): Promise<string | null> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunk = 64 * 1024;
  let firstLine: string | null = null;
  let pending = "";
  try {
    for (let offset = 0; offset < source.size; offset += chunk) {
      const bytes = await source.read(offset, Math.min(chunk, source.size - offset));
      if (bytes.includes(0)) return null;
      const text = decoder.decode(bytes, { stream: true });
      if (firstLine === null) {
        pending += text;
        const end = pending.search(/\r?\n/);
        if (end >= 0) firstLine = pending.slice(0, end);
        else if (pending.length > 4096) firstLine = pending.slice(0, 4096);
      }
    }
    const rest = decoder.decode();
    if (firstLine === null) firstLine = pending + rest;
  } catch {
    return null;
  }
  return firstLine.replace(/^﻿/, "");
}
