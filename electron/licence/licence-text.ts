import type { LicenceKind, LicenceStatus } from "./policy";

export interface LicenceView {
  ok: true;
  status: LicenceStatus;
  kind: LicenceKind | null;
  expiresAt: number | null;
  updatesUntil: number | null;
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;
const OFFLINE = "Couldn't reach the licence service. Check the connection and try again.";
const BAD_CODE = "That code didn't work.";

const REASONS: Record<string, string> = {
  offline: OFFLINE,
  failed: OFFLINE,
  invalid: BAD_CODE,
  invalid_input: BAD_CODE,
  invalid_code: BAD_CODE,
  rate_limited: "Too many tries. Wait a few minutes.",
  unlicensed: "Activate the app first.",
  already_licensed: "This PC already has a licence.",
};

export function reasonText(reason: string): string {
  return REASONS[reason] ?? "Something went wrong.";
}

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

export function updateNotIncludedText(version: string, updatesUntil: number): string {
  return `Modulus ${version} is not included with your licence, which covers updates released until ${day(updatesUntil)}.`;
}

function activeText(view: LicenceView): string {
  if (view.kind === "trial" && view.expiresAt !== null) {
    const days = Math.max(1, Math.ceil((view.expiresAt - view.now) / DAY));
    return `Trial: ${days} ${days === 1 ? "day" : "days"} left.`;
  }
  const updates = view.updatesUntil === null ? "" : ` Updates until ${day(view.updatesUntil)}.`;
  return `${view.kind === "full" ? "Licensed." : "Free licence."}${updates}`;
}

export function statusText(view: LicenceView): string {
  switch (view.status) {
    case "active":
      return activeText(view);
    case "expired":
      return `Your ${view.kind === "trial" ? "trial" : "licence"} has ended. You can still view and export your work.`;
    case "reconnect":
      return "Connect to the internet so the app can check the licence. Until then you can view and export your work.";
    case "unlicensed":
      return "Start a 14-day trial, or enter a licence code.";
    case "off":
      return "";
  }
}
