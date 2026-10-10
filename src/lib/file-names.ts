/**
 * Attachment file names (ADR-0026 §4): pure, so the client and the server
 * clean a name the same way. Names are display and download names only: bytes
 * are stored under their SHA-256 hash, so a name never becomes a path.
 */

export const FILE_NAME_MAX = 255;

/** Control characters, path separators and the characters Windows forbids in file names. */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]/g;

/** Half of a surrogate pair on its own: not text, and encodeURIComponent throws on it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Cut to at most `max` UTF-16 units without splitting a surrogate pair. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** The lower-case extension with its dot (".pdf"), or "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  const ext = name.slice(dot).toLowerCase();
  return ext.length <= 16 && !/\s/.test(ext) ? ext : "";
}

/**
 * A safe display name: path separators, control and Windows-forbidden
 * characters removed, whitespace collapsed, trailing dots and spaces dropped
 * (Windows drops them too), at most 255 characters with the extension kept.
 * Null when nothing is left.
 */
export function sanitizeFileName(raw: string): string | null {
  const cleaned = raw
    .replace(LONE_SURROGATE, "")
    .normalize("NFC")
    .replace(UNSAFE, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (!cleaned) return null;
  if (cleaned.length <= FILE_NAME_MAX) return cleaned;
  const ext = extensionOf(cleaned);
  return truncate(cleaned.slice(0, cleaned.length - ext.length), FILE_NAME_MAX - ext.length) + ext;
}

/**
 * `Content-Disposition: attachment` for a download (RFC 6266): an ASCII
 * fallback for old clients plus the exact name as `filename*=UTF-8''…`
 * (RFC 8187). Quotes, backslashes, CR/LF and other non-printables can never
 * break out of the header.
 */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_") || "download";
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
