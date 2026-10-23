import { z } from "zod";
import { messages } from "@/lib/messages";

/**
 * Rich-text form field (ADR-0025). Form schemas are shared by the browser and
 * the server action (ADR-0009), so this module must stay free of
 * sanitize-html: the server installs the sanitiser (src/lib/rich-text/
 * sanitize.ts installs itself on load; src/lib/action.ts and RichTextView load
 * it). A server-side parse without it throws, so a missing install fails
 * closed. In the browser the schema only validates; the server parses again
 * and is authoritative.
 */
export type RichTextSanitizer = (html: string) => string;

// On globalThis so every server bundle layer that loads the schema sees one install.
const SANITIZER = Symbol.for("project-manager.rich-text.sanitizer");
type SanitizerHolder = { [SANITIZER]?: RichTextSanitizer };

export function installRichTextSanitizer(sanitize: RichTextSanitizer): void {
  (globalThis as SanitizerHolder)[SANITIZER] = sanitize;
}

function currentSanitizer(): RichTextSanitizer {
  const installed = (globalThis as SanitizerHolder)[SANITIZER];
  if (installed) return installed;
  if (typeof window === "undefined") {
    throw new Error("Rich-text sanitiser not installed: import @/lib/rich-text/sanitize first");
  }
  return (html) => html;
}

/**
 * True when the document has no visible content: no text other than
 * (non-breaking) spaces, and no table or list item. "<p></p>" is Tiptap's
 * empty document; clearing a document that starts with a heading leaves
 * "<h2></h2>", which is empty too.
 */
export function isEmptyRichText(html: string): boolean {
  if (/<(?:table|li)\b/i.test(html)) return false;
  return html.replace(/<[^>]*>|&nbsp;|\s/gi, "") === "";
}

/**
 * Limits checked on the raw input, before the sanitiser parses it. The HTML parser keeps a stack
 * of open elements and costs O(depth) per tag, so a deeply nested document is quadratic: 80k open
 * tags took 5.9 s. Editor documents stay far below both limits (a list nested ten levels inside a
 * table is about 40 deep), and the editor's HTML is about the size of what the sanitiser keeps.
 */
export const RICH_TEXT_NESTING_MAX = 100;
export const RICH_TEXT_RAW_FACTOR = 2;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Whether the HTML opens more than `limit` elements inside each other. One linear pass over the
 * tags; it may overcount markup that leaves tags unclosed, which the editor never writes.
 */
export function nestingExceeds(html: string, limit: number): boolean {
  let depth = 0;
  let open = html.indexOf("<");
  while (open !== -1) {
    const comment = html.startsWith("<!--", open);
    const end = comment ? html.indexOf("-->", open + 4) : html.indexOf(">", open + 1);
    if (end === -1) return false;
    if (comment) {
      open = html.indexOf("<", end + 3);
      continue;
    }
    if (html.charCodeAt(open + 1) === 47) {
      depth = Math.max(0, depth - 1);
    } else {
      const name = /^[a-z][a-z0-9-]*/i.exec(html.slice(open + 1, Math.min(end, open + 16)))?.[0];
      const selfClosing = html.charCodeAt(end - 1) === 47;
      if (name && !selfClosing && !VOID_TAGS.has(name.toLowerCase()) && ++depth > limit) {
        return true;
      }
    }
    open = html.indexOf("<", end + 1);
  }
  return false;
}

export interface RichTextSchemaOptions {
  /** Maximum length of the sanitised HTML (the stored value). */
  max: number;
  /** Error message when the field is required; omit for an optional field. */
  required?: string;
}

/**
 * Refuses raw input over RICH_TEXT_RAW_FACTOR x `max` or nested deeper than
 * RICH_TEXT_NESTING_MAX before parsing it, then sanitises (on the server),
 * treats an empty document as null, and enforces `max` on the sanitised HTML.
 * Output: string | null (string when required).
 */
export function richTextSchema(options: { max: number; required: string }): z.ZodType<string>;
export function richTextSchema(options: { max: number }): z.ZodType<string | null>;
export function richTextSchema({ max, required }: RichTextSchemaOptions): z.ZodType<string | null> {
  const stored = required
    ? z.string({ error: required }).max(max, messages.richText.tooLong)
    : z.string().max(max, messages.richText.tooLong).nullable();
  return z.preprocess((value, ctx) => {
    if (value == null) return null;
    const raw = String(value);
    if (raw.length > max * RICH_TEXT_RAW_FACTOR) {
      ctx.addIssue({ code: "custom", message: messages.richText.tooLong });
      return z.NEVER;
    }
    if (nestingExceeds(raw, RICH_TEXT_NESTING_MAX)) {
      ctx.addIssue({ code: "custom", message: messages.richText.tooDeep });
      return z.NEVER;
    }
    const clean = currentSanitizer()(raw);
    return isEmptyRichText(clean) ? null : clean;
  }, stored);
}
