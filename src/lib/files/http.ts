import { contentDisposition } from "@/lib/file-names";

/**
 * HTTP helpers for the /api/files handlers (ADR-0026 §3). Those routes are
 * outside the proxy matcher (bodies stream), so they set their own headers
 * and their own CSRF check. Server only.
 */

/**
 * STANDARDS §4: a mutating Route Handler must verify Origin/Sec-Fetch-Site
 * itself. A browser always sends Origin on a POST; the host comparison follows
 * Next's own Server Action check (x-forwarded-host when a proxy sets it).
 */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  const origin = headers.get("origin");
  if (origin === null) return site === "same-origin";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/** A JSON answer in the ActionResult shape the client already understands. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Headers for a stored file: always a download (never rendered in the app's
 * origin), never sniffed into something else, never cached, and sandboxed with
 * an empty CSP in case a browser renders it anyway.
 */
export function downloadHeaders(file: {
  fileName: string;
  contentType: string;
  size: number;
}): Record<string, string> {
  return {
    ...BASE_HEADERS,
    "Content-Type": file.contentType,
    "Content-Length": String(file.size),
    "Content-Disposition": contentDisposition(file.fileName),
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
