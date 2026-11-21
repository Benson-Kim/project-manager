export type LicenceKind = "trial" | "free" | "full";
export type ConsentKind = "testimonial" | "name";

export interface LicenceRecord {
  licenceId: string;
  kind: LicenceKind;
  emailHash: string | null;
  machineHash: string | null;
  issuedAt: number;
  startsAt: number;
  expiresAt: number | null;
  updatesUntil: number | null;
  redeemCodeHash: string | null;
}

export interface PendingCode {
  codeHash: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

export interface FeedbackRecord {
  licenceId: string;
  appVersion: string;
  body: string;
  at: number;
}

export interface AdminEvent {
  at: number;
  action: string;
  scope: string;
  client: string;
  detail: string | null;
}

export interface ConsentRecord {
  licenceId: string;
  kind: ConsentKind;
  granted: boolean;
  quote: string;
  displayName: string | null;
  at: number;
}

export interface TesterSummary {
  licence: LicenceRecord;
  email: string | null;
  feedbackCount: number;
  consents: ConsentRecord[];
}

export interface LicenceStore {
  findByIdentity(emailHash: string, machineHash: string): Promise<LicenceRecord[]>;
  getLicence(licenceId: string): Promise<LicenceRecord | null>;
  bindRedeemCode(codeHash: string, machineHash: string): Promise<LicenceRecord | null>;
  saveLicence(record: LicenceRecord): Promise<void>;
  raiseUsage(licenceId: string, usedMs: number): Promise<number>;
  createTrial(record: LicenceRecord, email: string): Promise<"created" | "conflict">;
  issueCode(
    key: string,
    code: Omit<PendingCode, "attempts">,
    now: number,
    maxAttempts: number,
  ): Promise<boolean>;
  consumeCodeAttempt(key: string): Promise<PendingCode | null>;
  countHit(bucket: string, windowStart: number): Promise<number>;
  peekHits(bucket: string, windowStart: number): Promise<number>;
  addAdminEvent(event: AdminEvent): Promise<void>;
  addFeedback(record: FeedbackRecord): Promise<void>;
  addConsent(record: ConsentRecord): Promise<void>;
  listTesters(): Promise<TesterSummary[]>;
  listFeedback(licenceId: string): Promise<FeedbackRecord[]>;
}

export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
}

export interface Clock {
  now(): number;
}
