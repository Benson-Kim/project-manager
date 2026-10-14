import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitUpload,
  discardUpload,
  freeBytes,
  receiveUpload,
  resolveStoredFile,
  storagePathOf,
  StoredFileChangedError,
  storedFilesRoot,
  TEMP_DIR,
  UploadsDisabledError,
  verifySha256,
  UploadTooLargeError,
  uploadsRoot,
} from "../files/store";

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** A body that arrives in the given chunks, recording whether it was cancelled. */
function body(chunks: Uint8Array[]) {
  let cancelled = false;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled, pulled: () => i };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "pm-store-"));
  await mkdir(path.join(root, TEMP_DIR));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("storage paths (ADR-0026 §3)", () => {
  const hash = sha("x");

  it("shards by the first two byte pairs of the hash", () => {
    expect(storagePathOf(hash)).toBe(`${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`);
  });

  it.each(["", "ABC", "g".repeat(64), "A".repeat(64), `${"a".repeat(63)}/`])(
    "refuses %j as a hash",
    (bad) => {
      expect(() => storagePathOf(bad)).toThrow();
    },
  );

  it("resolves only the exact shard/shard/hash shape inside the root", () => {
    expect(resolveStoredFile(root, storagePathOf(hash))).toBe(
      path.join(root, hash.slice(0, 2), hash.slice(2, 4), hash),
    );
    for (const bad of [
      `../${hash}`,
      `${hash.slice(0, 2)}/${hash.slice(2, 4)}/../../${hash}`,
      `zz/${hash.slice(2, 4)}/${hash}`,
      `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}/x`,
      `/etc/passwd`,
      `${hash.slice(0, 2)}\\${hash.slice(2, 4)}\\${hash}`,
    ]) {
      expect(() => resolveStoredFile(root, bad), bad).toThrow();
    }
  });
});

describe("receiveUpload", () => {
  it("streams to a temp file, hashing and counting", async () => {
    const chunks = [Buffer.from("hello "), Buffer.from("world")];
    const upload = await receiveUpload(body(chunks).stream, root, 1024);
    expect(upload.size).toBe(11);
    expect(upload.sha256).toBe(sha("hello world"));
    expect(path.dirname(upload.tempPath)).toBe(path.join(root, TEMP_DIR));
    expect(await readFile(upload.tempPath, "utf8")).toBe("hello world");
  });

  it("accepts exactly the cap", async () => {
    const upload = await receiveUpload(body([Buffer.alloc(10)]).stream, root, 10);
    expect(upload.size).toBe(10);
  });

  it("stops reading past the cap, cancels the body and leaves nothing behind", async () => {
    const b = body([Buffer.alloc(6), Buffer.alloc(6), Buffer.alloc(6), Buffer.alloc(6)]);
    await expect(receiveUpload(b.stream, root, 10)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(b.cancelled()).toBe(true);
    expect(b.pulled()).toBeLessThan(4);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("removes the temp file when the body fails mid-way", async () => {
    let sent = false;
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(Buffer.from("partial"));
        } else controller.error(new Error("connection reset"));
      },
    });
    await expect(receiveUpload(failing, root, 1024)).rejects.toThrow("connection reset");
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });
});

describe("commitUpload and dedupe", () => {
  it("moves the upload to its hash path", async () => {
    const upload = await receiveUpload(body([Buffer.from("abc")]).stream, root, 1024);
    const storagePath = await commitUpload(root, upload);
    expect(storagePath).toBe(storagePathOf(sha("abc")));
    expect(await readFile(resolveStoredFile(root, storagePath), "utf8")).toBe("abc");
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("keeps one stored copy of identical bytes", async () => {
    const first = await receiveUpload(body([Buffer.from("same")]).stream, root, 1024);
    const second = await receiveUpload(body([Buffer.from("same")]).stream, root, 1024);
    const a = await commitUpload(root, first);
    const b = await commitUpload(root, second);
    expect(a).toBe(b);
    const shard = path.dirname(resolveStoredFile(root, a));
    expect(await readdir(shard)).toEqual([sha("same")]);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("restarts the sweep's grace period on a reused file (an old orphan uploaded again)", async () => {
    const first = await receiveUpload(body([Buffer.from("again")]).stream, root, 1024);
    const stored = resolveStoredFile(root, await commitUpload(root, first));
    const longAgo = new Date("2026-01-01T00:00:00Z");
    await utimes(stored, longAgo, longAgo);

    const second = await receiveUpload(body([Buffer.from("again")]).stream, root, 1024);
    await commitUpload(root, second);
    expect((await stat(stored)).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("replaces a stored file whose size is not the upload's instead of trusting it", async () => {
    const upload = await receiveUpload(body([Buffer.from("genuine")]).stream, root, 1024);
    const stored = resolveStoredFile(root, storagePathOf(upload.sha256));
    await mkdir(path.dirname(stored), { recursive: true });
    await writeFile(stored, "planted bytes, longer than the upload");

    await commitUpload(root, upload);
    expect(await readFile(stored, "utf8")).toBe("genuine");
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("repairs a damaged stored file of the same size with the uploaded bytes", async () => {
    const upload = await receiveUpload(body([Buffer.from("genuine")]).stream, root, 1024);
    const stored = resolveStoredFile(root, storagePathOf(upload.sha256));
    await mkdir(path.dirname(stored), { recursive: true });
    await writeFile(stored, "damaged");

    await commitUpload(root, upload);
    expect(await readFile(stored, "utf8")).toBe("genuine");
    expect(sha(await readFile(stored))).toBe(upload.sha256);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });

  it("discardUpload removes a temp file and ignores a missing one", async () => {
    const upload = await receiveUpload(body([Buffer.from("x")]).stream, root, 1024);
    await discardUpload(upload);
    await discardUpload(upload);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual([]);
  });
});

describe("freeBytes", () => {
  it("reports the space left on the uploads disk", async () => {
    const free = await freeBytes(root);
    expect(Number.isSafeInteger(free)).toBe(true);
    expect(free).toBeGreaterThan(0);
  });
});

describe("verifySha256 (downloads)", () => {
  async function run(chunks: string[], expected: string) {
    const out: string[] = [];
    const verify = verifySha256(expected);
    verify.on("data", (c: Buffer) => out.push(c.toString()));
    const done = finished(verify);
    for (const c of chunks) verify.write(Buffer.from(c));
    verify.end();
    try {
      await done;
      return { out, error: null };
    } catch (error) {
      return { out, error };
    }
  }

  it("passes matching bytes through unchanged, across chunks", async () => {
    const r = await run(["ab", "cd", "ef"], sha("abcdef"));
    expect(r.error).toBeNull();
    expect(r.out.join("")).toBe("abcdef");
  });

  it("fails on other bytes and never emits the last chunk", async () => {
    const r = await run(["ab", "cd", "ef"], sha("abcdeX"));
    expect(r.error).toBeInstanceOf(StoredFileChangedError);
    expect(r.out.join("")).not.toContain("ef");
  });
});

describe("uploadsRoot", () => {
  it("creates UPLOADS_DIR and its temp folder on first use", async () => {
    const dir = path.join(root, "fresh", "uploads");
    vi.stubEnv("UPLOADS_DIR", dir);
    expect(await uploadsRoot()).toBe(dir);
    expect(await readdir(dir)).toEqual([TEMP_DIR]);
  });

  it("fails when UPLOADS_DIR is a file, not a folder", async () => {
    const file = path.join(root, "not-a-dir");
    await writeFile(file, "x");
    vi.stubEnv("UPLOADS_DIR", file);
    await expect(uploadsRoot()).rejects.toThrow();
  });

  it("refuses when uploads are off, without creating any folder (ADR-0026 §9)", async () => {
    const dir = path.join(root, "never", "uploads");
    vi.stubEnv("UPLOADS_DIR", dir);
    vi.stubEnv("UPLOADS_ENABLED", "false");
    await expect(uploadsRoot()).rejects.toBeInstanceOf(UploadsDisabledError);
    await expect(readdir(path.join(root, "never"))).rejects.toThrow();
  });
});

describe("storedFilesRoot (downloads)", () => {
  it("answers UPLOADS_DIR when uploads are off, creating nothing", () => {
    const dir = path.join(root, "kept", "uploads");
    vi.stubEnv("UPLOADS_DIR", dir);
    vi.stubEnv("UPLOADS_ENABLED", "false");
    expect(storedFilesRoot()).toBe(dir);
  });
});
