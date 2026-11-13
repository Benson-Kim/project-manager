import fs from "fs";
import path from "path";

export const APP_NAME = "Modulus";
export const LEGACY_NAME = "Project Manager";
export const APP_ID = "com.eliandigitalsolutions.modulus";

type Exists = (file: string) => boolean;

/**
 * The machine-wide folder. A PC set up before the rename keeps its old folder until IT runs the
 * setup again, and only an administrator can move it, so the app reads whichever one has a config.
 */
export function programDataDir(
  root = process.env.ProgramData ?? "C:\\ProgramData",
  exists: Exists = fs.existsSync,
): string {
  const current = path.join(root, APP_NAME);
  const legacy = path.join(root, LEGACY_NAME);
  if (exists(path.join(current, "machine.json"))) return current;
  if (exists(path.join(legacy, "machine.json"))) return legacy;
  return current;
}

/** Where backup copies go under OneDrive or Documents; a user who already has old copies keeps them there. */
export function backupCopyDir(base: string, exists: Exists = fs.existsSync): string {
  const current = path.join(base, `${APP_NAME} Backups`);
  const legacy = path.join(base, `${LEGACY_NAME} Backups`);
  return !exists(current) && exists(legacy) ? legacy : current;
}

const CHROMIUM_CACHES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "blob_storage",
  "Crashpad",
]);

/**
 * Copies this user's old profile folder once, before anything opens the new one, leaving the old
 * folder for a rollback. It copies into a side folder and renames it only when the copy is whole.
 * Returns why it failed, for the log; the app then starts with fresh settings.
 */
export function carryOverProfile(appData: string): string | null {
  const current = path.join(appData, APP_NAME);
  const legacy = path.join(appData, LEGACY_NAME);
  if (fs.existsSync(current) || !fs.existsSync(legacy)) return null;
  const partial = `${current}.copying`;
  try {
    fs.rmSync(partial, { recursive: true, force: true });
    fs.cpSync(legacy, partial, {
      recursive: true,
      filter: (source) =>
        path.dirname(source) !== legacy || !CHROMIUM_CACHES.has(path.basename(source)),
    });
    fs.renameSync(partial, current);
    return null;
  } catch (error) {
    fs.rmSync(partial, { recursive: true, force: true });
    return error instanceof Error ? error.message : String(error);
  }
}
