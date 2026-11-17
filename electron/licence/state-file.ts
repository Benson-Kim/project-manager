import { randomBytes } from "crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { MARK_KEY_BYTES, type Mark, type SignedDocument } from "./policy";

export interface Sealer {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(sealed: Buffer): string;
}

export interface LicenceState {
  licence: SignedDocument | null;
  checkIn: SignedDocument | null;
  mark: Mark | null;
  markKey: string;
}

export interface StateStore {
  read(): LicenceState;
  write(state: LicenceState): void;
}

const empty = (): LicenceState => ({
  licence: null,
  checkIn: null,
  mark: null,
  markKey: randomBytes(MARK_KEY_BYTES).toString("base64url"),
});

const fullKey = (key: unknown): key is string =>
  typeof key === "string" && Buffer.from(key, "base64url").length >= MARK_KEY_BYTES;

export class SealedStateFile implements StateStore {
  constructor(
    private readonly path: string,
    private readonly sealer: Sealer,
  ) {}

  read(): LicenceState {
    if (!this.sealer.isEncryptionAvailable() || !existsSync(this.path)) return empty();
    try {
      const state = JSON.parse(
        this.sealer.decryptString(readFileSync(this.path)),
      ) as Partial<LicenceState>;
      if (!fullKey(state.markKey)) return empty();
      return {
        licence: state.licence ?? null,
        checkIn: state.checkIn ?? null,
        mark: state.mark ?? null,
        markKey: state.markKey,
      };
    } catch {
      return empty();
    }
  }

  write(state: LicenceState): void {
    if (!this.sealer.isEncryptionAvailable()) return;
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, this.sealer.encryptString(JSON.stringify(state)));
    renameSync(temp, this.path);
  }
}
