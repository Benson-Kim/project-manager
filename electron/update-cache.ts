import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

/**
 * electron-updater builds each update from the installer it already has (only the changed
 * blocks are downloaded, about 1% of a release). Its base is installer.exe, which the NSIS
 * installer leaves in the updater's cache folder, described by current.blockmap. But
 * electron-updater 6.8 overwrites current.blockmap with every version it downloads, so once an
 * update has been downloaded and not installed, the two no longer match: the rebuilt installer
 * fails its checksum and the whole installer (~400 MB) is downloaded again, for every release
 * after that. Before each check the blockmap is put back to the one describing installer.exe.
 */
const BASE_INSTALLER = "installer.exe";
const BASE_BLOCKMAP = "current.blockmap";
const KEPT_BLOCKMAP = "installed.blockmap";

export type BaseState = "kept" | "restored" | "removed" | "no-base";

/** electron-updater's cache folder, from the feed file (resources/app-update.yml). */
export function updaterCacheDir(
  feedYml: string,
  localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
): string | null {
  const name = /^updaterCacheDirName:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(feedYml)?.[1];
  return name ? path.join(localAppData, name) : null;
}

/** Size of the installer a gzipped blockmap describes; null when the data is not a blockmap. */
export function describedSize(gzipped: Buffer): number | null {
  try {
    const map = JSON.parse(zlib.gunzipSync(gzipped).toString("utf8")) as {
      files?: { offset?: unknown; sizes?: unknown }[];
    };
    const file = map.files?.[0];
    if (!file || !Array.isArray(file.sizes)) return null;
    let total = typeof file.offset === "number" ? file.offset : 0;
    for (const size of file.sizes) {
      if (typeof size !== "number") return null;
      total += size;
    }
    return total;
  } catch {
    return null;
  }
}

/**
 * Makes current.blockmap describe installer.exe again: keeps it (and a copy) when it does,
 * restores the copy when it does not, and removes it when there is no matching copy, so
 * electron-updater fetches the running version's blockmap from its release instead.
 */
export function alignDifferentialBase(cacheDir: string): BaseState {
  const size = fileSize(path.join(cacheDir, BASE_INSTALLER));
  if (size === null) return "no-base";
  const current = path.join(cacheDir, BASE_BLOCKMAP);
  const kept = path.join(cacheDir, KEPT_BLOCKMAP);
  if (describes(current, size)) {
    if (!describes(kept, size)) fs.copyFileSync(current, kept);
    return "kept";
  }
  if (describes(kept, size)) {
    fs.copyFileSync(kept, current);
    return "restored";
  }
  fs.rmSync(current, { force: true });
  return "removed";
}

function fileSize(file: string): number | null {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
}

function describes(blockmap: string, installerSize: number): boolean {
  try {
    return describedSize(fs.readFileSync(blockmap)) === installerSize;
  } catch {
    return false;
  }
}
