import fs from "fs";
import path from "path";

/**
 * Minimal rotating file logger. A packaged GUI app has no console, so without
 * this a failure on the client's machine leaves nothing to diagnose.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
  readonly file: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function rotate(file: string): void {
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = `${file}.${i}`;
    if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i + 1}`);
  }
  fs.renameSync(file, `${file}.1`);
}

/**
 * A console that has gone away (a closed pipe) reports EPIPE as an 'error'
 * event. Unhandled, that is an uncaughtException, which main.ts logs, to the
 * console again: an endless loop that wrote 750 MB of log in minutes. The file
 * is the log; the console is best effort.
 */
let consoleGuarded = false;
function guardConsole(): void {
  if (consoleGuarded) return;
  consoleGuarded = true;
  process.stdout.on("error", () => undefined);
  process.stderr.on("error", () => undefined);
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export function createLogger(dir: string, name = "main.log", maxBytes = MAX_BYTES): Logger {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  guardConsole();
  let size = sizeOf(file);

  const write = (level: string, message: string) => {
    const line = `${new Date().toISOString()} ${level} ${message}\n`;
    const bytes = Buffer.byteLength(line);
    // Rotate while running too: the app runs for weeks in the tray.
    if (size > 0 && size + bytes > maxBytes) {
      size = 0; // when the rename fails (file locked), retry after another maxBytes
      try {
        rotate(file);
      } catch {
        /* keep appending to the current file */
      }
    }
    try {
      fs.appendFileSync(file, line);
      size += bytes;
    } catch {
      /* disk full / locked — never crash the app over logging */
    }
    try {
      if (level === "ERROR") process.stderr.write(line);
      else process.stdout.write(line);
    } catch {
      /* no console */
    }
  };

  return {
    file,
    info: (m) => write("INFO ", m),
    warn: (m) => write("WARN ", m),
    error: (m, err) => write("ERROR", err === undefined ? m : `${m}: ${describeError(err)}`),
  };
}

/** Logger for code that may also run outside Electron (integration tests). */
export const consoleLogger: Logger = {
  file: "",
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m, err) => console.error(err === undefined ? m : `${m}: ${describeError(err)}`),
};
