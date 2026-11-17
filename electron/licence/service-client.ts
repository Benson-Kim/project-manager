const TIMEOUT = 15_000;

export class LicenceServiceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function serviceBase(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const base = new URL(url);
    return base.protocol === "https:" && !base.username && !base.password && !base.search
      ? base
      : null;
  } catch {
    return null;
  }
}

export class LicenceServiceClient {
  constructor(
    private readonly base: URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.base), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch {
      throw new LicenceServiceError("offline");
    }
    const reply = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok)
      throw new LicenceServiceError(typeof reply.error === "string" ? reply.error : "failed");
    return reply;
  }
}
