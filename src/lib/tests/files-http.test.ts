import { describe, expect, it } from "vitest";
import { downloadHeaders, isSameOrigin, json } from "../files/http";

const headers = (h: Record<string, string>) => new Headers(h);

describe("isSameOrigin (STANDARDS §4 CSRF for mutating Route Handlers)", () => {
  it.each([
    [{ origin: "https://pm.example", host: "pm.example", "sec-fetch-site": "same-origin" }],
    [{ origin: "https://pm.example", host: "pm.example" }],
    [{ origin: "http://127.0.0.1:51234", host: "127.0.0.1:51234" }],
    [{ origin: "https://pm.example", host: "app:3000", "x-forwarded-host": "pm.example" }],
    [{ host: "pm.example", "sec-fetch-site": "same-origin" }],
  ])("allows %j", (h) => {
    expect(isSameOrigin(headers(h))).toBe(true);
  });

  it.each([
    [{ origin: "https://evil.example", host: "pm.example" }],
    [{ origin: "https://pm.example", host: "pm.example", "sec-fetch-site": "cross-site" }],
    [{ origin: "https://pm.example", host: "pm.example", "sec-fetch-site": "same-site" }],
    [{ origin: "https://pm.example.evil", host: "pm.example" }],
    [{ origin: "null", host: "pm.example" }],
    [{ origin: "https://pm.example" }],
    [{ host: "pm.example" }],
    [{ host: "pm.example", "sec-fetch-site": "none" }],
  ])("refuses %j", (h) => {
    expect(isSameOrigin(headers(h))).toBe(false);
  });
});

describe("response headers (ADR-0026 §3)", () => {
  it("answers JSON that is never cached or sniffed", async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("makes every stored file a sandboxed, uncached download", () => {
    const h = downloadHeaders({ fileName: "Plan.pdf", contentType: "application/pdf", size: 42 });
    expect(h).toMatchObject({
      "Content-Type": "application/pdf",
      "Content-Length": "42",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    expect(h["Content-Disposition"]).toMatch(/^attachment; filename="Plan\.pdf"/);
  });
});
