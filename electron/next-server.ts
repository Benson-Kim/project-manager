import { ChildProcess, fork } from "child_process";
import net from "net";
import path from "path";
import type { DbTarget } from "./db";
import type { Logger } from "./log";

export interface NextServerOptions {
  standaloneDir: string;
  db: DbTarget;
  authSecret: string;
  /**
   * Machine-wide attachments folder (machine.json uploadsDir, ADR-0026 §9);
   * missing on a PC provisioned before F1 until IT sets it up.
   */
  uploadsDir?: string;
  log: Logger;
  /** Called after an unexpected exit has been recovered (new URL). */
  onRestarted?: (url: string) => void;
  /** Called when the server keeps crashing and we gave up. */
  onFatal?: (message: string) => void;
  /** Called once when starting takes longer than usual (the splash says so). */
  onSlowStart?: () => void;
}

/**
 * A cold start right after Windows signs in is slow: on a client PC the server
 * took 54 s to boot and its first page another ~20 s, past the old 60 s limit
 * (main.log 2026-10-12). Each check may wait for that first page.
 */
export const START_TIMEOUT_MS = 180_000;
export const FIRST_PAGE_TIMEOUT_MS = 30_000;
export const SLOW_START_MS = 45_000;

/** The server's environment: loopback only, the machine's database and its folders. */
export function nextServerEnv(
  opts: Pick<NextServerOptions, "db" | "authSecret" | "uploadsDir">,
  port: number,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DB_SERVER: opts.db.host,
    DB_PORT: String(opts.db.port),
    DB_NAME: opts.db.database,
    DB_USER: opts.db.user,
    DB_PASSWORD: opts.db.password,
    TRUST_SERVER_CERT: "true",
    AUTH_SECRET: opts.authSecret,
    // Never the default (<cwd>/uploads): cwd is the install folder, which every update replaces.
    // Without the machine folder, uploads are off until IT sets it up (ADR-0026 §9).
    UPLOADS_ENABLED: opts.uploadsDir ? "true" : "false",
    UPLOADS_DIR: opts.uploadsDir ?? "",
    TRUSTED_PROXY_COUNT: "0",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/**
 * Runs the Next.js standalone server as a child process bound to 127.0.0.1
 * (Electron's own binary in Node mode, so no separate Node install is needed).
 * Crashes are restarted with a limit; quitting kills it synchronously.
 */
export class NextServer {
  private proc: ChildProcess | null = null;
  private port = 0;
  private stopping = false;
  private crashes: number[] = [];

  constructor(private readonly opts: NextServerOptions) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<string> {
    this.stopping = false;
    this.port = await findFreePort();
    const { opts } = this;
    const proc = fork(path.join(opts.standaloneDir, "server.js"), [], {
      cwd: opts.standaloneDir,
      env: nextServerEnv(opts, this.port),
      stdio: "pipe",
    });
    this.proc = proc;
    proc.stdout?.on("data", (d: Buffer) => opts.log.info(`[next] ${d.toString().trimEnd()}`));
    proc.stderr?.on("data", (d: Buffer) => opts.log.warn(`[next] ${d.toString().trimEnd()}`));
    proc.on("exit", (code, signal) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.stopping) return;
      opts.log.error(`[next] server exited unexpectedly (code ${code}, signal ${signal})`);
      void this.recover();
    });

    const slow = setTimeout(() => opts.onSlowStart?.(), SLOW_START_MS);
    try {
      await waitForHttp(`${this.url}/login`, START_TIMEOUT_MS, () => this.proc === proc);
    } finally {
      clearTimeout(slow);
    }
    opts.log.info(`[next] ready at ${this.url}`);
    return this.url;
  }

  private async recover(): Promise<void> {
    const now = Date.now();
    this.crashes = this.crashes.filter((t) => now - t < 5 * 60_000);
    this.crashes.push(now);
    if (this.crashes.length > 3) {
      this.opts.onFatal?.("The application server keeps stopping unexpectedly.");
      return;
    }
    try {
      const url = await this.start();
      this.opts.onRestarted?.(url);
    } catch (err) {
      this.opts.log.error("[next] restart failed", err);
      this.opts.onFatal?.("The application server could not be restarted.");
    }
  }

  /** Synchronous: safe to call from `will-quit`, where async work is not awaited. */
  stop(): void {
    this.stopping = true;
    const proc = this.proc;
    this.proc = null;
    if (proc && proc.exitCode === null) proc.kill();
  }

  /** Stop and wait until the process is gone (used before a restore). */
  async stopAndWait(timeoutMs = 10_000): Promise<void> {
    const proc = this.proc;
    this.stop();
    if (!proc || proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      proc.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() =>
        addr && typeof addr !== "string" ? resolve(addr.port) : reject(new Error("no free port")),
      );
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number, alive: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive()) throw new Error("The application server stopped while starting (see log).");
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FIRST_PAGE_TIMEOUT_MS),
      });
      if (res.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The application server did not start within ${timeoutMs / 1000}s.`);
}
