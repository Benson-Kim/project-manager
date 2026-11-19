import { adminHtml, adminScript } from "./admin-page";
import { ed25519Signer, fromBase64Url } from "./crypto";
import { D1Store, type D1Like } from "./d1-store";
import { createHandler } from "./handler";
import type { Mailer } from "./ports";
import { CODE_LIFETIME, LicenceService } from "./service";

interface Env {
  DB: D1Like;
  SIGNING_KEY_PKCS8: string;
  SIGNING_KID: string;
  ADMIN_TOKEN: string;
  ADMIN_READ_TOKEN?: string;
  MAIL_API_KEY: string;
  MAIL_FROM: string;
  MAIL_ENDPOINT?: string;
}

type Handler = (request: Request) => Promise<Response>;

const MAIL_TIMEOUT = 8000;
const PRUNE_AFTER = 2 * 24 * 60 * 60 * 1000;

export function httpMailer(env: Env): Mailer {
  const endpoint = env.MAIL_ENDPOINT ?? "https://api.resend.com/emails";
  if (!endpoint.startsWith("https://")) throw new Error("MAIL_ENDPOINT must use https");
  return {
    async sendCode(email, code) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.MAIL_API_KEY}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(MAIL_TIMEOUT),
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: [email],
          subject: "Your Modulus trial code",
          text: `Your code is ${code}. It expires in ${CODE_LIFETIME / 60_000} minutes. If you did not ask for it, you can ignore this email.`,
        }),
      });
      if (!response.ok) throw new Error(`mail ${response.status}`);
    },
  };
}

async function build(env: Env): Promise<Handler> {
  const signer = await ed25519Signer(env.SIGNING_KID, fromBase64Url(env.SIGNING_KEY_PKCS8));
  const service = new LicenceService({
    store: new D1Store(env.DB),
    mailer: httpMailer(env),
    clock: { now: () => Date.now() },
    signer,
  });
  return createHandler({
    service,
    adminToken: env.ADMIN_TOKEN,
    readToken: env.ADMIN_READ_TOKEN,
    log: (event) => console.log(JSON.stringify(event)),
    adminPage: { html: adminHtml, script: `{const __name=(f)=>f;(${adminScript.toString()})();}` },
  });
}

let ready: Promise<Handler> | undefined;

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    ready ??= build(env).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return (await ready)(request);
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await new D1Store(env.DB).prune(Date.now() - PRUNE_AFTER);
  },
};

export default worker;
