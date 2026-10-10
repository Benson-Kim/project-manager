import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mirrorUploads } from "../uploads-mirror";

let root: string;
let src: string;
let dest: string;

function store(dir: string, content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  const shard = path.join(dir, hash.slice(0, 2), hash.slice(2, 4));
  fs.mkdirSync(shard, { recursive: true });
  fs.writeFileSync(path.join(shard, hash), content);
  return path.join(hash.slice(0, 2), hash.slice(2, 4), hash);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mirror-"));
  src = path.join(root, "Uploads");
  dest = path.join(root, "OneDrive", "Uploads");
  fs.mkdirSync(src);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("mirrorUploads (ADR-0026 §9)", () => {
  it("copies stored files into the same shards", async () => {
    const a = store(src, "alpha");
    const b = store(src, "beta");
    expect(await mirrorUploads(src, dest)).toBe(2);
    expect(fs.readFileSync(path.join(dest, a), "utf8")).toBe("alpha");
    expect(fs.readFileSync(path.join(dest, b), "utf8")).toBe("beta");
  });

  it("copies only what the copy folder lacks, and never deletes there", async () => {
    store(src, "alpha");
    await mirrorUploads(src, dest);
    const kept = store(dest, "swept from the app but still in the copy");
    store(src, "new");
    expect(await mirrorUploads(src, dest)).toBe(1);
    expect(fs.existsSync(path.join(dest, kept))).toBe(true);
    expect(await mirrorUploads(src, dest)).toBe(0);
  });

  it("skips temp files of running uploads and anything not a stored hash", async () => {
    fs.mkdirSync(path.join(src, ".tmp"));
    fs.writeFileSync(path.join(src, ".tmp", "upload-in-progress"), "x");
    fs.writeFileSync(path.join(src, "README.txt"), "x");
    fs.mkdirSync(path.join(src, "ab", "cd"), { recursive: true });
    fs.writeFileSync(path.join(src, "ab", "cd", "notes.txt"), "x");
    expect(await mirrorUploads(src, dest)).toBe(0);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("leaves no partial file behind once done", async () => {
    store(src, "alpha");
    await mirrorUploads(src, dest);
    const all = fs.readdirSync(dest, { recursive: true }).map(String);
    expect(all.some((p) => p.endsWith(".partial"))).toBe(false);
  });

  it("does nothing when there is no uploads folder yet", async () => {
    expect(await mirrorUploads(path.join(root, "absent"), dest)).toBe(0);
  });
});
