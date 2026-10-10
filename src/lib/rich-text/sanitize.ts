import sanitizeHtml from "sanitize-html";
import { isAllowedLinkHref } from "./links";
import { installRichTextSanitizer } from "./schema";

/**
 * Server-side rich-text sanitiser (ADR-0025). The allow-list is exactly what
 * the toolbar can produce, plus the legacy Access markup it converts:
 * <div> → <p>, <font face size> → <span style>, b/i/strike/del → the editor's
 * strong/em/s. Server only: client modules never import this file
 * (src/tests/rich-text-boundaries.test.ts), so sanitize-html stays out of the
 * browser. Loading it installs the sanitiser for richTextSchema.
 */

const ALIGN = { "text-align": [/^(?:left|right|center|justify)$/] };

/** Word's HTML <font size=1..7> scale, in points. */
const LEGACY_FONT_SIZES_PT = [8, 10, 12, 14, 18, 24, 36] as const;

/** <font size> → points: 1–7, or +n/−n relative to the default size 3. */
export function legacyFontSizeToPt(size: string | undefined): string | null {
  const match = /^\s*([+-]?)(\d)\s*$/.exec(size ?? "");
  if (!match) return null;
  const value = Number(match[2]);
  const index = match[1] === "+" ? 3 + value : match[1] === "-" ? 3 - value : value;
  return `${LEGACY_FONT_SIZES_PT[Math.min(Math.max(index, 1), 7) - 1]}pt`;
}

// Font names: letters, digits, spaces, hyphens, quotes and commas; no ( ) ; : \ or url().
const FONT_FAMILY = /^[\w\s"',-]{1,200}$/;
const FONT_SIZE = /^\d{1,3}(?:\.\d{1,4})?(?:pt|px)$/;
const TEXT_DECORATION = /^(?:none|underline|line-through)(?:\s+(?:underline|line-through))?$/;
const CELL_SPAN = /^(?:[1-9]|[1-4]\d|50)$/;

function cell(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const kept: sanitizeHtml.Attributes = {};
  for (const name of ["colspan", "rowspan"]) {
    const value = attribs[name]?.trim();
    if (value && CELL_SPAN.test(value) && value !== "1") kept[name] = value;
  }
  return { tagName, attribs: kept };
}

/** <font face size> → <span style> with the equivalent font-family / font-size. */
function legacyFont(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const styles: string[] = [];
  const face = attribs.face?.trim();
  if (face && FONT_FAMILY.test(face)) styles.push(`font-family:${face}`);
  const size = legacyFontSizeToPt(attribs.size);
  if (size) styles.push(`font-size:${size}`);
  return { tagName: "span", attribs: styles.length ? { style: styles.join(";") } : {} };
}

/** Only http/https/mailto links survive, always with rel; anything else keeps its text. */
function link(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const href = attribs.href?.trim() ?? "";
  return isAllowedLinkHref(href)
    ? { tagName: "a", attribs: { href, rel: "noopener noreferrer" } }
    : { tagName: "span", attribs: {} };
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "rel"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    span: ["style"],
    p: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
  },
  allowedStyles: {
    span: {
      "font-family": [FONT_FAMILY],
      "font-size": [FONT_SIZE],
      "text-decoration": [TEXT_DECORATION],
    },
    p: ALIGN,
    h2: ALIGN,
    h3: ALIGN,
    h4: ALIGN,
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Their text is dropped with the tag (the rest keep their text).
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "option",
    "noscript",
    "iframe",
    "object",
    "embed",
    "template",
    "title",
    "svg",
    "math",
  ],
  transformTags: {
    div: "p",
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    h1: "h2",
    h5: "h4",
    h6: "h4",
    td: cell,
    th: cell,
    font: legacyFont,
    a: link,
  },
};

/** Sanitises rich-text HTML to the ADR-0025 allow-list. Idempotent. */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/**
 * Plain text for list cards, search snippets and CSV export: block ends and
 * <br> become line breaks, table cells are tab-separated, entities decoded.
 */
export function htmlToPlainText(html: string): string {
  return (
    sanitizeRichText(html)
      // A list item's or cell's last paragraph ends with its container, not a line.
      .replace(/<\/p>(?=<\/(?:li|td|th)>)/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h[2-4]|li|tr|blockquote)>/gi, "\n")
      .replace(/<\/(?:td|th)>/gi, "\t")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

installRichTextSanitizer(sanitizeRichText);
