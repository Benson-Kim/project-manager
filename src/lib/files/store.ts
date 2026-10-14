import { createHash, randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { access, lstat, mkdir, rename, statfs, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { Transform } from "node:stream";
import { finished } from "node:stream/promises";
import { getUploadsEnv, uploadsEnabled } from "@/lib/env";

/**
 * Attachment storage on disk (ADR-0026 §3, STANDARDS §4). Server only — kept
 * out of client bundles by src/tests/file-storage-boundaries.test.ts.
 *
 *   <root>/.tmp/<uuid>              an upload being received
 *   <root>/<h0h1>/<h2h3>/<sha256>   stored bytes, named by their hash
 *
 * Identical bytes share one stored file; SQL Server keeps the metadata.
 */

/**
 * Temp files live under the root so committing is a rename on one volume.
 * Every path.join(root, TEMP_DIR) carries turbopackIgnore: with `root` unknown
 * at build time, output tracing reads it as "<any folder>/.tmp" and copies such
 * folders from the build machine into the standalone server.
 */
export const TEMP_DIR = ".tmp";

const HASH = /^[0-9a-f]{64}$/;

let checkedRoot: string | null = null;

/** Uploads are switched off here (UPLOADS_ENABLED=false, ADR-0026 §9). */
export class UploadsDisabledError extends Error {
  constructor() {
    super("Uploads are switched off on this installation");
    this.name = "UploadsDisabledError";
  }
}

/**
 * UPLOADS_DIR, created and checked writable on first use (not at build time).
 * Throws when the folder cannot be written: the handler logs it and answers 500.
 * Throws UploadsDisabledError when uploads are off, before touching any folder.
 */
export async function uploadsRoot(): Promise<string> {
  if (!uploadsEnabled()) throw new UploadsDisabledError();
  const root = getUploadsEnv().UPLOADS_DIR;
  if (checkedRoot === root) return root;
  await mkdir(path.join(/* turbopackIgnore: true */ root, TEMP_DIR), { recursive: true });
  await access(root, constants.W_OK);
  checkedRoot = root;
  return root;
}

/**
 * UPLOADS_DIR for reading stored files: neither created nor checked writable,
 * and still answered when uploads are switched off, so files stored earlier stay
 * downloadable from a read-only or switched-off uploads folder.
 */
export function storedFilesRoot(): string {
  return getUploadsEnv().UPLOADS_DIR;
}

/** Bytes this process may still write on the disk that holds `dir`. */
export async function freeBytes(dir: string): Promise<number> {
  const disk = await statfs(dir);
  return disk.bavail * disk.bsize;
}

/** The stored file's path relative to the root: "ab/cd/abcd…". */
export function storagePathOf(sha256: string): string {
  if (!HASH.test(sha256)) throw new Error("Not a SHA-256 hex digest");
  return `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;
}

/**
 * The absolute path of a stored file. Accepts only the exact
 * "<h0h1>/<h2h3>/<hash>" shape (the database CHECK enforces the same), so no
 * stored value can point outside the root.
 */
export function resolveStoredFile(root: string, storagePath: string): string {
  const [a, b, hash, ...rest] = storagePath.split("/");
  if (rest.length > 0 || !hash || storagePathOf(hash) !== `${a}/${b}/${hash}`) {
    throw new Error("Not a storage path");
  }
  return path.join(root, a!, b!, hash);
}

export interface ReceivedUpload {
  tempPath: string;
  sha256: string;
  size: number;
}

export class UploadTooLargeError extends Error {
  constructor() {
    super("The upload is larger than the limit");
    this.name = "UploadTooLargeError";
  }
}

/**
 * Stream a request body into a temp file, hashing and counting as it goes.
 * Stops reading as soon as the body passes `maxBytes` (UploadTooLargeError),
 * so an oversized upload never fills the disk. The temp file is removed on
 * any failure.
 */
export async function receiveUpload(
  body: ReadableStream<Uint8Array>,
  root: string,
  maxBytes: number,
): Promise<ReceivedUpload> {
  const tempPath = path.join(/* turbopackIgnore: true */ root, TEMP_DIR, randomUUID());
  const out = createWriteStream(tempPath, { flags: "wx" });
  const hash = createHash("sha256");
  const reader = body.getReader();
  let size = 0;
  try {
    await once(out, "open");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new UploadTooLargeError();
      }
      hash.update(value);
      if (!out.write(value)) await once(out, "drain");
    }
    out.end();
    await once(out, "finish");
    return { tempPath, sha256: hash.digest("hex"), size };
  } catch (err) {
    // Close the handle before unlinking (Windows refuses to delete an open file);
    // finished() also settles when the stream had already closed.
    out.destroy();
    await finished(out).catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw err;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Move a received upload to its hash-named place and return its storage path.
 * When the same bytes are already stored (dedupe), the temp file is dropped.
 */
export async function commitUpload(root: string, upload: ReceivedUpload): Promise<string> {
  const storagePath = storagePathOf(upload.sha256);
  const dest = resolveStoredFile(root, storagePath);
  await mkdir(path.dirname(dest), { recursive: true });
  if (await reuseStored(dest, upload.size)) {
    await discardUpload(upload);
    return storagePath;
  }
  try {
    await rename(upload.tempPath, dest);
  } catch (err) {
    // A parallel upload of the same bytes won the race (or Windows holds the
    // existing file open for a download): the stored copy is identical.
    if (!(await reuseStored(dest, upload.size))) throw err;
    await discardUpload(upload);
  }
  return storagePath;
}

/**
 * Whether a stored file can stand in for the upload (dedupe). It must be a
 * regular file of the upload's size: anything else is replaced by the upload.
 * Its modification time is set to now, because the orphan sweep judges age by
 * it (sweep.ts): an orphan reused today must not be deleted for being old while
 * its new row is being written. Checked again after touching it, in case the
 * sweep removed it in between.
 */
async function reuseStored(file: string, size: number): Promise<boolean> {
  if ((await sizeOf(file)) !== size) return false;
  const now = new Date();
  // Best effort: a scanner or a download may hold the file; it is still identical.
  await utimes(file, now, now).catch(() => undefined);
  return (await sizeOf(file)) === size;
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    const info = await lstat(file);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

export async function discardUpload(upload: Pick<ReceivedUpload, "tempPath">): Promise<void> {
  await unlink(upload.tempPath).catch(() => undefined);
}

/** A stored file's bytes no longer hash to the name they were stored under. */
export class StoredFileChangedError extends Error {
  constructor() {
    super("The stored bytes do not match their SHA-256");
    this.name = "StoredFileChangedError";
  }
}

/**
 * A pass-through for a download that hashes what it streams and fails at the
 * end when the bytes are not `sha256`: changed or damaged on disk (a desktop
 * user can write the Uploads folder; a disk or a scanner can damage a file).
 * The last chunk is held back until the hash is known, so a client never gets
 * a complete copy of wrong bytes: the response ends short of its
 * Content-Length and the browser marks the download failed.
 */
export function verifySha256(sha256: string): Transform {
  const hash = createHash("sha256");
  let held: Buffer | null = null;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      const previous = held;
      held = chunk;
      done(null, previous);
    },
    flush(done) {
      if (hash.digest("hex") !== sha256) {
        done(new StoredFileChangedError());
        return;
      }
      done(null, held);
    },
  });
}
