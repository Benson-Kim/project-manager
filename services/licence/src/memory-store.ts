import type {
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

  async findByRedeemCode(codeHash: string): Promise<LicenceRecord | null> {
    const record = [...this.licences.values()].find((l) => l.redeemCodeHash === codeHash);
    return record ? { ...record } : null;
  }

  async saveLicence(record: LicenceRecord): Promise<void> {
    this.licences.set(record.licenceId, { ...record });
  }

  async saveTester(emailHash: string, email: string, at: number): Promise<void> {
    if (!this.testers.has(emailHash)) this.testers.set(emailHash, { email, at });
  }

  async getCode(key: string): Promise<PendingCode | null> {
    const code = this.codes.get(key);
    return code ? { ...code } : null;
  }

  async saveCode(key: string, code: PendingCode | null): Promise<void> {
    if (code) this.codes.set(key, { ...code });
    else this.codes.delete(key);
  }

  async countHit(bucket: string, windowStart: number): Promise<number> {
    const key = `${bucket}@${windowStart}`;
    const count = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, count);
    return count;
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
