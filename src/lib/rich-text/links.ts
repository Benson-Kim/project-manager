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
