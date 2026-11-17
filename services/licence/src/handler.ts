import { sameSecret } from "./crypto";
import type { LicenceService, Outcome, ServiceError } from "./service";

export interface HandlerDeps {
  service: LicenceService;
  adminToken: string;
  adminPage: { html: string; script: string };
}

type Body = Record<string, unknown>;
type Route = (body: Body) => Promise<Response>;

const MAX_BODY = 16_384;

const PATTERNS = {
  email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/,
  machineHash: /^[0-9a-f]{64}$/,
  code: /^\d{6}$/,
  id: /^[A-Za-z0-9_-]{22}$/,
  nonce: /^[A-Za-z0-9_-]{16,64}$/,
  version: /^[0-9A-Za-z.+-]{1,32}$/,
} as const;

const STATUS: Record<ServiceError, number> = {
  invalid_code: 400,
  trial_used: 409,
  rate_limited: 429,
  unknown_licence: 404,
  not_found: 404,
};

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

class InvalidRequest extends Error {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function reply<T>(outcome: Outcome<T>): Response {
  return outcome.ok
    ? json(200, outcome.value ?? {})
    : json(STATUS[outcome.error], { error: outcome.error });
}

function match(body: Body, name: string, pattern: RegExp): string {
  const value = body[name];
  if (typeof value !== "string" || !pattern.test(value)) throw new InvalidRequest(name);
  return value;
}

function text(body: Body, name: string, min: number, max: number): string {
  const value = body[name] ?? "";
  if (typeof value !== "string") throw new InvalidRequest(name);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new InvalidRequest(name);
  return trimmed;
}

function oneOf<T extends string>(body: Body, name: string, values: readonly T[]): T {
  const value = body[name];
  if (typeof value !== "string" || !values.includes(value as T)) throw new InvalidRequest(name);
  return value as T;
}

function flag(body: Body, name: string): boolean {
  const value = body[name];
  if (typeof value !== "boolean") throw new InvalidRequest(name);
  return value;
}

async function readBody(request: Request): Promise<Body> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new InvalidRequest("content-type");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new InvalidRequest("size");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidRequest("json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidRequest("json");
  }
  return parsed as Body;
}

export function createHandler(deps: HandlerDeps): (request: Request) => Promise<Response> {
  const { service } = deps;
  const kinds = ["free", "full"] as const;

  const publicRoutes: Record<string, Route> = {
    "/v1/trial/start": async (b) => {
      const outcome = await service.startTrial(
        match(b, "email", PATTERNS.email),
        match(b, "machineHash", PATTERNS.machineHash),
      );
      return outcome.ok || outcome.error !== "rate_limited" ? json(202, {}) : reply(outcome);
    },
    "/v1/trial/verify": async (b) =>
      reply(
        await service.verifyTrial(
          match(b, "email", PATTERNS.email),
          match(b, "machineHash", PATTERNS.machineHash),
          match(b, "code", PATTERNS.code),
        ),
      ),
    "/v1/checkin": async (b) =>
      reply(
        await service.checkIn(
          match(b, "licenceId", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
          match(b, "nonce", PATTERNS.nonce),
        ),
      ),
    "/v1/licence/redeem": async (b) =>
      reply(
        await service.redeem(
          match(b, "code", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
        ),
      ),
    "/v1/feedback": async (b) =>
      reply(
        await service.recordFeedback(
          match(b, "licenceId", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
          text(b, "body", 1, 5000),
          match(b, "appVersion", PATTERNS.version),
        ),
      ),
    "/v1/consent": async (b) =>
      reply(
        await service.recordConsent(
          match(b, "licenceId", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
          {
            kind: oneOf(b, "kind", ["testimonial", "name"] as const),
            granted: flag(b, "granted"),
            quote: text(b, "quote", 0, 2000),
            displayName: text(b, "displayName", 0, 120) || null,
          },
        ),
      ),
  };

  const adminRoutes: Record<string, Route> = {
    "/v1/admin/testers": async () => json(200, { testers: await service.listTesters() }),
    "/v1/admin/feedback": async (b) =>
      json(200, { feedback: await service.listFeedback(match(b, "licenceId", PATTERNS.id)) }),
    "/v1/admin/convert": async (b) =>
      reply(await service.convert(match(b, "licenceId", PATTERNS.id), oneOf(b, "kind", kinds))),
    "/v1/admin/issue": async (b) => reply(await service.issueRedeemable(oneOf(b, "kind", kinds))),
  };

  async function isAdmin(request: Request): Promise<boolean> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return deps.adminToken.length >= 32 && (await sameSecret(token, deps.adminToken));
  }

  return async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (request.method === "GET" && pathname === "/admin")
        return adminAsset(deps.adminPage.html, "text/html");
      if (request.method === "GET" && pathname === "/admin.js") {
        return adminAsset(deps.adminPage.script, "text/javascript");
      }
      const publicRoute = publicRoutes[pathname];
      const adminRoute = adminRoutes[pathname];
      if (!publicRoute && !adminRoute) return json(404, { error: "not_found" });
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      if (adminRoute) {
        if (!(await isAdmin(request))) return json(401, { error: "unauthorised" });
        return await adminRoute(await readBody(request));
      }
      return await publicRoute(await readBody(request));
    } catch (error) {
      if (error instanceof InvalidRequest) return json(400, { error: "invalid_request" });
      return json(500, { error: "internal" });
    }
  };
}

function adminAsset(body: string, type: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": `${type}; charset=utf-8`,
      "content-security-policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "x-frame-options": "DENY",
    },
  });
}
