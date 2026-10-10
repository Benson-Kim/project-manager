import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEMP_DIR } from "../files/store";
import { sweepOrphanFiles } from "../files/sweep";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T12:00:00Z");
const hashOf = (s: string) => createHash("sha256").update(s).digest("hex");

let root: string;

async function stored(content: string, ageDays: number): Promise<string> {
  const hash = hashOf(content);
  const dir = path.join(root, hash.slice(0, 2), hash.slice(2, 4));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, hash);
  await writeFile(file, content);
  const t = new Date(NOW.getTime() - ageDays * DAY);
  await utimes(file, t, t);
  return hash;
}

async function exists(hash: string): Promise<boolean> {
  const dir = path.join(root, hash.slice(0, 2), hash.slice(2, 4));
  return (await readdir(dir).catch((): string[] => [])).includes(hash);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "pm-sweep-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("sweepOrphanFiles (ADR-0026 §5)", () => {
  it("deletes old unreferenced files and keeps retained or recent ones", async () => {
    const live = await stored("live", 400);
    const orphan = await stored("orphan", 31);
    const fresh = await stored("fresh orphan", 1);

    const result = await sweepOrphanFiles(root, new Set([live]), { graceDays: 30, now: NOW });

    expect(result).toEqual({ deleted: 1, kept: 2, tempDeleted: 0 });
    expect(await exists(live)).toBe(true);
    expect(await exists(orphan)).toBe(false);
    expect(await exists(fresh)).toBe(true);
  });

  it("removes temp files older than a day, keeps an upload in progress", async () => {
    await mkdir(path.join(root, TEMP_DIR));
    const old = path.join(root, TEMP_DIR, "aborted");
    const current = path.join(root, TEMP_DIR, "receiving");
    await writeFile(old, "x");
    await writeFile(current, "y");
    const t = new Date(NOW.getTime() - 2 * DAY);
    await utimes(old, t, t);
    const recent = new Date(NOW.getTime() - 60_000);
    await utimes(current, recent, recent);

    const result = await sweepOrphanFiles(root, new Set(), { now: NOW });
    expect(result.tempDeleted).toBe(1);
    expect(await readdir(path.join(root, TEMP_DIR))).toEqual(["receiving"]);
  });

  it("touches only hash-named files in matching shards", async () => {
    const hash = hashOf("misplaced");
    const old = new Date(NOW.getTime() - 90 * DAY);
    const strays = [
      path.join(root, "README.txt"),
      path.join(root, "zz", "yy", hash),
      path.join(root, "00", "00", hash), // a hash outside its own shard
      path.join(root, hash.slice(0, 2), hash.slice(2, 4), "notes.txt"),
    ];
    for (const file of strays) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "keep me");
      await utimes(file, old, old);
    }
    const result = await sweepOrphanFiles(root, new Set(), { now: NOW });
    expect(result).toEqual({ deleted: 0, kept: 0, tempDeleted: 0 });
    for (const file of strays) {
      expect(await readdir(path.dirname(file))).toContain(path.basename(file));
    }
  });

  it("copes with a missing or empty root", async () => {
    expect(await sweepOrphanFiles(path.join(root, "absent"), new Set(), { now: NOW })).toEqual({
      deleted: 0,
      kept: 0,
      tempDeleted: 0,
    });
  });
});
