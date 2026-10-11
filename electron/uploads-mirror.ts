import fs from "fs/promises";
import path from "path";

/**
 * Attachment backups for the desktop edition (ADR-0026 §9). Stored files are
 * named by their SHA-256 and never change, so mirroring = copying the ones the
 * copy folder lacks; nothing is ever overwritten or deleted there (a restore
 * may still need bytes the app has since swept). Only the hash shards are
 * copied: <src>/<h0h1>/<h2h3>/<hash>; temp files of running uploads are not.
 * Each file lands under a temporary name first, so an interrupted copy never
 * leaves a truncated file that a later run would take as done.
 */
const SHARD = /^[0-9a-f]{2}$/;
const HASH = /^[0-9a-f]{64}$/;

export async function mirrorUploads(sourceDir: string, targetDir: string): Promise<number> {
  let copied = 0;
  for (const a of await subdirs(sourceDir)) {
    for (const b of await subdirs(path.join(sourceDir, a))) {
      const shard = path.join(sourceDir, a, b);
      for (const name of await files(shard)) {
        if (!HASH.test(name) || !name.startsWith(a + b)) continue;
        const dest = path.join(targetDir, a, b, name);
        if (await exists(dest)) continue;
        await fs.mkdir(path.dirname(dest), { recursive: true });
        const partial = `${dest}.partial`;
        await fs.copyFile(path.join(shard, name), partial);
        await fs.rename(partial, dest);
        copied++;
      }
    }
  }
  return copied;
}

/**
 * Where a restore finds attachment files: next to the chosen .bak (a backup
 * copy folder keeps them in <folder>\Uploads), then in this user's copy
 * folder. Each folder once, in that order.
 */
export function restoreSources(bakFile: string, copyDir: string): string[] {
  const candidates = [path.join(path.dirname(bakFile), "Uploads"), path.join(copyDir, "Uploads")];
  const key = (dir: string) => path.resolve(dir).toLowerCase();
  return candidates.filter((dir, i) => candidates.findIndex((d) => key(d) === key(dir)) === i);
}

/**
 * After a database restore: copy back every attachment file the uploads
 * folder lacks (the .bak holds only the rows). Returns how many were copied.
 */
export async function restoreUploads(sources: string[], uploadsDir: string): Promise<number> {
  let copied = 0;
  for (const dir of sources) copied += await mirrorUploads(dir, uploadsDir);
  return copied;
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && SHARD.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

async function files(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
