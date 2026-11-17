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
export const FREE_UPDATES = 365 * DAY;
export const CODE_LIFETIME = 10 * MINUTE;
export const CODE_ATTEMPTS = 5;

const LIMITS = {
  startPerEmail: { max: 5, window: HOUR },
  startPerMachine: { max: 5, window: HOUR },
  verify: { max: 10, window: HOUR },
  checkin: { max: 120, window: HOUR },
  redeem: { max: 10, window: HOUR },
  feedback: { max: 30, window: DAY },
} as const;

export type ServiceError =
  "invalid_code" | "trial_used" | "rate_limited" | "unknown_licence" | "not_found";

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T>(error: ServiceError): Outcome<T> => ({ ok: false, error });

export interface ServiceDeps {
  store: LicenceStore;
  mailer: Mailer;
  clock: Clock;
  signer: Signer;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): Promise<string> {
  return sha256Hex(`modulus-email:${normaliseEmail(email)}`);
}

export class LicenceService {
  constructor(private readonly deps: ServiceDeps) {}

  async startTrial(email: string, machineHash: string): Promise<Outcome<null>> {
    const emailHash = await hashEmail(email);
    const allowed =
      (await this.allow(`start:e:${emailHash}`, LIMITS.startPerEmail)) &&
      (await this.allow(`start:m:${machineHash}`, LIMITS.startPerMachine));
    if (!allowed) return fail("rate_limited");
    const code = randomDigits(6);
    await this.deps.store.saveCode(codeKey(emailHash, machineHash), {
      codeHash: await sha256Hex(code),
      email: normaliseEmail(email),
      expiresAt: this.now() + CODE_LIFETIME,
      attempts: 0,
    });
    await this.deps.mailer.sendCode(normaliseEmail(email), code);
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
    const pending = await store.getCode(key);
    if (!pending || pending.expiresAt <= this.now() || pending.attempts >= CODE_ATTEMPTS) {
      return fail("invalid_code");
    }
    if (!(await sameSecret(await sha256Hex(code), pending.codeHash))) {
      await store.saveCode(key, { ...pending, attempts: pending.attempts + 1 });
      return fail("invalid_code");
    }
    await store.saveCode(key, null);

    const known = await store.findByIdentity(emailHash, machineHash);
    const same = known.find((l) => l.emailHash === emailHash && l.machineHash === machineHash);
    if (same) return ok(await this.signLicence(same));
    if (known.length > 0) return fail("trial_used");

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
    await store.saveLicence(record);
    await store.saveTester(emailHash, pending.email, now);
    return ok(await this.signLicence(record));
  }

  async checkIn(
    licenceId: string,
    machineHash: string,
    nonce: string,
  ): Promise<Outcome<SignedDocument>> {
    if (!(await this.allow(`checkin:${licenceId}`, LIMITS.checkin))) return fail("rate_limited");
    const record = await this.boundLicence(licenceId, machineHash);
    if (!record) return fail("unknown_licence");
    const licence = await this.signLicence(record);
    return ok(
      await signDocument(this.deps.signer, {
        v: 1,
        licenceId,
        machineHash,
        nonce,
        serverTime: this.now(),
        licence,
      }),
    );
  }

  async redeem(code: string, machineHash: string): Promise<Outcome<SignedDocument>> {
    if (!(await this.allow(`redeem:${machineHash}`, LIMITS.redeem))) return fail("rate_limited");
    const record = await this.deps.store.findByRedeemCode(await sha256Hex(code));
    if (!record || (record.machineHash && record.machineHash !== machineHash)) {
      return fail("invalid_code");
    }
    const bound = { ...record, machineHash };
    await this.deps.store.saveLicence(bound);
    return ok(await this.signLicence(bound));
  }

  async recordFeedback(
    licenceId: string,
    machineHash: string,
    body: string,
    appVersion: string,
  ): Promise<Outcome<null>> {
    if (!(await this.allow(`feedback:${licenceId}`, LIMITS.feedback))) return fail("rate_limited");
    if (!(await this.boundLicence(licenceId, machineHash))) return fail("unknown_licence");
    await this.deps.store.addFeedback({ licenceId, appVersion, body, at: this.now() });
    return ok(null);
  }

  async recordConsent(
    licenceId: string,
    machineHash: string,
    consent: { kind: ConsentKind; granted: boolean; quote: string; displayName: string | null },
  ): Promise<Outcome<null>> {
    if (!(await this.allow(`feedback:${licenceId}`, LIMITS.feedback))) return fail("rate_limited");
    if (!(await this.boundLicence(licenceId, machineHash))) return fail("unknown_licence");
    await this.deps.store.addConsent({ licenceId, ...consent, at: this.now() });
    return ok(null);
  }

  listTesters(): Promise<TesterSummary[]> {
    return this.deps.store.listTesters();
  }

  listFeedback(licenceId: string): Promise<FeedbackRecord[]> {
    return this.deps.store.listFeedback(licenceId);
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
    return signDocument(this.deps.signer, {
      v: 1,
      licenceId: record.licenceId,
      kind: record.kind,
      machineHash: record.machineHash,
      emailHash: record.emailHash,
      issuedAt: this.now(),
      startsAt: record.startsAt,
      expiresAt: record.expiresAt,
      updatesUntil: record.updatesUntil,
    });
  }

  private async allow(bucket: string, limit: { max: number; window: number }) {
    const windowStart = Math.floor(this.now() / limit.window) * limit.window;
    return (await this.deps.store.countHit(bucket, windowStart)) <= limit.max;
  }

  private now() {
    return this.deps.clock.now();
  }
}

function codeKey(emailHash: string, machineHash: string) {
  return `${emailHash}:${machineHash}`;
}
