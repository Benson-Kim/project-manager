import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DB_SERVER: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default("ProjectManager"),
  DB_USER: z.string().min(1).default("pm_web"),
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

/**
 * File storage (ADR-0026). Kept apart from envSchema so the upload handler and
 * the sweep need no database settings to find their folder.
 */
const uploadsEnvSchema = z.object({
  /**
   * Where attachment bytes live, outside the web root: absolute; default
   * `<cwd>/uploads`. Docker sets /app/uploads (a volume); the desktop sets
   * %ProgramData%\Project Manager\Uploads from machine.json. turbopackIgnore:
   * output tracing would otherwise copy the build machine's <cwd>/uploads into
   * the standalone server (the Docker image, the desktop installer).
   */
  UPLOADS_DIR: z
    .string()
    .optional()
    .transform((v) =>
      v && v.trim() ? v.trim() : path.join(/* turbopackIgnore: true */ process.cwd(), "uploads"),
    )
    .refine((v) => path.isAbsolute(v), "UPLOADS_DIR must be an absolute path"),
  /** Uploaded bytes each project may hold; project-less records share one bucket. */
  UPLOADS_QUOTA_MB_PER_PROJECT: z.coerce.number().int().positive().default(2048),
  /**
   * Free space an upload must leave on the uploads disk; 0 turns the check
   * off. The quota is a fair share per project, not a disk guard (ADR-0026 §6),
   * and on the desktop this disk also holds SQL Server's files and backups.
   */
  UPLOADS_MIN_FREE_MB: z.coerce.number().int().min(0).default(2048),
});

export type UploadsEnv = z.infer<typeof uploadsEnvSchema>;

/**
 * False when the deployment switched uploads off with `UPLOADS_ENABLED=false`.
 * The desktop does that on a PC provisioned before F1, whose machine.json has
 * no uploads folder until an administrator runs Repair (ADR-0026 §9). The rest
 * of the app works, locations included; UPLOADS_DIR is then never used.
 * Read on its own, so a page can ask without validating the folder settings.
 */
export function uploadsEnabled(): boolean {
  return process.env.UPLOADS_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * Bytes each project's attachments may take (ADR-0026 §6). Read on its own, so
 * moving a record with attachments never depends on the folder settings.
 */
export function uploadsQuotaBytes(): number {
  const mb = uploadsEnvSchema.shape.UPLOADS_QUOTA_MB_PER_PROJECT.parse(
    process.env.UPLOADS_QUOTA_MB_PER_PROJECT,
  );
  return mb * 1024 * 1024;
}

/** Validated at first use, like getEnv(). */
export function getUploadsEnv(): UploadsEnv {
  return uploadsEnvSchema.parse({
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    UPLOADS_QUOTA_MB_PER_PROJECT: process.env.UPLOADS_QUOTA_MB_PER_PROJECT,
    UPLOADS_MIN_FREE_MB: process.env.UPLOADS_MIN_FREE_MB,
  });
}

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
