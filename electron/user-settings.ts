import fs from "fs";
import os from "os";
import path from "path";

/** Per-Windows-user preferences (machine-wide settings live in machine.json). */
export interface UserSettings {
  /** Where each backup is copied (should be off this disk: OneDrive, share, USB). */
  backupCopyDir: string;
  trayHintShown: boolean;
}

function defaultCopyDir(): string {
  const oneDrive = process.env.OneDriveCommercial || process.env.OneDrive || process.env.OneDriveConsumer;
  if (oneDrive && fs.existsSync(oneDrive)) return path.join(oneDrive, "Project Manager Backups");
  return path.join(os.homedir(), "Documents", "Project Manager Backups");
}

export class SettingsStore {
  private readonly file: string;
  private data: UserSettings;

  constructor(dir: string) {
    this.file = path.join(dir, "settings.json");
    this.data = { backupCopyDir: defaultCopyDir(), trayHintShown: false };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8")) as Partial<UserSettings>;
      this.data = { ...this.data, ...parsed };
    } catch {
      /* first run or unreadable: defaults are safe, nothing secret lives here */
    }
  }

  get(): UserSettings {
    return { ...this.data };
  }

  set(patch: Partial<UserSettings>): void {
    this.data = { ...this.data, ...patch };
    // Atomic replace: a power cut mid-write can't leave a truncated file.
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf-8");
    fs.renameSync(tmp, this.file);
  }
}
