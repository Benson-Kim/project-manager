const IMAGE_TAG = /<img\b[^>]*>/gi;
const TABLE_TAG = /<table\b/i;

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|xml)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, "")
    .trim();
}

export function countImages(html: string): number {
  return html.match(IMAGE_TAG)?.length ?? 0;
}

export function prefersClipboardHtml(html: string): boolean {
  return TABLE_TAG.test(html) || visibleText(html) !== "";
}

export function dropsImages(html: string, sanitize: (html: string) => string): boolean {
  const pasted = countImages(html);
  return pasted > 0 && countImages(sanitize(html)) < pasted;
}
