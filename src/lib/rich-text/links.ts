/**
 * The one link rule for rich text (ADR-0025): absolute http, https or mailto
 * URLs only. Shared by the editor (Tiptap's isAllowedUri, the link dialog) and
 * the server sanitiser, so what the toolbar can create is exactly what storage
 * keeps. Control characters and whitespace are ignored while checking, the way
 * browsers ignore them when they parse a scheme ("java\tscript:").
 */
const ALLOWED_SCHEME = /^(?:https?:\/\/|mailto:)/i;

// Built from code points so the source carries no control characters.
const IGNORED_IN_SCHEME = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(32)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`,
  "g",
);

export function isAllowedLinkHref(href: string): boolean {
  return ALLOWED_SCHEME.test(href.replace(IGNORED_IN_SCHEME, ""));
}

/**
 * Local folder links (ADR-0075). Stored as data-local-path on an <a> with no
 * href, never a file: URL. Only drive paths ("C:\Users\...\CIUSS Pilot 2025");
 * UNC shares are refused because opening one sends Windows credentials to that
 * host. The desktop main process repeats this check before it opens anything.
 */
export const BLOCKED_LOCAL_EXTENSIONS: readonly string[] = [
  "exe",
  "bat",
  "cmd",
  "com",
  "ps1",
  "msi",
  "msp",
  "lnk",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "scr",
  "pif",
  "reg",
  "hta",
  "cpl",
  "jar",
  "msc",
  "sh",
];

export type LocalPathProblem = "invalid" | "executable";

const DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const UNSAFE_IN_PATH = /[<>"|?*:]/;
const MAX_LOCAL_PATH = 260;

/** Why a local path is refused, or null when it may be kept and opened. */
export function localPathProblem(input: string): LocalPathProblem | null {
  const path = input.trim();
  if (!DRIVE_PATH.test(path) || path.length > MAX_LOCAL_PATH) return "invalid";
  if (new RegExp(IGNORED_IN_SCHEME.source).test(path.replace(/ /g, ""))) return "invalid";
  if (UNSAFE_IN_PATH.test(path.slice(2))) return "invalid";
  const segments = path.slice(3).split(/[\\/]/);
  if (segments.some((segment) => segment === "." || segment === "..")) return "invalid";
  // Windows drops trailing dots and spaces, so "run.exe. " still runs run.exe.
  const last = (segments.filter((segment) => segment !== "").at(-1) ?? "").replace(/[. ]+$/, "");
  const extension = last.includes(".") ? last.slice(last.lastIndexOf(".") + 1).toLowerCase() : "";
  return BLOCKED_LOCAL_EXTENSIONS.includes(extension) ? "executable" : null;
}

export function isAllowedLocalPath(input: string): boolean {
  return localPathProblem(input) === null;
}

export type LinkTarget = { kind: "url"; href: string } | { kind: "localPath"; path: string };

/** The link dialog's reading of typed input: a URL, a local folder, or why neither. */
export function parseLinkInput(
  input: string,
): LinkTarget | { kind: "refused"; reason: LocalPathProblem } {
  const value = input.trim();
  if (DRIVE_PATH.test(value)) {
    const reason = localPathProblem(value);
    return reason ? { kind: "refused", reason } : { kind: "localPath", path: value };
  }
  const href = normaliseLinkInput(value);
  return href ? { kind: "url", href } : { kind: "refused", reason: "invalid" };
}

/**
 * What the link dialog stores for typed input: trimmed; a bare address
 * ("example.com/page") becomes https; an e-mail address becomes mailto.
 * Returns null when the result is still not an allowed link.
 */
export function normaliseLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (isAllowedLinkHref(value)) return value;
  // Any other explicit scheme (javascript:, data:, ftp:, tel:) is refused; a
  // colon before digits is a port ("example.com:8080"), not a scheme.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return null;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
  if (/^[^\s/]+\.[^\s/]+/.test(value) && !value.startsWith("/")) return `https://${value}`;
  return null;
}

export type OpenLocalPathResult = { ok: true } | { ok: false; reason: "notFound" | "refused" };

/** A folder link has no href, so it needs these to be reachable by keyboard. */
export const LOCAL_PATH_LINK_ATTRIBUTES = { tabindex: "0", role: "link" } as const;
