import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mirrorUploads, restoreSources, restoreUploads } from "../uploads-mirror";

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
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/** Overwrites a stored file with other bytes, keeping its hash name (disk damage, a user's edit). */
function damage(dir: string, rel: string, bytes = "damaged") {
  fs.writeFileSync(path.join(dir, rel), bytes);
}

/** Makes reading one folder fail as a share or a disk would (EACCES, EIO). */
function unreadable(dir: string, code: string) {
  const readdir = fs.promises.readdir;
  vi.spyOn(fs.promises, "readdir").mockImplementation(((p: fs.PathLike, ...rest: unknown[]) =>
    path.resolve(String(p)) === path.resolve(dir)
      ? Promise.reject(Object.assign(new Error(`${code}: ${String(p)}`), { code }))
      : (readdir as (...a: unknown[]) => Promise<unknown>)(p, ...rest)) as typeof readdir);
}

describe("mirrorUploads (ADR-0026 §9)", () => {
  it("copies stored files into the same shards", async () => {
    const a = store(src, "alpha");
    const b = store(src, "beta");
    expect(await mirrorUploads(src, dest)).toEqual({ copied: 2, damaged: [] });
    expect(fs.readFileSync(path.join(dest, a), "utf8")).toBe("alpha");
    expect(fs.readFileSync(path.join(dest, b), "utf8")).toBe("beta");
  });

  it("copies only what the copy folder lacks, and never deletes there", async () => {
    store(src, "alpha");
    await mirrorUploads(src, dest);
    const kept = store(dest, "swept from the app but still in the copy");
    store(src, "new");
    expect((await mirrorUploads(src, dest)).copied).toBe(1);
    expect(fs.existsSync(path.join(dest, kept))).toBe(true);
    expect((await mirrorUploads(src, dest)).copied).toBe(0);
  });

  it("skips temp files of running uploads and anything not a stored hash", async () => {
    fs.mkdirSync(path.join(src, ".tmp"));
    fs.writeFileSync(path.join(src, ".tmp", "upload-in-progress"), "x");
    fs.writeFileSync(path.join(src, "README.txt"), "x");
    fs.mkdirSync(path.join(src, "ab", "cd"), { recursive: true });
    fs.writeFileSync(path.join(src, "ab", "cd", "notes.txt"), "x");
    expect((await mirrorUploads(src, dest)).copied).toBe(0);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("leaves no partial file behind once done", async () => {
    store(src, "alpha");
    await mirrorUploads(src, dest);
    const all = fs.readdirSync(dest, { recursive: true }).map(String);
    expect(all.some((p) => p.endsWith(".partial"))).toBe(false);
  });

  it("never copies a source file whose bytes no longer match its name", async () => {
    const good = store(src, "alpha");
    const bad = store(src, "beta");
    damage(src, bad);
    const result = await mirrorUploads(src, dest);
    expect(result).toEqual({ copied: 1, damaged: [bad.split(path.sep).join("/")] });
    expect(fs.existsSync(path.join(dest, good))).toBe(true);
    expect(fs.existsSync(path.join(dest, bad))).toBe(false);
    const all = fs.readdirSync(dest, { recursive: true }).map(String);
    expect(all.some((p) => p.endsWith(".partial"))).toBe(false);
  });

  it("fails when the uploads folder is missing, so a backup is not reported complete", async () => {
    await expect(mirrorUploads(path.join(root, "absent"), dest)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["EACCES", "EIO"])("fails when a shard cannot be read (%s)", async (code) => {
    const rel = store(src, "alpha");
    unreadable(path.join(src, path.dirname(rel)), code);
    await expect(mirrorUploads(src, dest)).rejects.toMatchObject({ code });
  });
});

describe("restore: files back after the database (ADR-0026 §9)", () => {
  it("looks next to the chosen backup first, then in the copy folder, each once", () => {
    const copyDir = path.join(root, "OneDrive", "Project Manager Backups");
    const share = path.join(root, "Share");
    expect(restoreSources(path.join(share, "ProjectManager_x.bak"), copyDir)).toEqual([
      path.join(share, "Uploads"),
      path.join(copyDir, "Uploads"),
    ]);
    expect(restoreSources(path.join(copyDir, "ProjectManager_x.bak"), copyDir)).toEqual([
      path.join(copyDir, "Uploads"),
    ]);
  });

  it("copies back only the files the uploads folder lacks, from every source", async () => {
    const copy = path.join(root, "Copy", "Uploads");
    const share = path.join(root, "Share", "Uploads");
    const kept = store(src, "still here");
    store(copy, "still here");
    const fromCopy = store(copy, "from the copy folder");
    const fromShare = store(share, "from the share");
    expect(await restoreUploads([share, copy, path.join(root, "absent")], src)).toEqual({
      copied: 2,
      damaged: [],
    });
    expect(fs.readFileSync(path.join(src, fromCopy), "utf8")).toBe("from the copy folder");
    expect(fs.readFileSync(path.join(src, fromShare), "utf8")).toBe("from the share");
    expect(fs.readFileSync(path.join(src, kept), "utf8")).toBe("still here");
  });

  it("replaces a damaged file in the uploads folder with the intact backup copy", async () => {
    const copy = path.join(root, "Copy", "Uploads");
    const rel = store(copy, "the real bytes");
    store(src, "the real bytes");
    damage(src, rel);
    expect(await restoreUploads([copy], src)).toEqual({ copied: 1, damaged: [] });
    expect(fs.readFileSync(path.join(src, rel), "utf8")).toBe("the real bytes");
  });

  it("takes the intact copy from a later source, and names files no source has intact", async () => {
    const share = path.join(root, "Share", "Uploads");
    const copy = path.join(root, "Copy", "Uploads");
    const saved = store(share, "damaged on the share only");
    damage(share, saved);
    store(copy, "damaged on the share only");
    const lost = store(share, "damaged everywhere");
    damage(share, lost);
    store(copy, "damaged everywhere");
    damage(copy, lost, "also damaged");

    const result = await restoreUploads([share, copy], src);
    expect(result).toEqual({ copied: 1, damaged: [lost.split(path.sep).join("/")] });
    expect(fs.readFileSync(path.join(src, saved), "utf8")).toBe("damaged on the share only");
    expect(fs.existsSync(path.join(src, lost))).toBe(false);
  });

  it("fails on a source folder that is there but cannot be read", async () => {
    const copy = path.join(root, "Copy", "Uploads");
    store(copy, "alpha");
    unreadable(copy, "EACCES");
    await expect(restoreUploads([copy], src)).rejects.toMatchObject({ code: "EACCES" });
  });
});
