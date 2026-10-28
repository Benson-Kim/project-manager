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
