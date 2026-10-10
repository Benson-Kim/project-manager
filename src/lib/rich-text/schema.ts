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
 * True when the document has no visible content: only empty paragraphs,
 * spans, line breaks and (non-breaking) spaces. "<p></p>" is Tiptap's empty
 * document. Tables and list items count as content.
 */
export function isEmptyRichText(html: string): boolean {
  return html.replace(/<\/?(?:p|span|br)\b[^>]*>|&nbsp;|\s/gi, "") === "";
}

export interface RichTextSchemaOptions {
  /** Maximum length of the sanitised HTML (the stored value). */
  max: number;
  /** Error message when the field is required; omit for an optional field. */
  required?: string;
}

/**
 * Sanitises (on the server), treats an empty document as null, and enforces
 * `max` on the sanitised HTML. Output: string | null (string when required).
 */
export function richTextSchema(options: { max: number; required: string }): z.ZodType<string>;
export function richTextSchema(options: { max: number }): z.ZodType<string | null>;
export function richTextSchema({ max, required }: RichTextSchemaOptions): z.ZodType<string | null> {
  const stored = required
    ? z.string({ error: required }).max(max, messages.richText.tooLong)
    : z.string().max(max, messages.richText.tooLong).nullable();
  return z.preprocess((value) => {
    if (value == null) return null;
    const clean = currentSanitizer()(String(value));
    return isEmptyRichText(clean) ? null : clean;
  }, stored);
}
