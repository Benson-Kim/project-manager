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
  findByRedeemCode(codeHash: string): Promise<LicenceRecord | null>;
  saveLicence(record: LicenceRecord): Promise<void>;
  saveTester(emailHash: string, email: string, at: number): Promise<void>;
  getCode(key: string): Promise<PendingCode | null>;
  saveCode(key: string, code: PendingCode | null): Promise<void>;
  countHit(bucket: string, windowStart: number): Promise<number>;
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
