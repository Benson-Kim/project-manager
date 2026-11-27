import {
  randomDigits,
  randomToken,
  sameSecret,
  sha256Hex,
  signDocument,
  type SignedDocument,
  type Signer,
} from "./crypto";
import type {
  Clock,
  ConsentKind,
  FeedbackRecord,
  LicenceRecord,
  LicenceStore,
  Mailer,
  TesterSummary,
} from "./ports";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TRIAL_LENGTH = 14 * DAY;
export const TRIAL_USAGE_LIMIT = 112 * HOUR;
export const FREE_UPDATES = 365 * DAY;
export const CODE_LIFETIME = 10 * MINUTE;
export const CODE_ATTEMPTS = 5;

const LIMITS = {
  startPerEmail: { max: 5, window: HOUR },
  startPerMachine: { max: 5, window: HOUR },
  startPerClient: { max: 20, window: HOUR },
  adminFailure: { max: 10, window: HOUR },
  verify: { max: 10, window: HOUR },
  checkin: { max: 120, window: HOUR },
  redeem: { max: 10, window: HOUR },
  feedback: { max: 30, window: DAY },
} as const;

export type ServiceError =
  | "invalid_code"
  | "trial_used"
  | "rate_limited"
  | "unknown_licence"
  | "not_found"
  | "mail_unavailable";

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T>(error: ServiceError): Outcome<T> => ({ ok: false, error });

export interface ServiceDeps {
  store: LicenceStore;
  mailer: Mailer;
  clock: Clock;
  signer: Signer;
  mailTimeoutMs?: number;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): Promise<string> {
  return sha256Hex(`modulus-email:${normaliseEmail(email)}`);
}

export class LicenceService {
  constructor(private readonly deps: ServiceDeps) {}

  async startTrial(
    email: string,
    machineHash: string,
    client: string | null = null,
  ): Promise<Outcome<null>> {
    const { store } = this.deps;
    const emailHash = await hashEmail(email);
    const allowed =
      (await this.allow(`start:e:${emailHash}:${machineHash}`, LIMITS.startPerEmail)) &&
      (await this.allow(`start:m:${machineHash}`, LIMITS.startPerMachine)) &&
      (client === null || (await this.allow(`start:ip:${client}`, LIMITS.startPerClient)));
    if (!allowed) return fail("rate_limited");
    const code = randomDigits(6);
    const address = normaliseEmail(email);
    const issued = await store.issueCode(
      codeKey(emailHash, machineHash),
      { codeHash: await sha256Hex(code), email: address, expiresAt: this.now() + CODE_LIFETIME },
      this.now(),
      CODE_ATTEMPTS,
    );
    if (!issued) return ok(null);
    try {
      await this.sendWithinLimit(address, code);
    } catch {
      return fail("mail_unavailable");
    }
    return ok(null);
  }

  async verifyTrial(
    email: string,
    machineHash: string,
    code: string,
  ): Promise<Outcome<SignedDocument>> {
    const { store } = this.deps;
    const emailHash = await hashEmail(email);
    const key = codeKey(emailHash, machineHash);
    if (!(await this.allow(`verify:${key}`, LIMITS.verify))) return fail("rate_limited");
    const pending = await store.consumeCodeAttempt(key);
    if (!pending || pending.expiresAt <= this.now() || pending.attempts > CODE_ATTEMPTS) {
      return fail("invalid_code");
    }
    if (!(await sameSecret(await sha256Hex(code), pending.codeHash))) return fail("invalid_code");

    const sameIdentity = async () => {
      const known = await store.findByIdentity(emailHash, machineHash);
      return {
        same: known.find((l) => l.emailHash === emailHash && l.machineHash === machineHash),
        any: known.length > 0,
      };
    };
    const existing = await sameIdentity();
    if (existing.same) return ok(await this.signLicence(existing.same));
    if (existing.any) return fail("trial_used");

    const now = this.now();
    const record: LicenceRecord = {
      licenceId: randomToken(16),
      kind: "trial",
      emailHash,
      machineHash,
      issuedAt: now,
      startsAt: now,
      expiresAt: now + TRIAL_LENGTH,
      updatesUntil: null,
      redeemCodeHash: null,
    };
    if ((await store.createTrial(record, pending.email)) === "created") {
      return ok(await this.signLicence(record));
    }
    const winner = await sameIdentity();
    return winner.same ? ok(await this.signLicence(winner.same)) : fail("trial_used");
  }

  async checkIn(
    licenceId: string,
    machineHash: string,
    nonce: string,
    usedMs = 0,
  ): Promise<Outcome<SignedDocument>> {
    const record = await this.boundLicence(licenceId, machineHash);
    if (!record) return fail("unknown_licence");
    if (!(await this.allow(`checkin:${licenceId}:${machineHash}`, LIMITS.checkin))) {
      return fail("rate_limited");
    }
    const licence = await this.signLicence(record);
    const highest = await this.deps.store.raiseUsage(licenceId, usedMs);
    return ok(
      await signDocument(this.deps.signer, "checkin", {
        v: 1,
        licenceId,
        machineHash,
        nonce,
        serverTime: this.now(),
        usedMs: highest,
        licence,
      }),
    );
  }

  async redeem(code: string, machineHash: string): Promise<Outcome<SignedDocument>> {
    if (!(await this.allow(`redeem:${machineHash}`, LIMITS.redeem))) return fail("rate_limited");
    const bound = await this.deps.store.bindRedeemCode(await sha256Hex(code), machineHash);
    return bound ? ok(await this.signLicence(bound)) : fail("invalid_code");
  }

  async recordFeedback(
    licenceId: string,
    machineHash: string,
    body: string,
    appVersion: string,
  ): Promise<Outcome<null>> {
    if (!(await this.boundLicence(licenceId, machineHash))) return fail("unknown_licence");
    if (!(await this.allow(`feedback:${licenceId}:${machineHash}`, LIMITS.feedback))) {
      return fail("rate_limited");
    }
    await this.deps.store.addFeedback({ licenceId, appVersion, body, at: this.now() });
    return ok(null);
  }

  async recordConsent(
    licenceId: string,
    machineHash: string,
    consent: { kind: ConsentKind; granted: boolean; quote: string; displayName: string | null },
  ): Promise<Outcome<null>> {
    if (!(await this.boundLicence(licenceId, machineHash))) return fail("unknown_licence");
    if (!(await this.allow(`feedback:${licenceId}:${machineHash}`, LIMITS.feedback))) {
      return fail("rate_limited");
    }
    await this.deps.store.addConsent({ licenceId, ...consent, at: this.now() });
    return ok(null);
  }

  listTesters(): Promise<TesterSummary[]> {
    return this.deps.store.listTesters();
  }

  listFeedback(licenceId: string): Promise<FeedbackRecord[]> {
    return this.deps.store.listFeedback(licenceId);
  }

  checkHealth(): Promise<void> {
    return this.deps.store.ping();
  }

  async convert(licenceId: string, kind: "free" | "full"): Promise<Outcome<null>> {
    const record = await this.deps.store.getLicence(licenceId);
    if (!record) return fail("not_found");
    await this.deps.store.saveLicence({ ...record, ...this.perpetual(kind) });
    return ok(null);
  }

  async issueRedeemable(
    kind: "free" | "full",
  ): Promise<Outcome<{ licenceId: string; code: string }>> {
    const code = randomToken(16);
    const now = this.now();
    const licenceId = randomToken(16);
    await this.deps.store.saveLicence({
      licenceId,
      emailHash: null,
      machineHash: null,
      issuedAt: now,
      startsAt: now,
      redeemCodeHash: await sha256Hex(code),
      ...this.perpetual(kind),
    });
    return ok({ licenceId, code });
  }

  private perpetual(kind: "free" | "full") {
    return {
      kind,
      expiresAt: null,
      updatesUntil: kind === "free" ? this.now() + FREE_UPDATES : null,
    };
  }

  private async boundLicence(licenceId: string, machineHash: string) {
    const record = await this.deps.store.getLicence(licenceId);
    return record && record.machineHash === machineHash ? record : null;
  }

  private signLicence(record: LicenceRecord): Promise<SignedDocument> {
    return signDocument(this.deps.signer, "licence", {
      v: 1,
      licenceId: record.licenceId,
      kind: record.kind,
      machineHash: record.machineHash,
      emailHash: record.emailHash,
      issuedAt: this.now(),
      startsAt: record.startsAt,
      expiresAt: record.expiresAt,
      updatesUntil: record.updatesUntil,
      usageLimitMs: record.kind === "trial" ? TRIAL_USAGE_LIMIT : null,
    });
  }

  async adminBlocked(client: string): Promise<boolean> {
    return (
      (await this.deps.store.peekHits(
        `admin-fail:${client}`,
        this.windowStart(LIMITS.adminFailure.window),
      )) >= LIMITS.adminFailure.max
    );
  }

  async noteAdminFailure(client: string): Promise<void> {
    await this.allow(`admin-fail:${client}`, LIMITS.adminFailure);
  }

  recordAdminEvent(event: {
    action: string;
    scope: string;
    client: string;
    detail: string | null;
  }) {
    return this.deps.store.addAdminEvent({ ...event, at: this.now() });
  }

  private async sendWithinLimit(email: string, code: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("mail timeout")), this.deps.mailTimeoutMs ?? 8000);
    });
    try {
      await Promise.race([this.deps.mailer.sendCode(email, code), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private windowStart(window: number) {
    return Math.floor(this.now() / window) * window;
  }

  private async allow(bucket: string, limit: { max: number; window: number }) {
    return (await this.deps.store.countHit(bucket, this.windowStart(limit.window))) <= limit.max;
  }

  private now() {
    return this.deps.clock.now();
  }
}

function codeKey(emailHash: string, machineHash: string) {
  return `${emailHash}:${machineHash}`;
}
