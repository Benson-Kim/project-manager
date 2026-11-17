import { latestConsents } from "./memory-store";
import type {
  ConsentKind,
  ConsentRecord,
  FeedbackRecord,
  LicenceKind,
  LicenceRecord,
  LicenceStore,
  PendingCode,
  TesterSummary,
} from "./ports";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
}

interface LicenceRow {
  licence_id: string;
  kind: LicenceKind;
  email_hash: string | null;
  machine_hash: string | null;
  issued_at: number;
  starts_at: number;
  expires_at: number | null;
  updates_until: number | null;
  redeem_code_hash: string | null;
}

interface ConsentRow {
  licence_id: string;
  kind: ConsentKind;
  granted: number;
  quote: string;
  display_name: string | null;
  at: number;
}

const LICENCE_COLUMNS =
  "licence_id, kind, email_hash, machine_hash, issued_at, starts_at, expires_at, updates_until, redeem_code_hash";

const toLicence = (r: LicenceRow): LicenceRecord => ({
  licenceId: r.licence_id,
  kind: r.kind,
  emailHash: r.email_hash,
  machineHash: r.machine_hash,
  issuedAt: r.issued_at,
  startsAt: r.starts_at,
  expiresAt: r.expires_at,
  updatesUntil: r.updates_until,
  redeemCodeHash: r.redeem_code_hash,
});

const toConsent = (r: ConsentRow): ConsentRecord => ({
  licenceId: r.licence_id,
  kind: r.kind,
  granted: r.granted === 1,
  quote: r.quote,
  displayName: r.display_name,
  at: r.at,
});

export class D1Store implements LicenceStore {
  constructor(private readonly db: D1Like) {}

  async findByIdentity(emailHash: string, machineHash: string): Promise<LicenceRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT ${LICENCE_COLUMNS} FROM licence WHERE email_hash = ? OR machine_hash = ?`)
      .bind(emailHash, machineHash)
      .all<LicenceRow>();
    return results.map(toLicence);
  }

  async getLicence(licenceId: string): Promise<LicenceRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${LICENCE_COLUMNS} FROM licence WHERE licence_id = ?`)
      .bind(licenceId)
      .first<LicenceRow>();
    return row ? toLicence(row) : null;
  }

  async findByRedeemCode(codeHash: string): Promise<LicenceRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${LICENCE_COLUMNS} FROM licence WHERE redeem_code_hash = ?`)
      .bind(codeHash)
      .first<LicenceRow>();
    return row ? toLicence(row) : null;
  }

  async saveLicence(r: LicenceRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO licence (${LICENCE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (licence_id) DO UPDATE SET kind = excluded.kind, machine_hash = excluded.machine_hash,
           expires_at = excluded.expires_at, updates_until = excluded.updates_until`,
      )
      .bind(
        r.licenceId,
        r.kind,
        r.emailHash,
        r.machineHash,
        r.issuedAt,
        r.startsAt,
        r.expiresAt,
        r.updatesUntil,
        r.redeemCodeHash,
      )
      .run();
  }

  async saveTester(emailHash: string, email: string, at: number): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO tester (email_hash, email, first_seen) VALUES (?, ?, ?) ON CONFLICT (email_hash) DO NOTHING",
      )
      .bind(emailHash, email, at)
      .run();
  }

  async getCode(key: string): Promise<PendingCode | null> {
    const row = await this.db
      .prepare("SELECT code_hash, email, expires_at, attempts FROM pending_code WHERE code_key = ?")
      .bind(key)
      .first<{ code_hash: string; email: string; expires_at: number; attempts: number }>();
    return row
      ? {
          codeHash: row.code_hash,
          email: row.email,
          expiresAt: row.expires_at,
          attempts: row.attempts,
        }
      : null;
  }

  async saveCode(key: string, code: PendingCode | null): Promise<void> {
    if (!code) {
      await this.db.prepare("DELETE FROM pending_code WHERE code_key = ?").bind(key).run();
      return;
    }
    await this.db
      .prepare(
        `INSERT INTO pending_code (code_key, code_hash, email, expires_at, attempts) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (code_key) DO UPDATE SET code_hash = excluded.code_hash, email = excluded.email,
           expires_at = excluded.expires_at, attempts = excluded.attempts`,
      )
      .bind(key, code.codeHash, code.email, code.expiresAt, code.attempts)
      .run();
  }

  async countHit(bucket: string, windowStart: number): Promise<number> {
    const row = await this.db
      .prepare(
        `INSERT INTO rate_hit (bucket, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1 RETURNING hits`,
      )
      .bind(bucket, windowStart)
      .first<{ hits: number }>();
    return row?.hits ?? Number.MAX_SAFE_INTEGER;
  }

  async addFeedback(r: FeedbackRecord): Promise<void> {
    await this.db
      .prepare("INSERT INTO feedback (licence_id, app_version, body, at) VALUES (?, ?, ?, ?)")
      .bind(r.licenceId, r.appVersion, r.body, r.at)
      .run();
  }

  async addConsent(r: ConsentRecord): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO consent (licence_id, kind, granted, quote, display_name, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(r.licenceId, r.kind, r.granted ? 1 : 0, r.quote, r.displayName, r.at)
      .run();
  }

  async listTesters(): Promise<TesterSummary[]> {
    const [licences, consents] = await Promise.all([
      this.db
        .prepare(
          `SELECT l.licence_id, l.kind, l.email_hash, l.machine_hash, l.issued_at, l.starts_at, l.expires_at,
             l.updates_until, l.redeem_code_hash, t.email,
             (SELECT COUNT(*) FROM feedback f WHERE f.licence_id = l.licence_id) AS feedback_count
           FROM licence l LEFT JOIN tester t ON t.email_hash = l.email_hash
           ORDER BY l.issued_at DESC LIMIT 1000`,
        )
        .all<LicenceRow & { email: string | null; feedback_count: number }>(),
      this.db
        .prepare(
          `SELECT licence_id, kind, granted, quote, display_name, at FROM consent
           WHERE id IN (SELECT MAX(id) FROM consent GROUP BY licence_id, kind)`,
        )
        .all<ConsentRow>(),
    ]);
    const current = latestConsents(consents.results.map(toConsent));
    return licences.results.map((row) => ({
      licence: toLicence(row),
      email: row.email,
      feedbackCount: row.feedback_count,
      consents: current.filter((c) => c.licenceId === row.licence_id),
    }));
  }

  async listFeedback(licenceId: string): Promise<FeedbackRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT licence_id, app_version, body, at FROM feedback WHERE licence_id = ? ORDER BY at DESC LIMIT 500",
      )
      .bind(licenceId)
      .all<{ licence_id: string; app_version: string; body: string; at: number }>();
    return results.map((r) => ({
      licenceId: r.licence_id,
      appVersion: r.app_version,
      body: r.body,
      at: r.at,
    }));
  }

  async prune(before: number): Promise<void> {
    await this.db.prepare("DELETE FROM rate_hit WHERE window_start < ?").bind(before).run();
    await this.db.prepare("DELETE FROM pending_code WHERE expires_at < ?").bind(before).run();
  }
}
