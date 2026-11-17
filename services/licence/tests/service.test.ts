import { describe, expect, it } from "vitest";
import { adminHtml, adminScript } from "../src/admin-page";
import { ed25519Signer, fromBase64Url, type SignedDocument } from "../src/crypto";
import { createHandler } from "../src/handler";
import { MemoryStore } from "../src/memory-store";
import {
  CODE_ATTEMPTS,
  CODE_LIFETIME,
  FREE_UPDATES,
  LicenceService,
  TRIAL_LENGTH,
} from "../src/service";

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 17);
const machineA = "a".repeat(64);
const machineB = "b".repeat(64);
const email = "tester@example.com";

type Payload = Record<string, unknown>;

async function setup() {
  const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const signer = await ed25519Signer("test", pkcs8);
  const adminToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const sent: { email: string; code: string }[] = [];
  const clock = { at: START, now: () => clock.at };
  const store = new MemoryStore();
  const service = new LicenceService({
    store,
    mailer: { sendCode: async (to, code) => void sent.push({ email: to, code }) },
    clock,
    signer,
  });
  const handle = createHandler({
    service,
    adminToken,
    adminPage: { html: adminHtml, script: `(${adminScript.toString()})();` },
  });

  async function call(path: string, body: unknown, headers: Record<string, string> = {}) {
    const response = await handle(
      new Request(`https://licence.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  const admin = (path: string, body: unknown) =>
    call(path, body, { authorization: `Bearer ${adminToken}` });

  async function open(document: unknown): Promise<Payload> {
    const doc = document as SignedDocument;
    const valid = await crypto.subtle.verify(
      "Ed25519",
      keys.publicKey,
      new Uint8Array(fromBase64Url(doc.sig)),
      new TextEncoder().encode(doc.payload),
    );
    expect(valid).toBe(true);
    return JSON.parse(new TextDecoder().decode(fromBase64Url(doc.payload))) as Payload;
  }

  async function trial(address = email, machineHash = machineA) {
    expect((await call("/v1/trial/start", { email: address, machineHash })).status).toBe(202);
    const code = sent.at(-1)?.code ?? "";
    return call("/v1/trial/verify", { email: address, machineHash, code });
  }

  return { clock, sent, service, handle, call, admin, open, trial };
}

describe("licence service", () => {
  it("issues a signed 14-day trial dated by the server clock", async () => {
    const t = await setup();
    const result = await t.trial();
    expect(result.status).toBe(200);
    const licence = await t.open(result.body);
    expect(licence).toMatchObject({ kind: "trial", machineHash: machineA, startsAt: START });
    expect(licence.expiresAt).toBe(START + TRIAL_LENGTH);
  });

  it("keeps the original start date when the app is reinstalled", async () => {
    const t = await setup();
    const first = await t.open((await t.trial()).body);
    t.clock.at += 5 * DAY;
    const again = await t.open((await t.trial()).body);
    expect(again.licenceId).toBe(first.licenceId);
    expect(again.startsAt).toBe(START);
    expect(again.expiresAt).toBe(START + TRIAL_LENGTH);
  });

  it("refuses a second trial for the same machine or the same email", async () => {
    const t = await setup();
    await t.trial();
    expect((await t.trial("other@example.com", machineA)).body).toEqual({ error: "trial_used" });
    expect((await t.trial(email, machineB)).status).toBe(409);
  });

  it("ignores extra fields such as a requested licence kind", async () => {
    const t = await setup();
    await t.call("/v1/trial/start", { email, machineHash: machineA });
    const code = t.sent.at(-1)?.code;
    const result = await t.call("/v1/trial/verify", {
      email,
      machineHash: machineA,
      code,
      kind: "full",
      expiresAt: null,
    });
    expect((await t.open(result.body)).kind).toBe("trial");
  });

  it("burns the code after too many wrong guesses and after it expires", async () => {
    const t = await setup();
    await t.call("/v1/trial/start", { email, machineHash: machineA });
    const code = t.sent.at(-1)?.code ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      await t.call("/v1/trial/verify", { email, machineHash: machineA, code: wrong });
    }
    expect((await t.call("/v1/trial/verify", { email, machineHash: machineA, code })).body).toEqual(
      {
        error: "invalid_code",
      },
    );

    await t.call("/v1/trial/start", { email, machineHash: machineA });
    t.clock.at += CODE_LIFETIME + 1;
    const late = await t.call("/v1/trial/verify", {
      email,
      machineHash: machineA,
      code: t.sent.at(-1)?.code,
    });
    expect(late.status).toBe(400);
  });

  it("rate limits code checks and trial starts", async () => {
    const t = await setup();
    const verify = () =>
      t.call("/v1/trial/verify", { email, machineHash: machineA, code: "123456" });
    for (let i = 0; i < 10; i++) expect((await verify()).status).toBe(400);
    expect((await verify()).status).toBe(429);

    for (let i = 0; i < 5; i++)
      await t.call("/v1/trial/start", { email: "x@example.com", machineHash: machineB });
    expect(
      (await t.call("/v1/trial/start", { email: "x@example.com", machineHash: machineB })).status,
    ).toBe(429);
    t.clock.at += 61 * 60_000;
    expect(
      (await t.call("/v1/trial/start", { email: "x@example.com", machineHash: machineB })).status,
    ).toBe(202);
  });

  it("answers a check-in with the converted licence and the server time", async () => {
    const t = await setup();
    const { licenceId } = await t.open((await t.trial()).body);
    t.clock.at += 20 * DAY;
    expect((await t.admin("/v1/admin/convert", { licenceId, kind: "free" })).status).toBe(200);
    const nonce = "n".repeat(24);
    const reply = await t.open(
      (await t.call("/v1/checkin", { licenceId, machineHash: machineA, nonce })).body,
    );
    expect(reply).toMatchObject({
      licenceId,
      machineHash: machineA,
      nonce,
      serverTime: t.clock.at,
    });
    const licence = await t.open(reply.licence);
    expect(licence).toMatchObject({ kind: "free", expiresAt: null, startsAt: START });
    expect(licence.updatesUntil).toBe(t.clock.at + FREE_UPDATES);
  });

  it("refuses check-ins, feedback and consent from another machine", async () => {
    const t = await setup();
    const { licenceId } = await t.open((await t.trial()).body);
    const other = { licenceId, machineHash: machineB };
    expect((await t.call("/v1/checkin", { ...other, nonce: "n".repeat(24) })).status).toBe(404);
    expect(
      (await t.call("/v1/feedback", { ...other, body: "hi", appVersion: "1.0.0" })).status,
    ).toBe(404);
    expect(
      (
        await t.call("/v1/consent", {
          ...other,
          kind: "name",
          granted: true,
          quote: "",
          displayName: "A",
        })
      ).status,
    ).toBe(404);
  });

  it("keeps the latest consent so a tester can withdraw it", async () => {
    const t = await setup();
    const { licenceId } = (await t.open((await t.trial()).body)) as { licenceId: string };
    const consent = {
      licenceId,
      machineHash: machineA,
      kind: "testimonial",
      quote: "Saves us hours",
    };
    expect((await t.call("/v1/consent", { ...consent, granted: true })).status).toBe(200);
    t.clock.at += 1000;
    expect((await t.call("/v1/consent", { ...consent, granted: false })).status).toBe(200);
    expect(
      (
        await t.call("/v1/feedback", {
          licenceId,
          machineHash: machineA,
          body: "Nice",
          appVersion: "1.0.0",
        })
      ).status,
    ).toBe(200);
    const [row] = (await t.admin("/v1/admin/testers", {})).body.testers as {
      email: string;
      feedbackCount: number;
      consents: { kind: string; granted: boolean }[];
    }[];
    expect(row).toMatchObject({ email, feedbackCount: 1 });
    expect(row?.consents).toEqual([
      expect.objectContaining({ kind: "testimonial", granted: false }),
    ]);
  });

  it("binds a redeem code to the first machine that uses it", async () => {
    const t = await setup();
    const { code } = (await t.admin("/v1/admin/issue", { kind: "full" })).body as { code: string };
    const licence = await t.open(
      (await t.call("/v1/licence/redeem", { code, machineHash: machineA })).body,
    );
    expect(licence).toMatchObject({
      kind: "full",
      machineHash: machineA,
      expiresAt: null,
      updatesUntil: null,
    });
    expect((await t.call("/v1/licence/redeem", { code, machineHash: machineB })).status).toBe(400);
    expect((await t.call("/v1/licence/redeem", { code, machineHash: machineA })).status).toBe(200);
  });
});

describe("licence service HTTP surface", () => {
  it("requires the admin token on every admin route", async () => {
    const t = await setup();
    for (const path of [
      "/v1/admin/testers",
      "/v1/admin/feedback",
      "/v1/admin/convert",
      "/v1/admin/issue",
    ]) {
      expect((await t.call(path, {})).status).toBe(401);
      expect(
        (await t.call(path, {}, { authorization: "Bearer wrong-token-of-enough-length-000000" }))
          .status,
      ).toBe(401);
    }
  });

  it("refuses every admin call when the configured token is too short", async () => {
    const t = await setup();
    const handle = createHandler({
      service: t.service,
      adminToken: "short",
      adminPage: { html: "", script: "" },
    });
    const response = await handle(
      new Request("https://licence.test/v1/admin/testers", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer short" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed requests without echoing them", async () => {
    const t = await setup();
    expect(
      (await t.call("/v1/trial/start", { email: "not-an-email", machineHash: machineA })).body,
    ).toEqual({
      error: "invalid_request",
    });
    expect((await t.call("/v1/trial/start", [email])).status).toBe(400);
    expect(
      (
        await t.call("/v1/checkin", {
          licenceId: "../../etc",
          machineHash: machineA,
          nonce: "x".repeat(20),
        })
      ).status,
    ).toBe(400);
    expect((await t.call("/v1/nope", {})).status).toBe(404);
    const plain = await t.handle(
      new Request("https://licence.test/v1/trial/start", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );
    expect(plain.status).toBe(400);
    const get = await t.handle(new Request("https://licence.test/v1/checkin"));
    expect(get.status).toBe(405);
  });

  it("serves the admin page under a strict policy with no inline or HTML-injecting script", async () => {
    const t = await setup();
    const page = await t.handle(new Request("https://licence.test/admin"));
    const policy = page.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    const html = await page.text();
    expect(html).not.toMatch(/<script>|<style|\sstyle=|\son[a-z]+=/i);
    const script = await (await t.handle(new Request("https://licence.test/admin.js"))).text();
    expect(script).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|localStorage|sessionStorage/,
    );
  });
});
