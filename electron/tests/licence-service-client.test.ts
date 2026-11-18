import { describe, expect, it, vi } from "vitest";
import {
  LicenceServiceClient,
  LicenceServiceError,
  resolveServiceUrl,
  serviceBase,
} from "../licence/service-client";

const base = new URL("https://licence.example.com/");

function reply(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("LicenceServiceClient", () => {
  it("posts JSON to the path under the base and refuses redirects", async () => {
    const fetcher = vi.fn(async () => reply(200, { ok: true }));
    const client = new LicenceServiceClient(base, fetcher as unknown as typeof fetch);
    await expect(client.post("/v1/checkin", { a: 1 })).resolves.toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://licence.example.com/v1/checkin");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.body).toBe('{"a":1}');
  });

  it("maps a network failure or timeout to offline", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const client = new LicenceServiceClient(base, fetcher as unknown as typeof fetch);
    await expect(client.post("/v1/checkin", {})).rejects.toMatchObject({ code: "offline" });
  });

  it("carries the error code from a refusal", async () => {
    const client = new LicenceServiceClient(base, (async () =>
      reply(429, { error: "rate_limited" })) as unknown as typeof fetch);
    await expect(client.post("/x", {})).rejects.toEqual(new LicenceServiceError("rate_limited"));
  });

  it("never turns free text from a refusal into an error code", async () => {
    const client = new LicenceServiceClient(base, (async () =>
      reply(409, { error: `trial_used ${"a".repeat(64)}` })) as unknown as typeof fetch);
    await expect(client.post("/x", {})).rejects.toMatchObject({ code: "failed" });
  });

  it("falls back to failed when the refusal has no readable code", async () => {
    const client = new LicenceServiceClient(base, (async () =>
      reply(500, "<html>")) as unknown as typeof fetch);
    await expect(client.post("/x", {})).rejects.toMatchObject({ code: "failed" });
  });
});

describe("serviceBase", () => {
  it.each([
    undefined,
    "",
    "http://licence.example.com",
    "https://user:pw@licence.example.com",
    "https://licence.example.com/?a=1",
    "not a url",
  ])("rejects %j", (url) => {
    expect(serviceBase(url)).toBeNull();
  });

  it("accepts a plain https address", () => {
    expect(serviceBase("https://licence.example.com")?.hostname).toBe("licence.example.com");
  });
});

describe("resolveServiceUrl", () => {
  const env = { PM_LICENCE_URL: "https://other.example.com" } as NodeJS.ProcessEnv;

  it("ignores the environment override in an enforcing build", () => {
    expect(resolveServiceUrl("https://built.example.com", true, env)).toBe(
      "https://built.example.com",
    );
  });

  it("still honours the override when licensing is not enforced", () => {
    expect(resolveServiceUrl("https://built.example.com", false, env)).toBe(
      "https://other.example.com",
    );
    expect(resolveServiceUrl("https://built.example.com", false, {} as NodeJS.ProcessEnv)).toBe(
      "https://built.example.com",
    );
  });
});
