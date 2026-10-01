import { z } from "zod";

const envSchema = z.object({
  DB_SERVER: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default("ProjectManager"),
  DB_USER: z.string().min(1).default("sa"),
  DB_PASSWORD: z.string().min(8),
  /**
   * How many trusted reverse-proxy hops sit between the internet and this
   * server. `0` (default) = no proxy; use the connection address (or
   * `x-forwarded-for` last entry is absent so fall back to unknown). `1` = one
   * proxy (e.g. Nginx/Caddy) that appends the real client IP; `2` = two hops,
   * etc. The rightmost N addresses in X-Forwarded-For are stripped (they are
   * set by trusted infrastructure); the next one is the real client IP.
   * Never set above the number of proxies you actually control.
   */
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(0),
  /**
   * Set to "true" to trust the SQL Server TLS certificate unconditionally —
   * needed when the bundled Docker service uses the stock self-signed cert
   * (docker-compose + SQL Server image).  Defaults to false, which means only
   * non-production environments trust it.  Never set in production unless a
   * trusted CA cert is mounted instead.
   */
  TRUST_SERVER_CERT: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

/** Validated at first use (not at build time) so `next build` needs no secrets. */
export function getEnv(): Env {
  return envSchema.parse({
    DB_SERVER: process.env.DB_SERVER,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    TRUSTED_PROXY_COUNT: process.env.TRUSTED_PROXY_COUNT,
    TRUST_SERVER_CERT: process.env.TRUST_SERVER_CERT,
  });
}
