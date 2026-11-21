import { sameSecret } from "./crypto";
import type { LicenceService, Outcome, ServiceError } from "./service";

export type LogEvent = Record<string, string | number | boolean | null>;

export interface HandlerDeps {
  service: LicenceService;
  adminToken: string;
  readToken?: string;
  log?: (event: LogEvent) => void;
  adminPage: { html: string; script: string };
}

type Body = Record<string, unknown>;
type Route = (body: Body, client: string | null) => Promise<Response>;
type Scope = "read" | "mint";

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
  mail_unavailable: 503,
};

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const MAX_USED_MS = 366 * 24 * 60 * 60 * 1000;

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

function duration(body: Body, name: string, max: number): number {
  const value = body[name] ?? 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new InvalidRequest(name);
  }
  return value as number;
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

function exact(body: Body, fields: readonly string[]): void {
  for (const key of Object.keys(body)) if (!fields.includes(key)) throw new InvalidRequest(key);
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

  const strict =
    (fields: readonly string[], route: Route): Route =>
    (body, client) => {
      exact(body, fields);
      return route(body, client);
    };

  const publicRoutes: Record<string, Route> = {
    "/v1/trial/start": strict(["email", "machineHash"], async (b, client) => {
      const outcome = await service.startTrial(
        match(b, "email", PATTERNS.email),
        match(b, "machineHash", PATTERNS.machineHash),
        client,
      );
      return outcome.ok || !["rate_limited", "mail_unavailable"].includes(outcome.error)
        ? json(202, {})
        : reply(outcome);
    }),
    "/v1/trial/verify": strict(["email", "machineHash", "code"], async (b) =>
      reply(
        await service.verifyTrial(
          match(b, "email", PATTERNS.email),
          match(b, "machineHash", PATTERNS.machineHash),
          match(b, "code", PATTERNS.code),
        ),
      ),
    ),
    "/v1/checkin": strict(["licenceId", "machineHash", "nonce", "usedMs"], async (b) =>
      reply(
        await service.checkIn(
          match(b, "licenceId", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
          match(b, "nonce", PATTERNS.nonce),
          duration(b, "usedMs", MAX_USED_MS),
        ),
      ),
    ),
    "/v1/licence/redeem": strict(["code", "machineHash"], async (b) =>
      reply(
        await service.redeem(
          match(b, "code", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
        ),
      ),
    ),
    "/v1/feedback": strict(["licenceId", "machineHash", "body", "appVersion"], async (b) =>
      reply(
        await service.recordFeedback(
          match(b, "licenceId", PATTERNS.id),
          match(b, "machineHash", PATTERNS.machineHash),
          text(b, "body", 1, 5000),
          match(b, "appVersion", PATTERNS.version),
        ),
      ),
    ),
    "/v1/consent": strict(
      ["licenceId", "machineHash", "kind", "granted", "quote", "displayName"],
      async (b) =>
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
    ),
  };

  const adminRoutes: Record<string, { scope: Scope; run: Route }> = {
    "/v1/admin/testers": {
      scope: "read",
      run: strict([], async () => json(200, { testers: await service.listTesters() })),
    },
    "/v1/admin/feedback": {
      scope: "read",
      run: strict(["licenceId"], async (b) =>
        json(200, { feedback: await service.listFeedback(match(b, "licenceId", PATTERNS.id)) }),
      ),
    },
    "/v1/admin/convert": {
      scope: "mint",
      run: strict(["licenceId", "kind"], async (b) =>
        reply(await service.convert(match(b, "licenceId", PATTERNS.id), oneOf(b, "kind", kinds))),
      ),
    },
    "/v1/admin/issue": {
      scope: "mint",
      run: strict(["kind"], async (b) =>
        reply(await service.issueRedeemable(oneOf(b, "kind", kinds))),
      ),
    },
  };

  const log = (event: LogEvent) => deps.log?.(event);

  async function scopeOf(request: Request): Promise<Scope | null> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const full = deps.adminToken.length >= 32 && (await sameSecret(token, deps.adminToken));
    const read =
      deps.readToken !== undefined &&
      deps.readToken.length >= 32 &&
      (await sameSecret(token, deps.readToken));
    return full ? "mint" : read ? "read" : null;
  }

  function auditDetail(body: Body): string | null {
    const detail: Record<string, string> = {};
    const id = body.licenceId;
    if (typeof id === "string" && PATTERNS.id.test(id)) detail.licenceId = id;
    if (body.kind === "free" || body.kind === "full") detail.kind = body.kind;
    return Object.keys(detail).length > 0 ? JSON.stringify(detail) : null;
  }

  async function handleAdmin(
    request: Request,
    pathname: string,
    route: { scope: Scope; run: Route },
    client: string,
  ): Promise<Response> {
    if (await service.adminBlocked(client)) {
      log({ event: "admin_blocked", path: pathname, client });
      return json(429, { error: "rate_limited" });
    }
    const scope = await scopeOf(request);
    if (!scope) {
      await service.noteAdminFailure(client);
      log({ event: "admin_denied", path: pathname, client });
      return json(401, { error: "unauthorised" });
    }
    if (route.scope === "mint" && scope !== "mint") {
      log({ event: "admin_forbidden", path: pathname, client });
      return json(403, { error: "forbidden" });
    }
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    const body = await readBody(request);
    const response = await route.run(body, client);
    await service.recordAdminEvent({
      action: pathname,
      scope,
      client,
      detail: auditDetail(body),
    });
    log({ event: "admin_action", path: pathname, scope, client, status: response.status });
    return response;
  }

  return async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const client = request.headers.get("cf-connecting-ip");
    try {
      if (request.method === "GET" && pathname === "/admin")
        return adminAsset(deps.adminPage.html, "text/html");
      if (request.method === "GET" && pathname === "/admin.js") {
        return adminAsset(deps.adminPage.script, "text/javascript");
      }
      const publicRoute = publicRoutes[pathname];
      const adminRoute = adminRoutes[pathname];
      if (!publicRoute && !adminRoute) return json(404, { error: "not_found" });
      if (adminRoute) return await handleAdmin(request, pathname, adminRoute, client ?? "unknown");
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      const response = await publicRoute(await readBody(request), client);
      if (response.status === 429) log({ event: "rate_limited", path: pathname });
      return response;
    } catch (error) {
      if (error instanceof InvalidRequest) return json(400, { error: "invalid_request" });
      log({
        event: "internal_error",
        path: pathname,
        error: error instanceof Error ? error.name : "unknown",
      });
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
