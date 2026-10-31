/**
 * Text saved before a field took rich text has no markup. Its lines become paragraphs, escaped,
 * so the line breaks it was written with still show; anything already marked up is left alone.
 */
export function asRichText(value: string): string {
  if (!value || /<\/?[a-z][^>]*>/i.test(value)) return value;
  const escape = (line: string) =>
    line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${escape(line)}</p>`)
    .join("");
}

/**
 * The words a rich-text field reads as, for a row label, a sheet title or a
 * delete confirmation — places that take a string, not a node. Tags are
 * dropped, block ends become spaces so two paragraphs do not run together, and
 * the five named entities the sanitiser writes are decoded. Never use it to
 * render: it unescapes, so its result is text, not HTML.
 */
export function richTextToPlain(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
