import { ChildProcess, fork } from "child_process";
import net from "net";
import path from "path";
import type { DbTarget } from "./db";
import type { Logger } from "./log";

export interface NextServerOptions {
  standaloneDir: string;
  db: DbTarget;
  authSecret: string;
  log: Logger;
  /** Called after an unexpected exit has been recovered (new URL). */
  onRestarted?: (url: string) => void;
  /** Called when the server keeps crashing and we gave up. */
  onFatal?: (message: string) => void;
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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(this.port),
      DB_SERVER: opts.db.host,
      DB_PORT: String(opts.db.port),
      DB_NAME: opts.db.database,
      DB_USER: opts.db.user,
      DB_PASSWORD: opts.db.password,
      TRUST_SERVER_CERT: "true",
      AUTH_SECRET: opts.authSecret,
      TRUSTED_PROXY_COUNT: "0",
      NEXT_TELEMETRY_DISABLED: "1",
    };

    const proc = fork(path.join(opts.standaloneDir, "server.js"), [], {
      cwd: opts.standaloneDir,
      env,
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

    await waitForHttp(`${this.url}/login`, 60_000, () => this.proc === proc);
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
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The application server did not start within ${timeoutMs / 1000}s.`);
}
