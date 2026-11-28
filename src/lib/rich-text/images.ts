/**
 * The picture rule the sanitiser applies (ADR-0025): a stored image served by
 * the app's own file route, nothing else. Shared with the editor so pasted
 * markup can be judged in the browser without reaching sanitize-html, which
 * stays server-only (src/tests/rich-text-boundaries.test.ts).
 */
const ALLOWED_IMAGE_SRC = /^\/api\/files\/[1-9]\d*\?owner=(?:note|daily-activity)$/;

export function isAllowedImageSrc(src: string | undefined): boolean {
  return ALLOWED_IMAGE_SRC.test(src ?? "");
}
