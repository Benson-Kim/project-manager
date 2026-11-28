import { describe, expect, it } from "vitest";
import { adminHtml, adminScript } from "../src/admin-page";
import {
  DOCUMENT_AUDIENCE,
  DOCUMENT_ISSUER,
  ed25519Signer,
  fromBase64Url,
  type SignedDocument,
} from "../src/crypto";
import { createHandler } from "../src/handler";
import { MemoryStore } from "../src/memory-store";
import type { LicenceRecord, Mailer } from "../src/ports";
import {
  CODE_ATTEMPTS,
  CODE_LIFETIME,
  FREE_UPDATES,
  hashEmail,
  LicenceService,
  TRIAL_LENGTH,
} from "../src/service";

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 17);
const machineA = "a".repeat(64);
const machineB = "b".repeat(64);
const email = "tester@example.com";

type Payload = Record<string, unknown>;

async function setup(
  options: { mailer?: Mailer; mailTimeoutMs?: number; readToken?: string } = {},
) {
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
    mailer: options.mailer ?? {
      sendCode: async (to, code) => void sent.push({ email: to, code }),
    },
    clock,
    signer,
    mailTimeoutMs: options.mailTimeoutMs,
  });
  const logged: Record<string, unknown>[] = [];
  const handle = createHandler({
    service,
    adminToken,
    readToken: options.readToken,
    log: (event) => void logged.push(event),
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

  return { clock, sent, store, logged, service, handle, call, admin, open, trial };
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

  it("signs every document with a type, audience and issuer claim", async () => {
    const t = await setup();
    const licence = await t.open((await t.trial()).body);
    expect(licence).toMatchObject({
      typ: "licence",
      aud: DOCUMENT_AUDIENCE,
      iss: DOCUMENT_ISSUER,
    });
    const nonce = "n".repeat(24);
    const checkIn = await t.open(
      (await t.call("/v1/checkin", { licenceId: licence.licenceId, machineHash: machineA, nonce }))
        .body,
    );
    expect(checkIn).toMatchObject({ typ: "checkin", aud: DOCUMENT_AUDIENCE, iss: DOCUMENT_ISSUER });
    expect(await t.open(checkIn.licence)).toMatchObject({ typ: "licence" });
  });

  it("keeps the highest hours used and signs the trial hours limit", async () => {
    const t = await setup();
    const licence = await t.open((await t.trial()).body);
    expect(licence.usageLimitMs).toBe(112 * 60 * 60 * 1000);
    const report = async (usedMs?: number) =>
      t.open(
        (
          await t.call("/v1/checkin", {
            licenceId: licence.licenceId,
            machineHash: machineA,
            nonce: "n".repeat(24),
            ...(usedMs === undefined ? {} : { usedMs }),
          })
        ).body,
      );
    expect((await report(5_000)).usedMs).toBe(5_000);
    expect((await report(1_000)).usedMs).toBe(5_000);
    expect((await report()).usedMs).toBe(5_000);
    const bad = await t.call("/v1/checkin", {
      licenceId: licence.licenceId,
      machineHash: machineA,
      nonce: "n".repeat(24),
      usedMs: -1,
    });
    expect(bad.status).toBe(400);
  });

  it("carries no machine or email hash in the trial_used refusal or in what it logs", async () => {
    const t = await setup();
    await t.trial();
    const refused = await t.trial("other@example.com", machineA);
    expect(refused).toEqual({ status: 409, body: { error: "trial_used" } });
    const everything = JSON.stringify([refused, t.logged, t.store.adminEvents]);
    expect(everything).not.toContain(machineA);
    expect(everything).not.toContain(await hashEmail(email));
    expect(everything).not.toContain(await hashEmail("other@example.com"));
  });

  it("moves a PC holding a full licence to free at its next check-in after the admin converts it", async () => {
    const t = await setup();
    const issued = (await t.admin("/v1/admin/issue", { kind: "full" })).body as {
      licenceId: string;
      code: string;
    };
    const redeemed = await t.open(
      (await t.call("/v1/licence/redeem", { code: issued.code, machineHash: machineA })).body,
    );
    expect(redeemed).toMatchObject({ kind: "full", expiresAt: null, updatesUntil: null });
    expect(
      (await t.admin("/v1/admin/convert", { licenceId: issued.licenceId, kind: "free" })).status,
    ).toBe(200);
    const nonce = "n".repeat(24);
    const reply = await t.open(
      (
        await t.call("/v1/checkin", {
          licenceId: issued.licenceId,
          machineHash: machineA,
          nonce,
        })
      ).body,
    );
    expect(await t.open(reply.licence)).toMatchObject({
      kind: "free",
      machineHash: machineA,
      updatesUntil: START + FREE_UPDATES,
    });
  });

  it("rejects extra fields such as a requested licence kind", async () => {
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
    expect(result).toEqual({ status: 400, body: { error: "invalid_request" } });
    expect((await t.admin("/v1/admin/testers", {})).body.testers).toEqual([]);
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

  it("binds a redeem code to one machine when two redeem it at the same moment", async () => {
    const t = await setup();
    const { code } = (await t.admin("/v1/admin/issue", { kind: "full" })).body as { code: string };
    const replies = await Promise.all(
      [machineA, machineB].map((machineHash) =>
        t.call("/v1/licence/redeem", { code, machineHash }),
      ),
    );
    expect(replies.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = await t.open(replies.find((r) => r.status === 200)?.body);
    const loser = winner.machineHash === machineA ? machineB : machineA;
    expect((await t.call("/v1/licence/redeem", { code, machineHash: loser })).status).toBe(400);
    expect(
      (await t.call("/v1/licence/redeem", { code, machineHash: winner.machineHash })).status,
    ).toBe(200);
  });
});

describe("licence service HTTP surface", () => {
  const health = (t: Awaited<ReturnType<typeof setup>>, method = "GET") =>
    t.handle(new Request("https://licence.test/health", { method }));

  it("answers GET /health with ok and no caching", async () => {
    const t = await setup();
    const response = await health(t);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("refuses other methods on /health", async () => {
    const t = await setup();
    expect((await health(t, "POST")).status).toBe(405);
  });

  it("reports 503 without the database error text when the store fails", async () => {
    const t = await setup();
    t.store.ping = async () => {
      throw new Error("D1_ERROR: no such table: licence");
    };
    const response = await health(t);
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    expect(t.logged).toContainEqual({ event: "health_failed", error: "Error" });
    expect(text + JSON.stringify(t.logged)).not.toContain("no such table");
  });

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

describe("licence service limits and atomicity", () => {
  type Fixture = Awaited<ReturnType<typeof setup>>;

  async function startFor(t: Fixture, address: string, machineHash: string) {
    await t.call("/v1/trial/start", { email: address, machineHash });
    return t.sent.at(-1)?.code ?? "";
  }

  const verify = (t: Fixture, address: string, machineHash: string, code: string) =>
    t.call("/v1/trial/verify", { email: address, machineHash, code });

  it("gives one trial when one email verifies on two machines at the same moment", async () => {
    const t = await setup();
    const codeA = await startFor(t, email, machineA);
    const codeB = await startFor(t, email, machineB);
    const replies = await Promise.all([
      verify(t, email, machineA, codeA),
      verify(t, email, machineB, codeB),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await t.admin("/v1/admin/testers", {})).body.testers).toHaveLength(1);
  });

  it("gives one trial when two emails verify on one machine at the same moment", async () => {
    const t = await setup();
    const other = "other@example.com";
    const first = await startFor(t, email, machineA);
    const second = await startFor(t, other, machineA);
    const replies = await Promise.all([
      verify(t, email, machineA, first),
      verify(t, other, machineA, second),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("keeps blocking a second trial after the first trial is converted", async () => {
    const t = await setup();
    const { licenceId } = await t.open((await t.trial()).body);
    await t.admin("/v1/admin/convert", { licenceId, kind: "free" });
    expect((await t.trial(email, machineB)).status).toBe(409);
    expect((await t.trial("other@example.com", machineA)).status).toBe(409);
  });

  it("refuses a second trial row for a claimed machine or email at the store", async () => {
    const t = await setup();
    const row = (emailHash: string, machineHash: string, id: string): LicenceRecord => ({
      licenceId: id,
      kind: "trial",
      emailHash,
      machineHash,
      issuedAt: START,
      startsAt: START,
      expiresAt: START + TRIAL_LENGTH,
      updatesUntil: null,
      redeemCodeHash: null,
    });
    expect(await t.store.createTrial(row("e1", "m1", "l1"), "a@example.com")).toBe("created");
    expect(await t.store.createTrial(row("e2", "m1", "l2"), "b@example.com")).toBe("conflict");
    expect(await t.store.createTrial(row("e1", "m2", "l3"), "a@example.com")).toBe("conflict");
    expect(await t.store.getLicence("l2")).toBeNull();
    expect(await t.store.getLicence("l3")).toBeNull();
  });

  it("lets the same machine retry with the same code after a failed save", async () => {
    const t = await setup();
    const code = await startFor(t, email, machineA);
    const save = t.store.createTrial.bind(t.store);
    let failing = true;
    t.store.createTrial = async (record, address) => {
      if (failing) throw new Error("storage down");
      return save(record, address);
    };
    expect((await verify(t, email, machineA, code)).status).toBe(500);
    failing = false;
    const retry = await verify(t, email, machineA, code);
    expect(retry.status).toBe(200);
    const again = await verify(t, email, machineA, code);
    expect((await t.open(again.body)).licenceId).toBe((await t.open(retry.body)).licenceId);
  });

  it("counts every wrong guess made at the same moment", async () => {
    const t = await setup();
    const code = await startFor(t, email, machineA);
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 8 }, () => verify(t, email, machineA, wrong)));
    const key = `${await hashEmail(email)}:${machineA}`;
    expect((await t.store.consumeCodeAttempt(key))?.attempts).toBe(9);
    expect((await verify(t, email, machineA, code)).status).toBe(400);
  });

  it("does not give a locked code fresh guesses by asking for another one", async () => {
    const t = await setup();
    const first = await startFor(t, email, machineA);
    const wrong = first === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_ATTEMPTS; i++) await verify(t, email, machineA, wrong);
    const mailsBefore = t.sent.length;
    expect((await t.call("/v1/trial/start", { email, machineHash: machineA })).status).toBe(202);
    expect(t.sent).toHaveLength(mailsBefore);
    expect((await verify(t, email, machineA, first)).status).toBe(400);
    t.clock.at += CODE_LIFETIME + 1;
    const fresh = await startFor(t, email, machineA);
    expect((await verify(t, email, machineA, fresh)).status).toBe(200);
  });

  it("lets a new machine start after one email is used from many others", async () => {
    const t = await setup();
    for (let i = 0; i < 12; i++) {
      const machineHash = i.toString(16).padStart(64, "0");
      expect((await t.call("/v1/trial/start", { email, machineHash })).status).toBe(202);
    }
    expect((await t.call("/v1/trial/start", { email, machineHash: machineB })).status).toBe(202);
  });

  it("rate limits trial starts per client address", async () => {
    const t = await setup();
    const from = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 20; i++) {
      const machineHash = i.toString(16).padStart(64, "1");
      const reply = await t.call(
        "/v1/trial/start",
        { email: `u${i}@example.com`, machineHash },
        from,
      );
      expect(reply.status).toBe(202);
    }
    const late = { email: "late@example.com", machineHash: machineB };
    expect((await t.call("/v1/trial/start", late, from)).status).toBe(429);
    const elsewhere = { "cf-connecting-ip": "203.0.113.10" };
    expect((await t.call("/v1/trial/start", late, elsewhere)).status).toBe(202);
  });

  it("answers within the mail timeout when the mail provider never replies", async () => {
    const t = await setup({
      mailer: { sendCode: () => new Promise<void>(() => {}) },
      mailTimeoutMs: 20,
    });
    const reply = await t.call("/v1/trial/start", { email, machineHash: machineA });
    expect(reply).toEqual({ status: 503, body: { error: "mail_unavailable" } });
  });

  it("reports a failing mail provider as unavailable rather than a server error", async () => {
    const t = await setup({
      mailer: {
        sendCode: async () => {
          throw new Error("mail 500");
        },
      },
    });
    const reply = await t.call("/v1/trial/start", { email, machineHash: machineA });
    expect(reply).toEqual({ status: 503, body: { error: "mail_unavailable" } });
  });

  it("does not let strangers use up a licence allowance", async () => {
    const t = await setup();
    const { licenceId } = await t.open((await t.trial()).body);
    const nonce = "n".repeat(24);
    for (let i = 0; i < 130; i++) {
      await t.call("/v1/checkin", { licenceId, machineHash: machineB, nonce });
    }
    expect((await t.call("/v1/checkin", { licenceId, machineHash: machineA, nonce })).status).toBe(
      200,
    );
  });

  it("rejects unknown fields on public routes", async () => {
    const t = await setup();
    const extra = { extra: 1 };
    expect(
      (await t.call("/v1/trial/start", { email, machineHash: machineA, ...extra })).status,
    ).toBe(400);
    expect(
      (
        await t.call("/v1/licence/redeem", {
          code: "x".repeat(22),
          machineHash: machineA,
          kind: "full",
        })
      ).status,
    ).toBe(400);
  });

  it("sets a locked-down policy on API replies too", async () => {
    const t = await setup();
    const reply = await t.handle(new Request("https://licence.test/v1/nope", { method: "POST" }));
    expect(reply.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(reply.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("licence admin access", () => {
  it("counts wrong tokens, locks the address out after ten, and logs each", async () => {
    const t = await setup();
    const wrong = "w".repeat(40);
    const from = { "cf-connecting-ip": "198.51.100.7", authorization: `Bearer ${wrong}` };
    for (let i = 0; i < 10; i++) {
      expect((await t.call("/v1/admin/testers", {}, from)).status).toBe(401);
    }
    expect((await t.call("/v1/admin/testers", {}, from)).status).toBe(429);
    expect(t.logged.filter((e) => e.event === "admin_denied")).toHaveLength(10);
    expect(t.logged.some((e) => e.event === "admin_blocked")).toBe(true);
    expect(JSON.stringify(t.logged)).not.toContain(wrong);
    const elsewhere = { ...from, "cf-connecting-ip": "198.51.100.8" };
    expect((await t.call("/v1/admin/testers", {}, elsewhere)).status).toBe(401);
  });

  it("answers 401 before 405 so admin routes do not reveal themselves", async () => {
    const t = await setup();
    const reply = await t.handle(new Request("https://licence.test/v1/admin/issue"));
    expect(reply.status).toBe(401);
  });

  it("keeps the read token from minting, and records each admin action", async () => {
    const readToken = "r".repeat(40);
    const t = await setup({ readToken });
    const read = { authorization: `Bearer ${readToken}`, "cf-connecting-ip": "192.0.2.4" };
    expect((await t.call("/v1/admin/testers", {}, read)).status).toBe(200);
    expect((await t.call("/v1/admin/issue", { kind: "full" }, read)).status).toBe(403);
    const minted = await t.admin("/v1/admin/issue", { kind: "full" });
    expect(minted.status).toBe(200);
    expect(t.store.adminEvents.map((e) => [e.action, e.scope])).toEqual([
      ["/v1/admin/testers", "read"],
      ["/v1/admin/issue", "mint"],
    ]);
    expect(JSON.stringify(t.store.adminEvents)).not.toContain(minted.body.code as string);
  });

  it("refuses a read token that is too short", async () => {
    const t = await setup({ readToken: "short" });
    const reply = await t.call("/v1/admin/testers", {}, { authorization: "Bearer short" });
    expect(reply.status).toBe(401);
  });
});
