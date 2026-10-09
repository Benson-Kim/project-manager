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

function rotate(file: string): void {
  try {
    if (fs.statSync(file).size < MAX_BYTES) return;
  } catch {
    return;
  }
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = `${file}.${i}`;
    if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i + 1}`);
  }
  fs.renameSync(file, `${file}.1`);
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export function createLogger(dir: string, name = "main.log"): Logger {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  rotate(file);

  const write = (level: string, message: string) => {
    const line = `${new Date().toISOString()} ${level} ${message}\n`;
    try {
      fs.appendFileSync(file, line);
    } catch {
      /* disk full / locked — never crash the app over logging */
    }
    if (level === "ERROR") process.stderr.write(line);
    else process.stdout.write(line);
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
