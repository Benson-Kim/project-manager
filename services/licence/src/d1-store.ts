import { latestConsents } from "./memory-store";
import type {
  AdminEvent,
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
  batch(statements: D1Statement[]): Promise<unknown>;
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

  async bindRedeemCode(codeHash: string, machineHash: string): Promise<LicenceRecord | null> {
    const row = await this.db
      .prepare(
        `UPDATE licence SET machine_hash = ?1
         WHERE redeem_code_hash = ?2 AND (machine_hash IS NULL OR machine_hash = ?1)
         RETURNING ${LICENCE_COLUMNS}`,
      )
      .bind(machineHash, codeHash)
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

  async createTrial(r: LicenceRecord, email: string): Promise<"created" | "conflict"> {
    try {
      await this.db.batch([
        this.db
          .prepare(
            "INSERT INTO trial_claim (email_hash, machine_hash, licence_id, claimed_at) VALUES (?, ?, ?, ?)",
          )
          .bind(r.emailHash, r.machineHash, r.licenceId, r.issuedAt),
        this.db
          .prepare(`INSERT INTO licence (${LICENCE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
          ),
        this.db
          .prepare(
            "INSERT INTO tester (email_hash, email, first_seen) VALUES (?, ?, ?) ON CONFLICT (email_hash) DO NOTHING",
          )
          .bind(r.emailHash, email, r.issuedAt),
      ]);
      return "created";
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return "conflict";
      throw error;
    }
  }

  async issueCode(
    key: string,
    code: Omit<PendingCode, "attempts">,
    now: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO pending_code (code_key, code_hash, email, expires_at, attempts) VALUES (?1, ?2, ?3, ?4, 0)
         ON CONFLICT (code_key) DO UPDATE SET code_hash = excluded.code_hash, email = excluded.email,
           expires_at = excluded.expires_at,
           attempts = CASE WHEN pending_code.expires_at > ?5 THEN pending_code.attempts ELSE 0 END
         WHERE NOT (pending_code.expires_at > ?5 AND pending_code.attempts >= ?6)
         RETURNING attempts`,
      )
      .bind(key, code.codeHash, code.email, code.expiresAt, now, maxAttempts)
      .first<{ attempts: number }>();
    return row !== null;
  }

  async consumeCodeAttempt(key: string): Promise<PendingCode | null> {
    const row = await this.db
      .prepare(
        `UPDATE pending_code SET attempts = attempts + 1 WHERE code_key = ?
         RETURNING code_hash, email, expires_at, attempts`,
      )
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

  async peekHits(bucket: string, windowStart: number): Promise<number> {
    const row = await this.db
      .prepare("SELECT hits FROM rate_hit WHERE bucket = ? AND window_start = ?")
      .bind(bucket, windowStart)
      .first<{ hits: number }>();
    return row?.hits ?? 0;
  }

  async addAdminEvent(e: AdminEvent): Promise<void> {
    await this.db
      .prepare("INSERT INTO admin_event (at, action, scope, client, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(e.at, e.action, e.scope, e.client, e.detail)
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
