import sanitizeHtml from "sanitize-html";
import {
  CELL_SHADES,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  indentLevel,
  listStart,
  nearestColor,
  numberingCss,
} from "./formats";
import { isAllowedLinkHref } from "./links";
import { installRichTextSanitizer } from "./schema";

/**
 * Server-side rich-text sanitiser (ADR-0025, ADR-0041). The allow-list is
 * exactly what the toolbar can produce, plus the legacy Access markup it
 * converts: <div> → <p>, <font face size color> → <span style data-color>,
 * b/i/strike/del → the editor's strong/em/s. Colours, shades, indents and
 * numbering are checked against the shared vocabulary (formats.ts). Server only: client modules never import this file
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
const HEADINGS = ["h2", "h3", "h4", "h5", "h6"] as const;
const LIST_STYLE = /^(?:decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/;

function cell(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const kept: sanitizeHtml.Attributes = {};
  for (const name of ["colspan", "rowspan"]) {
    const value = attribs[name]?.trim();
    if (value && CELL_SPAN.test(value) && value !== "1") kept[name] = value;
  }
  const shade = nearestColor(attribs["data-shade"], CELL_SHADES);
  if (shade) kept["data-shade"] = shade;
  return { tagName, attribs: kept };
}

/** The `color:` value of a style attribute (legacy and pasted markup). */
function styleColor(style: string | undefined): string | undefined {
  return style?.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
}

/** p and h2–h6 keep their style (filtered to text-align below) and a valid indent level. */
function block(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const kept: sanitizeHtml.Attributes = {};
  if (attribs.style) kept.style = attribs.style;
  const indent = indentLevel(attribs["data-indent"]);
  if (indent > 0) kept["data-indent"] = String(indent);
  return { tagName, attribs: kept };
}

/** A span keeps its style (filtered below) and a colour name, mapped from a CSS colour if need be. */
function span(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const kept: sanitizeHtml.Attributes = {};
  if (attribs.style) kept.style = attribs.style;
  const color =
    nearestColor(attribs["data-color"], TEXT_COLORS) ??
    nearestColor(styleColor(attribs.style), TEXT_COLORS);
  if (color) kept["data-color"] = color;
  return { tagName: "span", attribs: kept };
}

function highlight(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const color = nearestColor(attribs["data-color"], HIGHLIGHT_COLORS);
  return { tagName: "mark", attribs: color ? { "data-color": color } : {} };
}

/** <ol>: a numbering type other than 1 (with its list-style-type) and a start other than 1. */
function orderedList(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const kept: sanitizeHtml.Attributes = {};
  const start = listStart(attribs.start);
  if (start !== null && start !== 1) kept.start = String(start);
  const type = attribs.type?.trim();
  const css = numberingCss(type);
  if (type && css && type !== "1") {
    kept.type = type;
    kept.style = `list-style-type:${css}`;
  }
  return { tagName: "ol", attribs: kept };
}

/** <hr>: a line, or a page break when it carries data-page-break. */
function rule(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  return {
    tagName: "hr",
    attribs: attribs["data-page-break"] === undefined ? {} : { "data-page-break": "true" },
  };
}

/** <font face size color> → <span style data-color> with the equivalent font and colour name. */
function legacyFont(_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const styles: string[] = [];
  const face = attribs.face?.trim();
  if (face && FONT_FAMILY.test(face)) styles.push(`font-family:${face}`);
  const size = legacyFontSizeToPt(attribs.size);
  if (size) styles.push(`font-size:${size}`);
  const kept: sanitizeHtml.Attributes = styles.length ? { style: styles.join(";") } : {};
  const color = nearestColor(attribs.color, TEXT_COLORS);
  if (color) kept["data-color"] = color;
  return { tagName: "span", attribs: kept };
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
    ...HEADINGS,
    "blockquote",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "span",
    "mark",
    "hr",
  ],
  // The transforms below check every value; these lists only name what may stay.
  allowedAttributes: {
    a: ["href", "rel"],
    td: ["colspan", "rowspan", "data-shade"],
    th: ["colspan", "rowspan", "data-shade"],
    span: ["style", "data-color"],
    mark: ["data-color"],
    ol: ["start", "type", "style"],
    hr: ["data-page-break"],
    p: ["style", "data-indent"],
    ...Object.fromEntries(HEADINGS.map((h) => [h, ["style", "data-indent"]])),
  },
  allowedStyles: {
    span: {
      "font-family": [FONT_FAMILY],
      "font-size": [FONT_SIZE],
      "text-decoration": [TEXT_DECORATION],
    },
    ol: { "list-style-type": [LIST_STYLE] },
    p: ALIGN,
    ...Object.fromEntries(HEADINGS.map((h) => [h, ALIGN])),
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
    div: (_tagName, attribs) => block("p", attribs),
    p: block,
    h1: (_tagName, attribs) => block("h2", attribs),
    ...Object.fromEntries(HEADINGS.map((h) => [h, block])),
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    td: cell,
    th: cell,
    span,
    mark: highlight,
    ol: orderedList,
    hr: rule,
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
      .replace(/<hr[^>]*>/gi, "\n")
      .replace(/<\/(?:p|h[2-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<\/(?:td|th)>/gi, "\t")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .split("\n")
      // The lookbehind starts a match only at the start of a run, which keeps a long run of
      // spaces before a letter linear (without it, 40k spaces took 3.7 s).
      .map((line) => line.replace(/(?<![ \t])[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

installRichTextSanitizer(sanitizeRichText);
