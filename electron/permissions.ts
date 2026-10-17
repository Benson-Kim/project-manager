/**
 * Browser permissions the app's own pages may have in the desktop shell:
 * desktop notifications for due alerts ("Enable desktop alerts") and writing
 * the clipboard (an attachment's "Copy" location). Everything else, and any
 * other origin, is refused.
 */
const ALLOWED = new Set(["notifications", "clipboard-sanitized-write"]);

export function allowPermission(
  permission: string,
  requestingUrl: string,
  ownUrl: string,
): boolean {
  if (!ALLOWED.has(permission)) return false;
  try {
    return new URL(requestingUrl).origin === new URL(ownUrl).origin;
  } catch {
    return false;
  }
}
