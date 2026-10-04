import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Next.js 16 proxy (formerly middleware): per-request nonce-based CSP + the
 * authentication gate (module #4): unauthenticated requests only reach /login,
 * the Auth.js routes and the PWA manifest — everything else redirects to
 * /login. A request that carried a session cookie which no longer decodes gets
 * /login?reason=expired so the login page announces the expiry politely.
 * Session integrity (SessionVersion revocation stamp) is enforced per request
 * in src/lib/auth/provider.ts — this gate is routing, not the last defence.
 */
const PUBLIC_PATHS = ["/login", "/api/auth", "/manifest.webmanifest", "/sw.js", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.includes("authjs.session-token") && c.value.length > 0);
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // React's development build needs eval() for debugging features (rebuilding
  // callstacks, HMR). It never uses eval() in production, so 'unsafe-eval' is
  // scoped strictly to dev — shipping it would defeat the point of the policy.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  ].join(" ");
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;
  if (!isPublic(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: request.nextUrl.protocol === "https:",
    });
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      if (hasSessionCookie(request)) loginUrl.searchParams.set("reason", "expired");
      const redirect = NextResponse.redirect(loginUrl);
      redirect.headers.set("Content-Security-Policy", csp);
      redirect.headers.set("X-Frame-Options", "DENY");
      redirect.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      return redirect;
    }
    // Forced first-login password change (STANDARDS §4): the flag travels in
    // the JWT, so this gate needs no DB access and stays edge-safe.
    const appToken = token.appToken as { mustChangePassword?: boolean } | undefined;
    if (appToken?.mustChangePassword && pathname !== "/change-password") {
      const changeUrl = new URL("/change-password", request.url);
      const redirect = NextResponse.redirect(changeUrl);
      redirect.headers.set("Content-Security-Policy", csp);
      redirect.headers.set("X-Frame-Options", "DENY");
      redirect.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      return redirect;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and prebuilt files.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
