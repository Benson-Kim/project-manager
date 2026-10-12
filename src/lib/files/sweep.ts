import { lstat, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { TEMP_DIR } from "./store";

/**
 * The orphan sweep (ADR-0026 §5). Removing an attachment only soft-deletes its
 * row, and identical bytes are shared, so stored files are deleted here, later:
 * a file goes when no row in `retained` (live, or deleted within the grace
 * period — usp_FileAttachment_ListRetained) uses its hash AND it is older than
 * the grace period (an upload may have been stored a moment before its row).
 * Temp files from aborted uploads older than a day go too.
 *
 * It deletes only regular files whose names are exactly hashes inside the
 * <h0h1>/<h2h3> shards (or anything in .tmp), never a folder, and it never
 * follows links. Scheduling it is F2's. Server only.
 */

export const SWEEP_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHARD = /^[0-9a-f]{2}$/;
const HASH = /^[0-9a-f]{64}$/;

export interface SweepResult {
  /** Stored files deleted. */
  deleted: number;
  /** Stored files kept (in use, or too recent to judge). */
  kept: number;
  /** Abandoned temp files deleted. */
  tempDeleted: number;
}

export async function sweepOrphanFiles(
  root: string,
  retained: ReadonlySet<string>,
  { graceDays = SWEEP_GRACE_DAYS, now = new Date() }: { graceDays?: number; now?: Date } = {},
): Promise<SweepResult> {
  const cutoff = now.getTime() - graceDays * DAY_MS;
  const result: SweepResult = { deleted: 0, kept: 0, tempDeleted: 0 };

  for (const a of await dirNames(root)) {
    if (!SHARD.test(a)) continue;
    for (const b of await dirNames(path.join(root, a))) {
      if (!SHARD.test(b)) continue;
      const shard = path.join(root, a, b);
      for (const name of await fileNames(shard)) {
        if (!HASH.test(name) || !name.startsWith(a + b)) continue;
        const file = path.join(shard, name);
        if (retained.has(name) || (await modifiedAt(file)) > cutoff) {
          result.kept++;
        } else if (await remove(file)) {
          result.deleted++;
        }
      }
    }
  }

  const temp = path.join(/* turbopackIgnore: true */ root, TEMP_DIR);
  for (const name of await fileNames(temp)) {
    const file = path.join(temp, name);
    if ((await modifiedAt(file)) < now.getTime() - DAY_MS && (await remove(file))) {
      result.tempDeleted++;
    }
  }
  return result;
}

async function dirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function fileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Modification time in ms; +Infinity when unreadable, so the file is kept. */
async function modifiedAt(file: string): Promise<number> {
  try {
    const stat = await lstat(file);
    return stat.isFile() ? stat.mtimeMs : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function remove(file: string): Promise<boolean> {
  try {
    await unlink(file);
    return true;
  } catch {
    return false; // in use (a download on Windows) or already gone: the next sweep retries
  }
}
