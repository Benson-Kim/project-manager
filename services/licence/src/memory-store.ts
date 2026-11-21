import type {
  AdminEvent,
  ConsentRecord,
  FeedbackRecord,
  LicenceRecord,
  LicenceStore,
  PendingCode,
  TesterSummary,
} from "./ports";

export function latestConsents(records: ConsentRecord[]): ConsentRecord[] {
  const latest = new Map<string, ConsentRecord>();
  for (const record of records) {
    const key = `${record.licenceId}:${record.kind}`;
    const current = latest.get(key);
    if (!current || record.at >= current.at) latest.set(key, record);
  }
  return [...latest.values()];
}

export class MemoryStore implements LicenceStore {
  private readonly licences = new Map<string, LicenceRecord>();
  private readonly testers = new Map<string, { email: string; at: number }>();
  private readonly codes = new Map<string, PendingCode>();
  private readonly hits = new Map<string, number>();
  private readonly usage = new Map<string, number>();
  private readonly claimedEmails = new Set<string>();
  private readonly claimedMachines = new Set<string>();
  readonly adminEvents: AdminEvent[] = [];
  private readonly feedback: FeedbackRecord[] = [];
  private readonly consents: ConsentRecord[] = [];

  async findByIdentity(emailHash: string, machineHash: string): Promise<LicenceRecord[]> {
    return [...this.licences.values()]
      .filter((l) => l.emailHash === emailHash || l.machineHash === machineHash)
      .map((l) => ({ ...l }));
  }

  async getLicence(licenceId: string): Promise<LicenceRecord | null> {
    const record = this.licences.get(licenceId);
    return record ? { ...record } : null;
  }

  async bindRedeemCode(codeHash: string, machineHash: string): Promise<LicenceRecord | null> {
    const record = [...this.licences.values()].find(
      (l) => l.redeemCodeHash === codeHash && (l.machineHash ?? machineHash) === machineHash,
    );
    if (!record) return null;
    record.machineHash = machineHash;
    return { ...record };
  }

  async saveLicence(record: LicenceRecord): Promise<void> {
    this.licences.set(record.licenceId, { ...record });
  }

  async raiseUsage(licenceId: string, usedMs: number): Promise<number> {
    const highest = Math.max(this.usage.get(licenceId) ?? 0, usedMs);
    this.usage.set(licenceId, highest);
    return highest;
  }

  async createTrial(record: LicenceRecord, email: string): Promise<"created" | "conflict"> {
    const { emailHash, machineHash } = record;
    if (!emailHash || !machineHash) throw new Error("a trial needs an email and a machine");
    if (this.claimedEmails.has(emailHash) || this.claimedMachines.has(machineHash)) {
      return "conflict";
    }
    this.claimedEmails.add(emailHash);
    this.claimedMachines.add(machineHash);
    this.licences.set(record.licenceId, { ...record });
    if (!this.testers.has(emailHash)) {
      this.testers.set(emailHash, { email, at: record.issuedAt });
    }
    return "created";
  }

  async issueCode(
    key: string,
    code: Omit<PendingCode, "attempts">,
    now: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const current = this.codes.get(key);
    const live = current !== undefined && current.expiresAt > now;
    if (live && current.attempts >= maxAttempts) return false;
    this.codes.set(key, { ...code, attempts: live ? current.attempts : 0 });
    return true;
  }

  async consumeCodeAttempt(key: string): Promise<PendingCode | null> {
    const current = this.codes.get(key);
    if (!current) return null;
    current.attempts += 1;
    return { ...current };
  }

  async countHit(bucket: string, windowStart: number): Promise<number> {
    const key = `${bucket}@${windowStart}`;
    const count = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, count);
    return count;
  }

  async peekHits(bucket: string, windowStart: number): Promise<number> {
    return this.hits.get(`${bucket}@${windowStart}`) ?? 0;
  }

  async addAdminEvent(event: AdminEvent): Promise<void> {
    this.adminEvents.push({ ...event });
  }

  async addFeedback(record: FeedbackRecord): Promise<void> {
    this.feedback.push({ ...record });
  }

  async addConsent(record: ConsentRecord): Promise<void> {
    this.consents.push({ ...record });
  }

  async listTesters(): Promise<TesterSummary[]> {
    const current = latestConsents(this.consents);
    return [...this.licences.values()].map((licence) => ({
      licence: { ...licence },
      email: licence.emailHash ? (this.testers.get(licence.emailHash)?.email ?? null) : null,
      feedbackCount: this.feedback.filter((f) => f.licenceId === licence.licenceId).length,
      consents: current.filter((c) => c.licenceId === licence.licenceId),
    }));
  }

  async listFeedback(licenceId: string): Promise<FeedbackRecord[]> {
    return this.feedback.filter((f) => f.licenceId === licenceId).map((f) => ({ ...f }));
  }
}
