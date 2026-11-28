import { isAllowedImageSrc } from "@/lib/rich-text/images";

const IMAGE_TAG = /<img\b[^>]*>/gi;
const SRC_ATTRIBUTE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
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

/** The sanitiser keeps only pictures the app already stores, so any other src is dropped. */
export function dropsImages(html: string): boolean {
  return (html.match(IMAGE_TAG) ?? []).some((tag) => {
    const match = SRC_ATTRIBUTE.exec(tag);
    return !isAllowedImageSrc(match?.[1] ?? match?.[2] ?? match?.[3]);
  });
}
