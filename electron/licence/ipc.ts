import { LICENCE_CHANNELS } from "../ipc-channels";
import type { ConsentChoice } from "./consent";
import type { LicenceManager, LicenceReply } from "./manager";
import type { LicenceStatus } from "./policy";

type Handler = (event: { sender: unknown }, input?: unknown) => Promise<unknown>;

export interface LicenceIpcDeps {
  handle(channel: string, handler: Handler): void;
  manager: Pick<
    LicenceManager,
    | "status"
    | "licence"
    | "now"
    | "requestTrial"
    | "verifyTrial"
    | "redeem"
    | "checkIn"
    | "sendFeedback"
    | "setConsent"
  >;
  isLicenceWindow(sender: unknown): boolean;
  appVersion: string;
  logError(message: string, error: unknown): void;
  /** Told the new status once a trial verify or a redeem has installed a licence. */
  onChanged(status: LicenceStatus): void;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const TRIAL_CODE = /^\d{6}$/;
const REDEEM_CODE = /^[A-Za-z0-9_-]{22}$/;

function field(input: unknown, name: string): unknown {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)[name]
    : undefined;
}

function text(value: unknown, max: number, min = 0): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function matching(value: unknown, pattern: RegExp, max = 254): string | null {
  const trimmed = text(value, max, 1);
  return trimmed !== null && pattern.test(trimmed) ? trimmed : null;
}

function consentChoice(input: unknown): ConsentChoice | null {
  const kind = field(input, "kind");
  const granted = field(input, "granted");
  const quote = text(field(input, "quote") ?? "", 2000);
  const name = field(input, "displayName") ?? null;
  const displayName = name === null ? null : text(name, 120, 1);
  if (kind !== "testimonial" && kind !== "name") return null;
  if (typeof granted !== "boolean" || quote === null || (name !== null && displayName === null))
    return null;
  return { kind, granted, quote, displayName };
}

/** Serves the licence and feedback windows; every input is checked here before it reaches the manager. */
export function registerLicenceIpc(deps: LicenceIpcDeps): void {
  const { manager } = deps;
  const on = (channel: string, run: (input: unknown) => Promise<unknown> | null) =>
    deps.handle(channel, async (event, input) => {
      if (!deps.isLicenceWindow(event.sender)) return { ok: false, reason: "forbidden" };
      try {
        return (await run(input)) ?? { ok: false, reason: "invalid_input" };
      } catch (error) {
        deps.logError(`${channel} failed`, error);
        return { ok: false, reason: "failed" };
      }
    });
  const installs = async (reply: Promise<LicenceReply>): Promise<LicenceReply> => {
    const result = await reply;
    if (!result.ok) return result;
    try {
      deps.onChanged(result.status);
    } catch (error) {
      deps.logError("licence change notice failed", error);
    }
    return result;
  };

  on(LICENCE_CHANNELS.state, async () => {
    const licence = manager.licence();
    return {
      ok: true,
      status: manager.status(),
      kind: licence?.kind ?? null,
      expiresAt: licence?.expiresAt ?? null,
      updatesUntil: licence?.updatesUntil ?? null,
      now: manager.now(),
      allowance: manager.allowance(),
    };
  });
  on(LICENCE_CHANNELS.trialRequest, (input) => {
    const email = matching(field(input, "email"), EMAIL);
    return email ? manager.requestTrial(email) : null;
  });
  on(LICENCE_CHANNELS.trialVerify, (input) => {
    const email = matching(field(input, "email"), EMAIL);
    const code = matching(field(input, "code"), TRIAL_CODE);
    return email && code ? installs(manager.verifyTrial(email, code)) : null;
  });
  on(LICENCE_CHANNELS.redeem, (input) => {
    const code = matching(field(input, "code"), REDEEM_CODE);
    return code ? installs(manager.redeem(code)) : null;
  });
  on(LICENCE_CHANNELS.reconnect, async () => ({ ok: true, status: await manager.checkIn() }));
  on(LICENCE_CHANNELS.feedbackSend, (input) => {
    const body = text(field(input, "body"), 5000, 1);
    return body ? manager.sendFeedback(body, deps.appVersion) : null;
  });
  on(LICENCE_CHANNELS.feedbackConsent, (input) => {
    const choice = consentChoice(input);
    return choice ? manager.setConsent(choice) : null;
  });
}
