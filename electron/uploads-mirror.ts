import { createHash } from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";

/**
 * Attachment backups for the desktop edition (ADR-0026 §9). Stored files are
 * named by their SHA-256 and never change, so mirroring = copying the ones the
 * copy folder lacks; nothing is ever overwritten or deleted there (a restore
 * may still need bytes the app has since swept). Only the hash shards are
 * copied: <src>/<h0h1>/<h2h3>/<hash>; temp files of running uploads are not.
 * Each file lands under a temporary name first and is kept only when its bytes
 * hash to its name, so neither an interrupted copy nor a damaged source leaves
 * a file that a later run would take as good. A folder that cannot be read
 * fails the run: an empty listing would pass for "nothing new to copy".
 */
const SHARD = /^[0-9a-f]{2}$/;
const HASH = /^[0-9a-f]{64}$/;

export interface MirrorOptions {
  /** Hash the target's existing files too, and replace those whose bytes changed (restore). */
  replaceDamaged?: boolean;
}

export interface MirrorResult {
  /** Files copied: missing from the target, or replacing a damaged copy there. */
  copied: number;
  /** Source files whose bytes do not hash to their name ("ab/cd/abcd..."), not copied. */
  damaged: string[];
}

export async function mirrorUploads(
  sourceDir: string,
  targetDir: string,
  { replaceDamaged = false }: MirrorOptions = {},
): Promise<MirrorResult> {
  const result: MirrorResult = { copied: 0, damaged: [] };
  for (const a of await subdirs(sourceDir)) {
    for (const b of await subdirs(path.join(sourceDir, a))) {
      const shard = path.join(sourceDir, a, b);
      for (const name of await files(shard)) {
        if (!HASH.test(name) || !name.startsWith(a + b)) continue;
        const dest = path.join(targetDir, a, b, name);
        if ((await exists(dest)) && (!replaceDamaged || (await sha256Of(dest)) === name)) continue;
        await fs.mkdir(path.dirname(dest), { recursive: true });
        const partial = `${dest}.partial`;
        await fs.copyFile(path.join(shard, name), partial);
        if ((await sha256Of(partial)) !== name) {
          await fs.unlink(partial);
          result.damaged.push(`${a}/${b}/${name}`);
          continue;
        }
        await fs.rename(partial, dest);
        result.copied++;
      }
    }
  }
  return result;
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
 * folder lacks or holds damaged (the .bak holds only the rows). A source
 * folder that is not there is skipped; one that cannot be read fails.
 * `damaged` lists the files no source had intact.
 */
export async function restoreUploads(sources: string[], uploadsDir: string): Promise<MirrorResult> {
  let copied = 0;
  const damaged = new Set<string>();
  for (const dir of sources) {
    if (!(await exists(dir))) continue;
    const result = await mirrorUploads(dir, uploadsDir, { replaceDamaged: true });
    copied += result.copied;
    for (const file of result.damaged) damaged.add(file);
  }
  const unrestored: string[] = [];
  for (const file of damaged) {
    // A later source may have had it intact.
    const restored = path.join(uploadsDir, ...file.split("/"));
    if (!(await exists(restored)) || (await sha256Of(restored)) !== path.basename(file)) {
      unrestored.push(file);
    }
  }
  return { copied, damaged: unrestored };
}

async function subdirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && SHARD.test(e.name)).map((e) => e.name);
}

async function files(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

/** False only when it is not there; any other error (access, I/O) is thrown. */
async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
