import { z } from "zod";

const envSchema = z.object({
  DB_SERVER: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default("ProjectManager"),
  DB_USER: z.string().min(1).default("sa"),
  DB_PASSWORD: z.string().min(8),
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
  });
}
