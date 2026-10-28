import type { GrammarIssue } from "./proofing";

/** The part of an Electron UtilityProcess the checker uses, so tests can stand in for it. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  kill(): boolean;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
}

export interface GrammarCheckerOptions {
  fork(): WorkerLike;
  readWasm(): Promise<Uint8Array>;
  dialect: string;
  warn(message: string): void;
  checkTimeoutMs?: number;
  idleMs?: number;
}

type Reply = { ready?: true; failed?: string; id?: number; issues?: GrammarIssue[] };

/**
 * Runs the grammar checker in its own process (ADR-0049). It needs about 300 MB, so it starts
 * when the window is used, and stops after a spell of no use. The context menu never waits on
 * it for long: until it has loaded, or when it is slow, a check answers null.
 */
export class GrammarChecker {
  private worker: WorkerLike | null = null;
  private ready = false;
  private nextId = 0;
  private readonly pending = new Map<number, (issues: GrammarIssue[] | null) => void>();
  private idle: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: GrammarCheckerOptions) {}

  /** Starts loading if it is not running, and keeps it running a while longer. */
  warm(): void {
    this.keepAlive();
    if (this.worker) return;
    const worker = this.options.fork();
    this.worker = worker;
    worker.onMessage((reply) => this.receive(reply as Reply));
    worker.onExit((code) => {
      if (this.worker !== worker) return;
      if (code !== 0) this.options.warn(`[grammar] checker stopped (exit ${code})`);
      this.reset();
    });
    this.options.readWasm().then(
      (wasm) => worker.postMessage({ wasm, dialect: this.options.dialect }),
      (err: unknown) => {
        this.options.warn(`[grammar] could not read the checker: ${String(err)}`);
        this.stop();
      },
    );
  }

  /** The problems in `text`, or null while the checker is loading or did not answer in time. */
  check(text: string): Promise<GrammarIssue[] | null> {
    this.warm();
    const worker = this.worker;
    if (!this.ready || !worker) return Promise.resolve(null);
    const id = ++this.nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, this.options.checkTimeoutMs ?? 1500);
      this.pending.set(id, (issues) => {
        clearTimeout(timer);
        resolve(issues);
      });
      worker.postMessage({ id, text });
    });
  }

  stop(): void {
    const worker = this.worker;
    this.reset();
    worker?.kill();
  }

  private receive(reply: Reply): void {
    if (reply.ready) this.ready = true;
    if (reply.failed) this.options.warn(`[grammar] ${reply.failed}`);
    if (reply.id === undefined) return;
    this.pending.get(reply.id)?.(reply.issues ?? []);
    this.pending.delete(reply.id);
  }

  private keepAlive(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), this.options.idleMs ?? 30 * 60_000);
    this.idle.unref?.();
  }

  private reset(): void {
    this.worker = null;
    this.ready = false;
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
  }
}
