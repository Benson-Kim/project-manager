import { randomBytes } from "crypto";
import {
  evaluate,
  openCheckIn,
  openLicence,
  readMark,
  readUsage,
  sealMark,
  sealUsage,
  trustedNow,
  usageLimit,
  type Anchor,
  type Licence,
  type LicenceKind,
  type LicenceStatus,
  type PublicKeys,
  type SignedDocument,
} from "./policy";
import type { ConsentChoice } from "./consent";
import { LicenceServiceError } from "./service-client";
import type { LicenceState, StateStore } from "./state-file";

export const CHECK_IN_EVERY = 6 * 60 * 60 * 1000;
export const MARK_EVERY = 5 * 60 * 1000;

const RANK: Record<LicenceKind, number> = { trial: 0, free: 1, full: 2 };

function supersedes(offered: Licence, held: Licence | null): boolean {
  if (!held) return true;
  if (RANK[offered.kind] !== RANK[held.kind]) return RANK[offered.kind] > RANK[held.kind];
  return offered.startsAt > held.startsAt;
}

export type MirroredState = Pick<LicenceState, "licence" | "checkIn" | "mark" | "usage">;

export interface TrialAllowance {
  usedMs: number;
  limitMs: number;
}

export interface LicenceMirror {
  read(): Promise<MirroredState | null>;
  write(state: MirroredState): Promise<void>;
}

export interface LicenceService {
  post(path: string, body: Record<string, unknown>): Promise<unknown>;
}

export type LicenceReply = { ok: true; status: LicenceStatus } | { ok: false; reason: string };

type Sent = { ok: true; reply: unknown } | { ok: false; reason: string };

export interface ManagerDeps {
  enforce: boolean;
  keys: PublicKeys;
  machineHash: string;
  store: StateStore;
  mirror: LicenceMirror | null;
  service: LicenceService | null;
  log?: { warn(message: string): void };
  wall?: () => number;
  monotonic?: () => number;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class LicenceManager {
  private state: LicenceState;
  private anchor: Anchor | null = null;
  private mirrorStale = false;
  private readonly wall: () => number;
  private readonly monotonic: () => number;

  constructor(private readonly deps: ManagerDeps) {
    this.state = deps.store.read();
    this.wall = deps.wall ?? Date.now;
    this.monotonic = deps.monotonic ?? (() => performance.now());
  }

  get markKey(): string {
    return this.state.markKey;
  }

  async start(): Promise<LicenceStatus> {
    await this.adoptMirror();
    return this.status();
  }

  status(): LicenceStatus {
    return evaluate({
      enforce: this.deps.enforce,
      licence: this.licence(),
      machineHash: this.deps.machineHash,
      now: this.now(),
      lastServerTime: this.lastServerTime(),
      markTrusted: this.trustedMark() !== null,
      usedMs: this.usedMs(),
    });
  }

  usedMs(usage: unknown = this.state.usage): number {
    const licence = this.licence();
    return licence ? readUsage(usage, licence.licenceId, this.key()) : 0;
  }

  allowance(): TrialAllowance | null {
    const licence = this.licence();
    if (licence?.kind !== "trial") return null;
    const limitMs = usageLimit(licence);
    return { usedMs: Math.min(this.usedMs(), limitMs), limitMs };
  }

  recordUse(ms: number): void {
    const licence = this.licence();
    const used = this.usedMs();
    if (licence?.kind !== "trial" || !(ms > 0) || !Number.isFinite(used)) return;
    const limit = usageLimit(licence);
    if (used >= limit) return;
    this.state = { ...this.state, usage: this.sealUsed(licence, used + Math.round(ms)) };
    this.save();
    this.mirrorStale = true;
  }

  private sealUsed(licence: Licence, ms: number) {
    return sealUsage(licence.licenceId, Math.min(usageLimit(licence), ms), this.key());
  }

  licence(): Licence | null {
    const licence = openLicence(this.state.licence, this.deps.keys);
    return licence?.machineHash === this.deps.machineHash ? licence : null;
  }

  async adopt(document: unknown): Promise<LicenceStatus> {
    return (await this.accept(document)) === null ? this.checkIn() : this.status();
  }

  async requestTrial(email: string): Promise<LicenceReply> {
    return this.replied(
      await this.send("/v1/trial/start", { email, machineHash: this.deps.machineHash }),
    );
  }

  async verifyTrial(email: string, code: string): Promise<LicenceReply> {
    return this.obtain("/v1/trial/verify", { email, machineHash: this.deps.machineHash, code });
  }

  async redeem(code: string): Promise<LicenceReply> {
    return this.obtain("/v1/licence/redeem", { code, machineHash: this.deps.machineHash });
  }

  async sendFeedback(body: string, appVersion: string): Promise<LicenceReply> {
    return this.asLicensee("/v1/feedback", { body, appVersion });
  }

  async setConsent(choice: ConsentChoice): Promise<LicenceReply> {
    return this.asLicensee("/v1/consent", { ...choice });
  }

  async checkIn(): Promise<LicenceStatus> {
    await this.flushMirror();
    const licence = this.licence();
    if (!licence || !this.deps.service) return this.status();
    const nonce = randomBytes(18).toString("base64url");
    const expected = { licenceId: licence.licenceId, machineHash: this.deps.machineHash, nonce };
    try {
      const used = this.usedMs();
      const usedMs = Math.min(used, usageLimit(licence));
      const reply = await this.deps.service.post("/v1/checkin", { ...expected, usedMs });
      const opened = openCheckIn(reply, this.deps.keys, expected);
      if (opened) {
        this.anchor = { serverTime: opened.serverTime, monotonicAt: this.monotonic() };
        const raised = Number.isFinite(used) && opened.usedMs > used;
        this.state = {
          ...this.state,
          licence: opened.licenceDocument,
          checkIn: reply as SignedDocument,
          mark: sealMark(opened.serverTime, this.key()),
          ...(raised ? { usage: this.sealUsed(opened.licence, opened.usedMs) } : {}),
        };
        await this.persist();
      }
    } catch (error) {
      if (!(error instanceof LicenceServiceError)) throw error;
    }
    return this.status();
  }

  async refreshMark(): Promise<void> {
    const mark = this.trustedMark();
    if (mark === null) return;
    const now = this.now();
    if (now <= mark) return this.flushMirror();
    this.state = { ...this.state, mark: sealMark(now, this.key()) };
    await this.persist();
  }

  schedule(onStatus: (status: LicenceStatus) => void): () => void {
    const timers = [
      setInterval(() => void this.checkIn().then(onStatus, () => undefined), CHECK_IN_EVERY),
      setInterval(
        () =>
          void this.refreshMark().then(
            () => onStatus(this.status()),
            () => undefined,
          ),
        MARK_EVERY,
      ),
    ];
    for (const timer of timers) timer.unref();
    return () => timers.forEach(clearInterval);
  }

  private async accept(document: unknown): Promise<string | null> {
    const offered = openLicence(document, this.deps.keys);
    if (offered?.machineHash !== this.deps.machineHash) return "invalid";
    const held = this.licence();
    if (held && RANK[offered.kind] < RANK[held.kind]) return "already_licensed";
    this.state = { ...this.state, licence: document as SignedDocument, checkIn: null };
    await this.persist();
    return null;
  }

  private async obtain(path: string, body: Record<string, unknown>): Promise<LicenceReply> {
    const sent = await this.send(path, body);
    if (!sent.ok) return sent;
    const refused = await this.accept(sent.reply);
    if (refused) return { ok: false, reason: refused };
    return { ok: true, status: await this.checkIn() };
  }

  private async asLicensee(path: string, body: Record<string, unknown>): Promise<LicenceReply> {
    const licence = this.licence();
    if (!licence) return { ok: false, reason: "unlicensed" };
    const owner = { licenceId: licence.licenceId, machineHash: this.deps.machineHash };
    return this.replied(await this.send(path, { ...body, ...owner }));
  }

  private async send(path: string, body: Record<string, unknown>): Promise<Sent> {
    if (!this.deps.service) return { ok: false, reason: "offline" };
    try {
      return { ok: true, reply: await this.deps.service.post(path, body) };
    } catch (error) {
      if (error instanceof LicenceServiceError) return { ok: false, reason: error.code };
      throw error;
    }
  }

  private replied(sent: Sent): LicenceReply {
    return sent.ok ? { ok: true, status: this.status() } : sent;
  }

  private key(): Buffer {
    return Buffer.from(this.state.markKey, "base64url");
  }

  private trustedMark(mark: unknown = this.state.mark): number | null {
    const at = readMark(mark, this.key());
    return typeof at === "number" ? at : null;
  }

  private lastServerTime(): number | null {
    const licence = this.licence();
    if (!licence) return null;
    const expected = { licenceId: licence.licenceId, machineHash: this.deps.machineHash };
    return openCheckIn(this.state.checkIn, this.deps.keys, expected)?.serverTime ?? null;
  }

  now(): number {
    const floors = [this.trustedMark() ?? 0, this.lastServerTime() ?? 0];
    return trustedNow({
      wall: this.wall(),
      monotonic: this.monotonic(),
      anchor: this.anchor,
      floors,
    });
  }

  private async adoptMirror(): Promise<void> {
    const mirrored = await this.deps.mirror?.read().catch(() => null);
    if (!mirrored) return;
    const next = { ...this.state };
    const theirs = openLicence(mirrored.licence, this.deps.keys);
    if (theirs?.machineHash === this.deps.machineHash && supersedes(theirs, this.licence())) {
      next.licence = mirrored.licence;
      next.checkIn = mirrored.checkIn;
    }
    const mirroredMark = this.trustedMark(mirrored.mark);
    if (mirroredMark !== null && mirroredMark > (this.trustedMark() ?? -1))
      next.mark = mirrored.mark;
    this.state = next;
    const theirUsage = this.usedMs(mirrored.usage);
    if (Number.isFinite(theirUsage) && theirUsage > this.usedMs())
      this.state = { ...next, usage: mirrored.usage };
    this.deps.store.write(this.state);
  }

  private save(): void {
    try {
      this.deps.store.write(this.state);
    } catch (error) {
      this.deps.log?.warn(`licence: saving the state failed: ${describe(error)}`);
    }
  }

  private async persist(): Promise<void> {
    this.save();
    this.mirrorStale = true;
    await this.flushMirror();
  }

  private async flushMirror(): Promise<void> {
    if (!this.mirrorStale || !this.deps.mirror) return;
    const { licence, checkIn, mark, usage } = this.state;
    try {
      await this.deps.mirror.write({ licence, checkIn, mark, usage });
      this.mirrorStale = false;
    } catch (error) {
      this.deps.log?.warn(`licence: saving the database copy failed: ${describe(error)}`);
    }
  }
}
