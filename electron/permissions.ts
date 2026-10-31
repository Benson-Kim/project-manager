/**
 * Browser permissions the app's own pages may have in the desktop shell:
 * desktop notifications for due alerts ("Enable desktop alerts"), writing
 * the clipboard (an attachment's "Copy" location) and full screen (the WBS
 * and Gantt "Full screen" toggle). Everything else, and any other origin, is
 * refused.
 */
const ALLOWED = new Set(["notifications", "clipboard-sanitized-write", "fullscreen"]);

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
